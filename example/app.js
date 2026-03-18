/**
 * app.js — Oja example application entry point
 *
 * This file demonstrates everything in one place:
 *   - Router setup with Go-style groups and middleware
 *   - Auth levels + session lifecycle hooks
 *   - Api instance with hooks for logging
 *   - Adapter registration (D3 simulation)
 *   - Debug + logger setup
 *   - notify.on() for event-driven banners
 *   - store for persistent state
 *
 * Notice: no framework code here — only wiring.
 * The actual HTML lives in pages/*.html and components/*.html
 */

// ── Import mock API first — intercepts fetch before anything else ─────────────
import './mock/api.js';

// ── Oja imports ───────────────────────────────────────────────────────────────
import { Router }   from '../src/js/router.js';
import { Responder } from '../src/js/responder.js';
import { auth }     from '../src/js/auth.js';
import { Api }      from '../src/js/api.js';
import { notify }   from '../src/js/notify.js';
import { modal }    from '../src/js/modal.js';
import { logger }   from '../src/js/logger.js';
import { debug }    from '../src/js/debug.js';
import { adapter }  from '../src/js/adapter.js';
import { on, listen } from '../src/js/events.js';

import { Store } from '../src/js/store.js';

// ── Debug — enable in console with: window._debug.enable('*') ────────────────
debug.enable('router,auth,api');
window._debug = debug;  // accessible from browser console

// ── Logger ────────────────────────────────────────────────────────────────────
logger.setLevel('DEBUG');

// ── Persistent store ──────────────────────────────────────────────────────────
export const store  = new Store('oja-example');
export const secure = new Store('oja-example-secure', { encrypt: true });



// ── API client ────────────────────────────────────────────────────────────────
export const api = new Api({ base: '' });

// Log every request via logger
api.beforeRequest((path, method) => {
    logger.debug('api', `${method} ${path}`);
});
api.afterResponse((path, method, res, ms) => {
    if (ms > 300) logger.warn('api', `Slow response: ${method} ${path}`, { ms });
    else          logger.debug('api', `${method} ${path} → ${res?.status}`, { ms });
});
api.onOffline(() => {
    notify.banner('⚠️ Connection lost. Reconnecting...', { type: 'warn' });
    logger.warn('api', 'Connection lost');
});
api.onOnline(() => {
    notify.dismissBanner();
    notify.success('Reconnected');
    logger.info('api', 'Connection restored');
});

// ── Adapter — register D3 simulation (real D3 would be: adapter.register('d3', d3)) ──
adapter.register('chart', {
    // Minimal chart simulator — draws a bar chart using Canvas API
    draw(canvas, data, opts = {}) {
        if (!canvas) return;
        const ctx  = canvas.getContext('2d');
        const w    = canvas.width;
        const h    = canvas.height;
        const max  = Math.max(...data, 1);
        const barW = (w / data.length) - 2;

        ctx.clearRect(0, 0, w, h);
        data.forEach((val, i) => {
            const barH   = (val / max) * (h - 20);
            const x      = i * (barW + 2);
            const y      = h - barH;
            const pct    = val / max;
            ctx.fillStyle = pct > 0.8 ? '#e74c3c' : pct > 0.5 ? '#f39c12' : '#2ecc71';
            ctx.fillRect(x, y, barW, barH);
        });

        if (opts.label) {
            ctx.fillStyle = '#888';
            ctx.font      = '10px monospace';
            ctx.fillText(opts.label, 4, 12);
        }
    }
});
logger.info('app', 'Adapter registered: chart');

// ── Auth setup ────────────────────────────────────────────────────────────────
auth.level('protected', () => auth.session.isActive());
auth.level('admin',     () => auth.session.isActive() && auth.hasRole('admin'));
auth.level('auditor',   () => auth.session.isActive() && auth.hasRole('auditor'));

auth.session.OnStart(async (token) => {
    api.setToken(token);
    const user = auth.session.user();
    document.getElementById('nav-user').textContent = user?.name || 'User';
    document.getElementById('navbar').style.display = '';
    logger.info('auth', 'Session started', { user: user?.name });

    // Navigate to intended page or dashboard
    const dest = auth.session.intendedPath() || '/dashboard';
    auth.session.clearIntendedPath();
    router.navigate(dest);
});

auth.session.OnRenew((newToken) => {
    api.setToken(newToken);
    notify.info('Session renewed');
    logger.info('auth', 'Session renewed');
});

auth.session.OnExpiry(() => {
    document.getElementById('navbar').style.display = 'none';
    notify.warn('Session expired — please sign in again');
    logger.warn('auth', 'Session expired');
    router.navigate('/login');
});

// ── Router setup ──────────────────────────────────────────────────────────────
export const router = new Router({ mode: 'hash', outlet: '#app' });

// Global middleware — timing every navigation
router.Use(async (ctx, next) => {
    const t = Date.now();
    await next();
    logger.debug('router', `Navigate ${ctx.path}`, { ms: Date.now() - t });
});

// Global error boundary — catches render errors
router.Use(Router.middleware.errorBoundary(
    Responder.component('components/error.html')
));

// Page title updater
router.afterEach(Router.middleware.pageTitle('Oja Example'));
router.afterEach(Router.middleware.scrollTop);

// Public routes
router.Get('/login', Responder.component('pages/login.html'));

// Protected group — auth.middleware checks auth.level('protected')
const app = router.Group('/');
app.Use(auth.middleware('protected', '/login'));

app.Get('dashboard', Responder.component('pages/dashboard.html'));
app.Get('firewall',  Responder.component('pages/firewall.html'));
app.Get('logs',      Responder.component('pages/logs.html'));
app.Get('settings',  Responder.component('pages/settings.html'));

// Hosts group — nested routes with URL params
app.Route('hosts', hosts => {
    hosts.Get('/', Responder.component('pages/hosts.html'));

    hosts.Route('{id}', host => {
        // Loader middleware — attaches host data to ctx before rendering
        host.Use(async (ctx, next) => {
            ctx.host = await api.get(`/api/hosts/${ctx.params.id}`);
            if (!ctx.host) {
                return ctx.redirect('/hosts');
            }
            await next();
        });
        host.Get('/', Responder.fn(async (container, ctx) => {
            return Responder.component('pages/host-detail.html', ctx.host);
        }));
    });
});

// Not found
router.NotFound(Responder.component('components/error.html', {
    title: '404',
    message: 'Page not found'
}));

// ── UI event bindings ─────────────────────────────────────────────────────────

on('#logout-btn', 'click', async () => {
    const confirmed = await modal.confirm('Sign out of Oja Example?');
    if (!confirmed) return;
    await auth.session.end();
    api.clearAuth();
    document.getElementById('navbar').style.display = 'none';
    notify.info('Signed out');
    router.navigate('/login');
});

on('#debug-btn', 'click', () => {
    debug.dump();
    notify.info('Debug timeline dumped to console');
});

// ── Listen for API events ─────────────────────────────────────────────────────
notify.on('api:unauthorized', () => {
    notify.warn('Session expired');
    router.navigate('/login');
});

// ── Start ─────────────────────────────────────────────────────────────────────
logger.info('app', 'Oja example starting');
router.start('/login');