/**
 * oja/auth.js
 * Session management, token security, and route protection.
 * Works unchanged across web and mobile — storage cascade handles environment.
 *
 * ─── Setup (once in app.js) ───────────────────────────────────────────────────
 *
 *   import { auth } from '../oja/auth.js';
 *
 *   // Define protection levels
 *   auth.level('protected', () => auth.session.isActive());
 *   auth.level('admin',     () => auth.session.isActive() && auth.hasRole('admin'));
 *   auth.level('auditor',   () => auth.session.isActive() && auth.hasRole('auditor'));
 *
 *   // Session lifecycle hooks
 *   auth.session.OnStart(() => {
 *       api.setToken(auth.session.token());
 *       router.navigate('dashboard');
 *   });
 *
 *   auth.session.OnRenew((newToken) => {
 *       api.setToken(newToken);
 *       notify.info('Session renewed');
 *   });
 *
 *   auth.session.OnExpiry(() => {
 *       notify.warn('Session expired');
 *       router.navigate('login');
 *   });
 *
 * ─── Router integration ───────────────────────────────────────────────────────
 *
 *   // Auth levels plug directly into router middleware
 *   const r = new Router({ mode: 'hash', outlet: '#app' });
 *
 *   const protected = auth.middleware('protected');
 *   const admin     = auth.middleware('admin');
 *
 *   r.Get('/login',     Responder.component('pages/login.html'));
 *   r.Get('/dashboard', [protected, Responder.component('pages/dashboard.html')]);
 *
 *   const adminGroup = r.Group('/admin');
 *   adminGroup.Use(admin);
 *   adminGroup.Get('/', Responder.component('pages/admin.html'));
 *
 * ─── Login / logout ───────────────────────────────────────────────────────────
 *
 *   // After successful API login:
 *   await auth.session.start(jwt);
 *
 *   // Logout:
 *   auth.session.end();
 *   router.navigate('login');
 *
 * ─── Reading session data ─────────────────────────────────────────────────────
 *
 *   auth.session.isActive()    // → true/false
 *   auth.session.token()       // → raw JWT string
 *   auth.session.user()        // → decoded JWT payload
 *   auth.session.expiresIn()   // → ms until expiry
 *   auth.hasRole('admin')      // → true/false
 *   auth.hasClaim('sub', '42') // → true/false
 */

import { Store } from './store.js';
import { emit, listen } from './events.js';

// ─── Token storage ────────────────────────────────────────────────────────────
// Cascade: sessionStorage (encrypted) → localStorage (encrypted) → memory
// Encrypted store — tokens never stored in plaintext

const _tokenStore = new Store('oja:auth', { encrypt: true, prefer: 'session' });
const _metaStore  = new Store('oja:auth:meta'); // non-sensitive session metadata

// ─── Level registry ───────────────────────────────────────────────────────────

const _levels = new Map(); // name → () => bool

// ─── Session state ────────────────────────────────────────────────────────────

let _expiryTimer    = null;
let _warningTimer   = null;
let _onStartHooks   = [];
let _onRenewHooks   = [];
let _onExpiryHooks  = [];

// ─── Public API ───────────────────────────────────────────────────────────────

