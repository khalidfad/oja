/**
 * oja/layout.js
 * Persistent layout shells — nav, sidebar, header, footer — that survive
 * navigation while only the inner content slot is swapped by the router.
 *
 * The key distinction from component.js:
 *   component.mount() tears down and rebuilds on every navigation.
 *   layout.apply()   mounts once and persists until explicitly replaced
 *                    or the layout name changes.
 *
 * This means layout scripts run once, layout state survives page changes,
 * and the browser does not repaint the entire chrome on every route.
 *
 * ─── Typical structure ────────────────────────────────────────────────────────
 *
 *   <body>
 *     <div id="layout">          ← layout shell lives here
 *       <nav>...</nav>
 *       <main id="app"></main>   ← router outlet lives inside the layout
 *       <footer>...</footer>
 *     </div>
 *   </body>
 *
 * ─── Basic usage ──────────────────────────────────────────────────────────────
 *
 *   import { layout } from '../oja/layout.js';
 *
 *   // Mount a layout shell — runs once, persists across navigations
 *   await layout.apply('#layout', 'layouts/main.html', { user });
 *
 *   // The router outlet (#app) now lives inside the layout
 *   router.start('/dashboard');
 *
 * ─── Multiple layouts ─────────────────────────────────────────────────────────
 *
 *   // Switch to a different layout (e.g. for auth pages)
 *   await layout.apply('#layout', 'layouts/auth.html');
 *
 *   // Oja detects the URL has changed and replaces the shell;
 *   // if the same URL is requested again the shell is reused as-is.
 *
 * ─── Updating data without remounting ────────────────────────────────────────
 *
 *   // Re-fill data-bind attributes in the current layout without a full remount.
 *   // Useful for updating the user name in the nav after profile changes.
 *   layout.update({ user: updatedUser });
 *
 * ─── Layout-scoped lifecycle ─────────────────────────────────────────────────
 *
 *   // Inside a layout script — these persist for the lifetime of the layout,
 *   // not just a single page render.
 *   layout.onUnmount(() => closeLayoutWebSocket());
 *
 * ─── Named slots ─────────────────────────────────────────────────────────────
 *
 *   // Inject content into a named slot inside the current layout
 *   // without replacing the whole shell.
 *   await layout.slot('sidebar', Out.c('components/sidebar.html', { items }));
 *   await layout.slot('breadcrumb', Out.h('<a href="/">Home</a> / Hosts'));
 *
 * ─── Router integration ───────────────────────────────────────────────────────
 *
 *   // Use as router middleware to switch layouts per route group
 *   const authGroup = router.Group('/');
 *   authGroup.Use(layout.middleware('layouts/main.html', '#layout'));
 *   authGroup.Get('dashboard', Out.c('pages/dashboard.html'));
 *
 *   const publicGroup = router.Group('/');
 *   publicGroup.Use(layout.middleware('layouts/auth.html', '#layout'));
 *   publicGroup.Get('login', Out.c('pages/login.html'));
 */

import { render, fill }  from './template.js';
import { execScripts }   from './_exec.js';
import { emit }          from './events.js';
import { Out }           from './out.js';

// ─── State ────────────────────────────────────────────────────────────────────

// Tracks the active layout per container element so switching layouts or
// containers does not accidentally reuse a stale shell.
const _active = new Map(); // containerEl → { url, el, unmountHooks }

// ─── Public API ───────────────────────────────────────────────────────────────

