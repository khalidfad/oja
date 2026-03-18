/**
 * oja/router.js
 * SPA navigation — Go-style middleware, groups, and Responder-based rendering.
 *
 * The power of this router is Use() and Group():
 *   Use()   → middleware applied to all routes below it
 *   Group() → scoped sub-router with its own middleware stack
 *
 * Middleware signature: async (ctx, next) => { ... await next(); ... }
 * Returning false stops the chain. Modifying ctx passes data downstream.
 *
 * ─── Basic usage ──────────────────────────────────────────────────────────────
 *
 *   import { Router } from '../oja/router.js';
 *   import { Responder } from '../oja/responder.js';
 *
 *   const r = new Router({ mode: 'hash', outlet: '#app' });
 *
 *   // Global middleware — runs on every route
 *   r.Use(async (ctx, next) => {
 *       console.time(ctx.path);
 *       await next();
 *       console.timeEnd(ctx.path);
 *   });
 *
 *   // Public routes
 *   r.Get('/login',  Responder.component('pages/login.html'));
 *   r.Get('/about',  Responder.component('pages/about.html'));
 *
 *   // Protected group — middleware applied to all routes inside
 *   const admin = r.Group('/admin');
 *   admin.Use(requireAuth);
 *   admin.Use(auditLog);
 *
 *   admin.Get('/',       Responder.component('pages/admin/dashboard.html'));
 *   admin.Get('/hosts',  Responder.component('pages/admin/hosts.html'));
 *   admin.Get('/logs',   Responder.component('pages/admin/logs.html'));
 *
 *   // Nested group with URL params
 *   admin.Route('/hosts/{id}', host => {
 *       host.Use(loadHostMiddleware);
 *       host.Get('/',        Responder.component('pages/hosts/detail.html'));
 *       host.Get('/metrics', Responder.component('pages/hosts/metrics.html'));
 *   });
 *
 *   // Chain of responsibility on a single route
 *   r.Get('/audit', [requireAuth, requireAuditor, auditLog,
 *       Responder.component('pages/audit.html')
 *   ]);
 *
 *   // Error + not found
 *   r.NotFound(Responder.component('pages/404.html'));
 *   r.Error(Responder.component('pages/error.html'));
 *
 *   r.start('/login');  // default route if URL has none
 *
 * ─── Middleware pattern ────────────────────────────────────────────────────────
 *
 *   // Wrap — do work before AND after the route renders (like Go's middleware)
 *   r.Use(async (ctx, next) => {
 *       ctx.startTime = Date.now();
 *       await next();
 *       logger.info('router', `${ctx.path} rendered in ${Date.now() - ctx.startTime}ms`);
 *   });
 *
 *   // Guard — stop the chain, redirect
 *   const requireAuth = async (ctx, next) => {
 *       if (!auth.session.isActive()) {
 *           ctx.redirect('/login');
 *           return; // do not call next()
 *       }
 *       await next();
 *   };
 *
 *   // Loader — attach data to ctx before render
 *   const loadHost = async (ctx, next) => {
 *       ctx.host = await api.get(`/hosts/${ctx.params.id}`);
 *       await next();
 *   };
 *
 *   // Error boundary
 *   r.Use(async (ctx, next) => {
 *       try {
 *           await next();
 *       } catch (err) {
 *           await Responder.component('pages/error.html', { error: err.message })
 *               .render(document.querySelector(ctx.outlet));
 *       }
 *   });
 */

import { Store } from './store.js';
import { Responder } from './responder.js';

const _store = new Store('oja:router');

// ─── Route trie node ──────────────────────────────────────────────────────────