export const auth = {

    /**
     * Define a named protection level.
     * The check function is called synchronously before every protected route.
     *
     *   auth.level('protected', () => auth.session.isActive());
     *   auth.level('admin',     () => auth.session.isActive() && auth.hasRole('admin'));
     */
    level(name, checkFn) {
        _levels.set(name, checkFn);
        return this;
    },

    /**
     * Returns a router middleware function for a named protection level.
     * On failure: stores the intended destination and redirects to login.
     *
     *   adminGroup.Use(auth.middleware('admin'));
     */
    middleware(levelName, redirectTo = '/login') {
        return async (ctx, next) => {
            const check = _levels.get(levelName);
            if (!check) {
                console.warn(`[oja/auth] unknown level: "${levelName}"`);
                await next();
                return;
            }

            if (!check()) {
                // Save where the user was trying to go
                _metaStore.set('intendedPath',   ctx.path);
                _metaStore.set('intendedParams', ctx.params);

                ctx.redirect(redirectTo);
                return; // do not call next()
            }

            await next();
        };
    },

    /**
     * Check if a named level passes right now.
     * Useful in app code outside of routing.
     *
     *   if (auth.guard('admin')) showAdminMenu();
     */
    guard(levelName) {
        const check = _levels.get(levelName);
        return check ? check() : false;
    },

    /**
     * Check if the current user has a JWT role claim.
     * Works with both string roles and array roles.
     *
     *   auth.hasRole('admin')
     */
    hasRole(role) {
        const user = auth.session.user();
        if (!user) return false;
        const roles = user.roles || user.role || user.permissions || [];
        if (Array.isArray(roles)) return roles.includes(role);
        return roles === role;
    },

    /**
     * Check if the JWT payload has a specific claim value.
     *
     *   auth.hasClaim('sub', '42')
     *   auth.hasClaim('email_verified', true)
     */
    hasClaim(claim, value) {
        const user = auth.session.user();
        if (!user) return false;
        return value !== undefined ? user[claim] === value : claim in user;
    },

    // ─── Session ──────────────────────────────────────────────────────────────

    session: {

        /**
         * Start a session with a JWT or opaque token.
         * Stores token encrypted, sets up expiry watch.
         * Fires OnStart hooks after setup.
         *
         *   await auth.session.start(jwt);
         */
        async start(token) {
            await _tokenStore.setAsync('token', token);
            _metaStore.set('startedAt', Date.now());

            const payload = _decodeJWT(token);
            if (payload?.exp) {
                _metaStore.set('exp', payload.exp * 1000);
                _startExpiryWatch(payload.exp * 1000);
            }

            emit('auth:start', { token });
            for (const fn of _onStartHooks) {
                try { await fn(token); } catch (e) {
                    console.warn('[oja/auth] OnStart hook error:', e);
                }
            }
        },

        /**
         * End the session — clear token, stop timers, fire hooks.
         */
        async end() {
            _stopExpiryWatch();
            await _tokenStore.clear('token');
            _metaStore.clear('exp');
            _metaStore.clear('startedAt');
            emit('auth:end');
        },

        /**
         * Replace the current token — resets expiry watch.
         * Fires OnRenew hooks.
         *
         *   await auth.session.renew(newJwt);
         */
        async renew(newToken) {
            _stopExpiryWatch();
            await _tokenStore.setAsync('token', newToken);

            const payload = _decodeJWT(newToken);
            if (payload?.exp) {
                _metaStore.set('exp', payload.exp * 1000);
                _startExpiryWatch(payload.exp * 1000);
            }

            emit('auth:renew', { token: newToken });
            for (const fn of _onRenewHooks) {
                try { await fn(newToken); } catch (e) {
                    console.warn('[oja/auth] OnRenew hook error:', e);
                }
            }
        },

        /**
         * Is a session currently active?
         * Checks token exists and has not expired.
         */
        isActive() {
            const raw = _tokenStore._layer.get(_tokenStore._ns + 'token');
            if (!raw) return false;

            const exp = _metaStore.get('exp');
            if (exp && Date.now() >= exp) return false;

            return true;
        },

        /**
         * Retrieve the raw token string (decrypted).
         */
        async token() {
            return _tokenStore.getAsync('token');
        },

        /**
         * Synchronous token read — for headers, middleware.
         * Returns the encrypted string — only useful for passing to api.js.
         * Use token() for the decrypted value.
         */
        tokenSync() {
            return _tokenStore._layer.get(_tokenStore._ns + 'token');
        },

        /**
         * Decoded JWT payload — claims, roles, user info.
         * Returns null if not a JWT or not active.
         */
        user() {
            const raw = _tokenStore._layer.get(_tokenStore._ns + 'token');
            if (!raw) return null;
            // Raw is encrypted in storage — we need the cached payload
            return _metaStore.get('payload') || null;
        },

        /**
         * How many milliseconds until the session expires.
         * Returns Infinity if no expiry set.
         */
        expiresIn() {
            const exp = _metaStore.get('exp');
            if (!exp) return Infinity;
            return Math.max(0, exp - Date.now());
        },

        /**
         * The path the user was trying to reach before being redirected to login.
         * Router calls this after successful login to resume navigation.
         */
        intendedPath() {
            return _metaStore.get('intendedPath') || null;
        },

        clearIntendedPath() {
            _metaStore.clear('intendedPath');
            _metaStore.clear('intendedParams');
        },

        // ── Lifecycle hooks ────────────────────────────────────────────────────

        /**
         * Called after session.start() — use to set api token, navigate.
         *
         *   auth.session.OnStart(async (token) => {
         *       api.setToken(token);
         *       const dest = auth.session.intendedPath() || 'dashboard';
         *       auth.session.clearIntendedPath();
         *       router.navigate(dest);
         *   });
         */
        OnStart(fn) {
            _onStartHooks.push(fn);
            return auth; // chainable
        },

        /**
         * Called after session.renew() — use to update api token.
         *
         *   auth.session.OnRenew((newToken) => api.setToken(newToken));
         */
        OnRenew(fn) {
            _onRenewHooks.push(fn);
            return auth;
        },

        /**
         * Called when session expires — use to redirect and notify.
         *
         *   auth.session.OnExpiry(() => {
         *       notify.warn('Session expired');
         *       router.navigate('login');
         *   });
         */
        OnExpiry(fn) {
            _onExpiryHooks.push(fn);
            return auth;
        }
    }
};

// ─── Expiry watch ─────────────────────────────────────────────────────────────

function _startExpiryWatch(expMs) {
    _stopExpiryWatch();

    const now        = Date.now();
    const msLeft     = expMs - now;
    const warnBefore = 5 * 60 * 1000; // warn 5 minutes before expiry

    if (msLeft <= 0) {
        _handleExpiry();
        return;
    }

    // Warning timer — fires 5 min before expiry
    const warnAt = msLeft - warnBefore;
    if (warnAt > 0) {
        _warningTimer = setTimeout(() => {
            emit('auth:expiring', { ms: warnBefore, expiresAt: expMs });
        }, warnAt);
    }

    // Expiry timer
    _expiryTimer = setTimeout(_handleExpiry, msLeft);
}

function _stopExpiryWatch() {
    clearTimeout(_expiryTimer);
    clearTimeout(_warningTimer);
    _expiryTimer  = null;
    _warningTimer = null;
}

async function _handleExpiry() {
    await auth.session.end();
    emit('auth:expired');
    for (const fn of _onExpiryHooks) {
        try { await fn(); } catch (e) {
            console.warn('[oja/auth] OnExpiry hook error:', e);
        }
    }
}

// ─── JWT decode ───────────────────────────────────────────────────────────────

function _decodeJWT(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        // Cache decoded payload for synchronous user() calls
        _metaStore.set('payload', payload);
        return payload;
    } catch {
        return null;
    }
}

// ─── Listen for api:unauthorized ─────────────────────────────────────────────
// api.js emits this when a 401 is received — end the session automatically

listen('api:unauthorized', async () => {
    if (auth.session.isActive()) {
        await auth.session.end();
        emit('auth:expired');
        for (const fn of _onExpiryHooks) {
            try { await fn(); } catch {}
        }
    }
});