export const layout = {

    /**
     * Mount a layout shell into a container — or reuse it if the same URL
     * is already mounted.
     *
     * @param {string|Element} target  — CSS selector or DOM element for the shell container
     * @param {string}         url     — path to the layout .html file
     * @param {Object}         data    — data passed to {{interpolation}} in the layout
     * @returns {Promise<Element>}     — the layout container element
     */
    async apply(target, url, data = {}) {
        const container = _resolve(target);
        if (!container) return null;

        const current = _active.get(container);

        // Reuse the existing shell if the same layout URL is already mounted.
        // This is the core behaviour that makes layouts different from components —
        // navigating between routes under the same layout does not re-render
        // the chrome, preventing flicker and preserving layout-level state.
        if (current && current.url === url) {
            if (Object.keys(data).length > 0) fill(container, data);
            return container;
        }

        // A different layout is being requested — tear down the old one first.
        if (current) {
            await _teardown(container);
        }

        const html = await _fetchLayout(url);
        container.innerHTML = render(html, data);
        fill(container, data);

        // Track the mounted layout before executing scripts so that layout
        // scripts that call layout.onUnmount() register against the right entry.
        _active.set(container, { url, unmountHooks: [] });
        _currentContainer = container;

        execScripts(container, url);

        _currentContainer = null;

        emit('layout:mounted', { url, container });

        return container;
    },

    /**
     * Re-fill data-bind attributes in the current layout without remounting.
     * Use when reactive data changes (e.g. user profile update) and you want
     * the layout chrome to reflect the new values immediately.
     *
     * @param {string|Element} target — layout container (defaults to last applied)
     * @param {Object}         data   — new data to fill
     */
    update(target, data = {}) {
        // If called with only a data object (no target), apply to the last container
        if (target && typeof target === 'object' && !(target instanceof Element) && !_isSelector(target)) {
            data    = target;
            target  = _lastContainer();
        }

        const container = _resolve(target);
        if (!container || !_active.has(container)) return this;

        fill(container, data);
        emit('layout:updated', { container });
        return this;
    },

    /**
     * Render an Out into a named slot inside the current layout.
     * The slot is identified by a [data-slot="name"] attribute.
     *
     *   // Layout HTML:
     *   // <aside data-slot="sidebar"></aside>
     *
     *   await layout.slot('sidebar', Out.c('components/sidebar.html', { items }));
     *
     * @param {string}         name      — slot name (matches data-slot attribute)
     * @param {Out}            content   — an Out instance to render into the slot
     * @param {string|Element} [target]  — layout container (defaults to last applied)
     */
    async slot(name, content, target) {
        const container = _resolve(target) || _lastContainer();
        if (!container) {
            console.warn('[oja/layout] slot() called but no layout is mounted');
            return this;
        }

        const slotEl = container.querySelector(`[data-slot="${name}"]`);
        if (!slotEl) {
            console.warn(`[oja/layout] slot "${name}" not found in layout`);
            return this;
        }

        if (Out.is(content)) {
            await content.render(slotEl, {});
        } else if (typeof content === 'string') {
            slotEl.innerHTML = content;
        } else {
            console.warn(`[oja/layout] slot() content must be an Out or HTML string`);
        }

        emit('layout:slot', { name, container });
        return this;
    },

    /**
     * Register a function to run when the layout is replaced or explicitly unmounted.
     * Call from inside a layout script — works the same way as component.onUnmount()
     * but is scoped to the layout shell lifetime, not the page lifetime.
     *
     *   // Inside layouts/main.html <script type="module">:
     *   const ws = new WebSocket('/live');
     *   layout.onUnmount(() => ws.close());
     */
    onUnmount(fn) {
        if (!_currentContainer) {
            console.warn('[oja/layout] onUnmount() called outside a layout script');
            return this;
        }
        const entry = _active.get(_currentContainer);
        if (entry) entry.unmountHooks.push(fn);
        return this;
    },

    /**
     * Explicitly unmount the current layout from a container and run teardown hooks.
     *
     * @param {string|Element} [target] — layout container (defaults to last applied)
     */
    async unmount(target) {
        const container = _resolve(target) || _lastContainer();
        if (!container) return this;
        await _teardown(container);
        container.innerHTML = '';
        return this;
    },

    /**
     * Returns the URL of the currently mounted layout for a container.
     *
     * @param {string|Element} [target] — layout container (defaults to last applied)
     */
    current(target) {
        const container = _resolve(target) || _lastContainer();
        if (!container) return null;
        return _active.get(container)?.url || null;
    },

    /**
     * Returns true if a layout is currently mounted in the given container.
     */
    isMounted(target) {
        const container = _resolve(target) || _lastContainer();
        return container ? _active.has(container) : false;
    },

    /**
     * Router middleware factory — switches layouts automatically per route group.
     * Only remounts if the layout URL has changed, so navigation within a group
     * that shares a layout does not re-render the chrome.
     *
     *   const app = router.Group('/');
     *   app.Use(layout.middleware('layouts/main.html', '#layout'));
     *
     * @param {string} url       — layout HTML file path
     * @param {string} container — CSS selector for the layout container
     * @param {Object} [data]    — static data merged with ctx for the layout
     */
    middleware(url, container, data = {}) {
        return async (ctx, next) => {
            await layout.apply(container, url, { ...data, ...ctx });
            await next();
        };
    },
};

// ─── Internal state ───────────────────────────────────────────────────────────

// Set while execScripts() is running during apply() so onUnmount() knows
// which container's entry to register against.
let _currentContainer = null;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const _htmlCache = new Map(); // url → html

async function _fetchLayout(url) {
    if (_htmlCache.has(url)) return _htmlCache.get(url);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`[oja/layout] failed to load: ${url} (${res.status})`);

    const html = await res.text();
    _htmlCache.set(url, html);
    return html;
}

async function _teardown(container) {
    const entry = _active.get(container);
    if (!entry) return;

    for (const fn of entry.unmountHooks) {
        try { await fn(); } catch (e) {
            console.warn('[oja/layout] onUnmount hook error:', e);
        }
    }

    _active.delete(container);
    emit('layout:unmounted', { url: entry.url, container });
}

function _lastContainer() {
    if (_active.size === 0) return null;
    // Return the most recently applied container
    const keys = Array.from(_active.keys());
    return keys[keys.length - 1];
}

function _resolve(target) {
    if (!target) return null;
    if (target instanceof Element) return target;
    if (typeof target === 'string') {
        const el = document.querySelector(target);
        if (!el) console.warn(`[oja/layout] container not found: ${target}`);
        return el;
    }
    return null;
}

function _isSelector(value) {
    return typeof value === 'string';
}