class _RouteNode {
    constructor(segment = '') {
        this.segment    = segment;
        this.responder  = null;       // Responder instance
        this.middleware = [];         // middleware declared at this node
        this.children   = new Map();  // static children: segment → node
        this.paramChild = null;       // single param child node
        this.paramName  = null;       // name of the param (e.g. 'id')
    }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export class Router {
    constructor({ mode = 'hash', outlet = '#app' } = {}) {
        this._mode              = mode;
        this._outlet            = outlet;
        this._root              = new _RouteNode();
        this._globalMiddleware  = [];   // middleware for this scope
        this._notFound          = Responder.html('<div class="oja-404"><h2>404</h2><p>Page not found</p></div>');
        this._errorResponder    = Responder.html('<div class="oja-error"><h2>Error</h2><p>Something went wrong</p></div>');
        this._current           = null;
        this._currentNode       = null;
        this._params            = {};
        this._started           = false;
        this._beforeEach        = [];   // global before hooks
        this._afterEach         = [];   // global after hooks
    }

    // ─── Middleware ───────────────────────────────────────────────────────────

    /**
     * Add middleware to this router/group scope.
     * Middleware runs in order before the route's Responder renders.
     * async (ctx, next) => { ... await next(); ... }
     */
    Use(...middlewares) {
        // Flatten arrays — allows r.Use([mw1, mw2]) or r.Use(mw1, mw2)
        for (const mw of middlewares.flat()) {
            if (typeof mw === 'function') {
                this._globalMiddleware.push(mw);
            }
        }
        return this;
    }

    // ─── Global hooks ─────────────────────────────────────────────────────────

    /** Called before every navigation — fn(ctx) */
    beforeEach(fn) {
        this._beforeEach.push(fn);
        return this;
    }

    /** Called after every navigation — fn(ctx) */
    afterEach(fn) {
        this._afterEach.push(fn);
        return this;
    }

    // ─── Route registration ───────────────────────────────────────────────────

    /**
     * Register a GET route (browser navigation — all SPA routes are GET).
     *
     * responderOrChain can be:
     *   - A Responder instance
     *   - An array: [...middleware, Responder]  — route-local middleware chain
     */
    Get(pattern, responderOrChain) {
        const { responder, middleware } = _unwrapChain(responderOrChain);
        this._addRoute(pattern, responder, middleware);
        return this;
    }

    /**
     * Not found handler — shown when no route matches.
     */
    NotFound(responder) {
        this._notFound = responder;
        return this;
    }

    /**
     * Error handler — shown when a middleware or render throws.
     */
    Error(responder) {
        this._errorResponder = responder;
        return this;
    }

    // ─── Grouping ─────────────────────────────────────────────────────────────

    /**
     * Create a scoped sub-router at a path prefix.
     * The group inherits parent middleware and can add its own.
     *
     *   const admin = r.Group('/admin');
     *   admin.Use(requireAuth);
     *   admin.Get('/', Responder.component('dashboard.html'));
     *
     * Optional callback style:
     *   r.Group('/admin', admin => {
     *       admin.Use(requireAuth);
     *       admin.Get('/', Responder.component('dashboard.html'));
     *   });
     */
    Group(prefix, fn) {
        const groupRoot   = this._findOrCreate(prefix);
        const group       = new Router({ mode: this._mode, outlet: this._outlet });
        group._root       = groupRoot;
        // Group inherits parent middleware — its own Use() adds on top
        group._globalMiddleware = [...this._globalMiddleware];
        group._notFound   = this._notFound;
        group._errorResponder = this._errorResponder;

        if (fn) fn(group);
        return group;
    }

    /**
     * Register a nested route block — used for URL param segments.
     *
     *   admin.Route('/hosts/{id}', host => {
     *       host.Use(loadHost);
     *       host.Get('/',        Responder.component('detail.html'));
     *       host.Get('/metrics', Responder.component('metrics.html'));
     *   });
     */
    Route(pattern, fn) {
        const node      = this._findOrCreate(pattern);
        const sub       = new Router({ mode: this._mode, outlet: this._outlet });
        sub._root       = node;
        sub._globalMiddleware = [...this._globalMiddleware];
        sub._notFound   = this._notFound;
        sub._errorResponder = this._errorResponder;
        fn(sub);
        return this;
    }

    // ─── Trie operations ──────────────────────────────────────────────────────

    _addRoute(pattern, responder, routeMiddleware = []) {
        const node = this._findOrCreate(pattern);
        node.responder  = responder;
        // Route-local middleware stored on the node
        node.middleware = [...this._globalMiddleware, ...routeMiddleware];
    }

    _findOrCreate(pattern) {
        const segments = _segments(pattern);
        let   node     = this._root;

        for (const seg of segments) {
            if (seg.startsWith('{') && seg.endsWith('}')) {
                // Param segment
                if (!node.paramChild) {
                    node.paramChild           = new _RouteNode(seg);
                    node.paramChild.paramName = seg.slice(1, -1);
                }
                node = node.paramChild;
            } else {
                if (!node.children.has(seg)) {
                    node.children.set(seg, new _RouteNode(seg));
                }
                node = node.children.get(seg);
            }
        }
        return node;
    }

    // ─── Route matching ───────────────────────────────────────────────────────

    _match(pathname) {
        const parts      = _segments(pathname);
        const params     = {};
        let   node       = this._root;
        const middleware = [];

        for (const part of parts) {
            if (node.children.has(part)) {
                node = node.children.get(part);
            } else if (node.paramChild) {
                node = node.paramChild;
                params[node.paramName] = decodeURIComponent(part);
            } else {
                return null; // no match
            }

            if (node.middleware.length) {
                middleware.push(...node.middleware);
            }
        }

        if (!node.responder) return null;

        return { responder: node.responder, params, middleware };
    }

    // ─── Start ────────────────────────────────────────────────────────────────

    /**
     * Start the router — reads current URL, sets up history listeners.
     * @param {string} defaultPath — navigate here if URL has no path
     */
    async start(defaultPath = '/') {
        if (this._started) return;
        this._started = true;

        const eventName = this._mode === 'hash' ? 'hashchange' : 'popstate';
        window.addEventListener(eventName, () => this._handleURL(defaultPath));

        await this._handleURL(defaultPath);
    }

    async _handleURL(defaultPath = '/') {
        const { path, query } = this._parseURL();
        await this.navigate(path || defaultPath, { query });
    }

    // ─── Navigation ───────────────────────────────────────────────────────────

    /**
     * Navigate to a path — updates URL, runs middleware chain, renders Responder.
     */
    async navigate(path, options = {}) {
        const [pathname, qs]  = path.split('?');
        const query           = { ...options.query, ..._parseQuery(qs || '') };

        // Push URL (unless replace mode)
        if (!options._replace) {
            this._pushURL(pathname, query);
        }

        const match = this._match(pathname);

        // Build context — available to every middleware and Responder
        const ctx = {
            path:     pathname,
            params:   {},
            query,
            outlet:   this._outlet,
            redirect: (to, opts) => this.navigate(to, opts),
            replace:  (to, opts) => this.navigate(to, { ...opts, _replace: true }),
        };

        if (!match) {
            for (const fn of this._beforeEach) await fn(ctx);
            await this._render(this._notFound, ctx);
            for (const fn of this._afterEach) await fn(ctx);
            return;
        }

        ctx.params = { ...match.params, ...query };

        // Run beforeEach hooks
        for (const fn of this._beforeEach) {
            const stop = await fn(ctx);
            if (stop === false) return;
        }

        // Build and run the onion middleware chain
        const allMiddleware = [...this._globalMiddleware, ...match.middleware];

        // Deduplicate — groups can inherit parent middleware causing duplicates
        const seen = new Set();
        const chain = allMiddleware.filter(mw => {
            if (seen.has(mw)) return false;
            seen.add(mw);
            return true;
        });

        let stopped = false;

        const runChain = async (index) => {
            if (index >= chain.length) return;
            const mw = chain[index];
            let nextCalled = false;

            const next = async () => {
                nextCalled = true;
                await runChain(index + 1);
            };

            const result = await mw(ctx, next);

            // If middleware returned false or didn't call next — stop chain
            if (result === false) {
                stopped = true;
                return;
            }

            // If middleware returned a Responder — render it and stop
            if (Responder.is(result)) {
                await this._render(result, ctx);
                stopped = true;
                return;
            }

            // Middleware returned an object — merge into ctx
            if (result && typeof result === 'object' && !nextCalled) {
                Object.assign(ctx, result);
                await runChain(index + 1);
            }
        };

        try {
            await runChain(0);
        } catch (err) {
            console.error('[oja/router] middleware chain error:', err);
            await this._render(this._errorResponder, { ...ctx, error: err });
            return;
        }

        if (stopped) return;

        // Update state
        this._current = pathname;
        this._params  = ctx.params;
        _store.set('page', pathname);
        _store.set('params', ctx.params);

        // Render the matched Responder
        try {
            await this._render(match.responder, ctx);
        } catch (err) {
            console.error('[oja/router] render error:', err);
            await this._render(this._errorResponder, { ...ctx, error: err });
            return;
        }

        // Update nav + store
        this._updateNav(pathname);

        // Run afterEach hooks
        for (const fn of this._afterEach) await fn(ctx);

        // Notify listeners
        document.dispatchEvent(new CustomEvent('oja:navigate', {
            detail: { path: pathname, params: ctx.params }
        }));
    }

    async _render(responder, ctx) {
        const container = document.querySelector(this._outlet);
        if (!container) {
            console.error(`[oja/router] outlet not found: ${this._outlet}`);
            return;
        }

        // Page leave animation
        container.classList.add('oja-leaving');
        await _wait(150);
        container.classList.remove('oja-leaving');

        container.innerHTML = '';
        await responder.render(container, ctx);

        // Page enter animation
        container.classList.add('oja-entering');
        await _wait(50);
        container.classList.remove('oja-entering');
    }

    /**
     * Go back in browser history.
     */
    back() {
        window.history.back();
    }

    /**
     * Force re-render the current route — re-runs full middleware chain.
     */
    async refresh() {
        if (!this._current) return;
        await this.navigate(this._current, { query: this._params, _replace: true });
    }

    /**
     * Navigate without adding a history entry.
     */
    async replace(path, options = {}) {
        await this.navigate(path, { ...options, _replace: true });
    }

    // ─── State ────────────────────────────────────────────────────────────────

    current() { return this._current; }
    params()  { return { ...this._params }; }

    // ─── URL helpers ──────────────────────────────────────────────────────────

    _parseURL() {
        if (this._mode === 'hash') {
            const hash  = window.location.hash.slice(1) || '';
            const [path, qs] = hash.split('?');
            return { path: path || '', query: _parseQuery(qs || '') };
        } else {
            const path = window.location.pathname;
            const qs   = window.location.search.slice(1);
            return { path: path || '/', query: _parseQuery(qs) };
        }
    }

    _buildURL(path, params = {}) {
        const qs = _buildQuery(params);
        if (this._mode === 'hash') {
            return '#' + path + (qs ? '?' + qs : '');
        }
        return path + (qs ? '?' + qs : '');
    }

    _pushURL(path, params = {}) {
        const url = this._buildURL(path, params);
        if (window.location.href !== new URL(url, window.location.href).href) {
            window.history.pushState({ path, params }, '', url);
        }
    }

    _updateNav(path) {
        document.querySelectorAll('[data-page]').forEach(el => {
            el.classList.toggle('active', el.dataset.page === path);
        });
        document.querySelectorAll('[data-href]').forEach(el => {
            el.classList.toggle('active', el.dataset.href === path);
        });
    }
}

// ─── Built-in middleware ──────────────────────────────────────────────────────

/**
 * Timing middleware — logs render time for every route.
 *
 *   r.Use(Router.middleware.timing);
 */
Router.middleware = {

    timing: async (ctx, next) => {
        const t = Date.now();
        await next();
        console.debug(`[oja/router] ${ctx.path} — ${Date.now() - t}ms`);
    },

    /**
     * Error boundary — catches errors in the chain and renders error Responder.
     * Pass your error Responder as the argument.
     *
     *   r.Use(Router.middleware.errorBoundary(
     *       Responder.component('pages/error.html')
     *   ));
     */
    errorBoundary: (errorResponder) => async (ctx, next) => {
        try {
            await next();
        } catch (err) {
            ctx.error = err;
            const container = document.querySelector(ctx.outlet);
            if (container) await errorResponder.render(container, ctx);
        }
    },

    /**
     * Scroll to top after every navigation.
     *
     *   r.afterEach(Router.middleware.scrollTop);
     */
    scrollTop: async () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    /**
     * Page title updater — reads data-title from the rendered page's first element.
     *
     *   r.afterEach(Router.middleware.pageTitle('My App'));
     */
    pageTitle: (appName = '') => async (ctx) => {
        const container = document.querySelector(ctx.outlet);
        const title = container?.querySelector('[data-title]')?.dataset?.title;
        document.title = title ? `${title} — ${appName}` : appName;
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _segments(path) {
    return path.split('/').filter(Boolean);
}

function _unwrapChain(responderOrChain) {
    if (Array.isArray(responderOrChain)) {
        const last = responderOrChain[responderOrChain.length - 1];
        const middleware = responderOrChain.slice(0, -1);
        return { responder: last, middleware };
    }
    return { responder: responderOrChain, middleware: [] };
}

function _parseQuery(qs = '') {
    if (!qs) return {};
    return Object.fromEntries(new URLSearchParams(qs).entries());
}

function _buildQuery(params = {}) {
    const entries = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '');
    return entries.length ? new URLSearchParams(entries).toString() : '';
}

function _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}