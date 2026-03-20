/**
 * oja/config.js
 * Optional project-level configuration loader.
 *
 * oja.config.json is the single source of truth for an Oja project —
 * like package.json is to Node. It is entirely optional: every Oja
 * primitive works without it. When present it configures VFS, routes,
 * auth, and anything else in one place.
 *
 * ─── Quick start ──────────────────────────────────────────────────────────────
 *
 *   // Load once in app.js — all other modules read the cached result
 *   import { config } from '../oja/config.js';
 *
 *   await config.load();              // looks for ./oja.config.json
 *   await config.load('/');           // explicit base URL
 *   await config.load('https://cdn.example.com/my-app/');  // remote base
 *
 *   // Read sections
 *   const vfsCfg  = config.get('vfs');     // → { files, sync, ... } or null
 *   const version = config.get('version'); // → '1.0.0' or null
 *
 * ─── Schema (all sections optional) ──────────────────────────────────────────
 *
 *   {
 *     "version": "1.0.0",
 *     "name": "my-app",
 *
 *     "header": {
 *       "signature": "base64-hmac-optional",
 *       "timestamp": "2025-01-01T00:00:00Z"
 *     },
 *
 *     "vfs": {
 *       "manifest":   "vfs.json",
 *       "sync": {
 *         "auto":     true,
 *         "interval": 60000
 *       },
 *       "conflict":   "keep-local",
 *       "cache": {
 *         "ttl":      3600000
 *       }
 *     },
 *
 *     "routes": {
 *       "protected": ["/admin", "/settings"],
 *       "fallback":  "/index.html"
 *     },
 *
 *     "auth": {
 *       "loginPath":   "/login",
 *       "defaultPath": "/dashboard"
 *     }
 *   }
 *
 * ─── Connecting to VFS ────────────────────────────────────────────────────────
 *
 *   const vfs = new VFS('my-app');
 *   await config.load();
 *   await config.applyVFS(vfs, 'https://cdn.example.com/my-app/');
 *   // mounts remote files and starts auto-sync if configured
 *
 * ─── Connecting to Router ─────────────────────────────────────────────────────
 *
 *   const router = new Router({ outlet: '#app' });
 *   await config.load();
 *   config.applyRouter(router);
 *   // registers protected route middleware from config.routes.protected
 *
 * ─── Checking load state ──────────────────────────────────────────────────────
 *
 *   config.loaded          // → true after a successful load
 *   config.get('name')     // → value or null — never throws
 *   config.all()           // → full parsed object or {}
 */

import { emit } from './events.js';

const CONFIG_FILENAME = 'oja.config.json';

// Cached parsed config — null until load() is called successfully.
let _cfg   = null;
let _base  = null;

export const config = {

    // True after a successful load(). False if no config file was found.
    get loaded() { return _cfg !== null; },

    /**
     * Load oja.config.json from a base URL (defaults to the page origin).
     * Safe to call multiple times — re-fetches and replaces the cache each time.
     * Resolves to true if the file was found, false if it was absent (404).
     * Throws only on unexpected network or parse errors.
     *
     *   await config.load();
     *   await config.load('https://cdn.example.com/my-app/');
     */
    async load(base = '') {
        if (base && !base.endsWith('/')) base += '/';
        _base = base;

        const url = base + CONFIG_FILENAME;

        let res;
        try {
            res = await fetch(url);
        } catch (e) {
            // Network unavailable — not an error, just no config
            return false;
        }

        if (res.status === 404) return false;

        if (!res.ok) {
            throw new Error(`[oja/config] failed to load ${url}: HTTP ${res.status}`);
        }

        try {
            _cfg = await res.json();
        } catch (e) {
            throw new Error(`[oja/config] invalid JSON in ${url}: ${e.message}`);
        }

        emit('config:loaded', { url, name: _cfg.name, version: _cfg.version });
        return true;
    },

    /**
     * Read a top-level section by key. Returns null if config is not loaded
     * or the key is absent — never throws.
     *
     *   const vfsCfg = config.get('vfs');
     *   const name   = config.get('name');
     */
    get(key) {
        if (!_cfg) return null;
        const val = _cfg[key];
        return val !== undefined ? val : null;
    },

    /**
     * Returns the full parsed config object, or an empty object if not loaded.
     */
    all() {
        return _cfg ? { ..._cfg } : {};
    },

    /**
     * Apply VFS configuration from oja.config.json to a VFS instance.
     * Mounts the remote base, applies sync settings, and sets conflict policy.
     * No-op if config is not loaded or has no vfs section.
     *
     *   const vfs = new VFS('my-app');
     *   await vfs.ready();
     *   await config.load('https://cdn.example.com/my-app/');
     *   await config.applyVFS(vfs, 'https://cdn.example.com/my-app/');
     *
     * @param {VFS}    vfs    — VFS instance to configure
     * @param {string} [base] — remote base URL (falls back to the URL used in load())
     */
    async applyVFS(vfs, base) {
        const vfsCfg = config.get('vfs');
        if (!vfsCfg) return;

        const remoteBase = base || _base;
        if (!remoteBase) return;

        const mountOpts = {};

        if (vfsCfg.manifest) {
            mountOpts.manifest = vfsCfg.manifest;
        }

        if (vfsCfg.sync?.auto && vfsCfg.sync?.interval) {
            mountOpts.poll = vfsCfg.sync.interval;
        }

        if (vfsCfg.conflict) {
            mountOpts.onConflict = vfsCfg.conflict;
        }

        await vfs.mount(remoteBase, mountOpts);
    },

    /**
     * Apply route configuration from oja.config.json to a Router instance.
     * Registers protected route middleware and fallback from config.routes.
     * No-op if config is not loaded or has no routes section.
     *
     *   config.applyRouter(router, { auth, notify });
     *
     * @param {Router} router      — Router instance to configure
     * @param {object} [deps]
     *   auth   : auth object  — used for protected route middleware
     *   notify : notify object — optional, shown on auth failure
     */
    applyRouter(router, deps = {}) {
        const routesCfg = config.get('routes');
        if (!routesCfg) return;

        const authCfg  = config.get('auth') || {};
        const loginPath = authCfg.loginPath || '/login';

        if (routesCfg.protected?.length && deps.auth) {
            const { auth } = deps;
            for (const pattern of routesCfg.protected) {
                router.Use(async (ctx, next) => {
                    if (!ctx.path.startsWith(pattern.replace(/\*$/, ''))) {
                        return next();
                    }
                    if (!auth.session.isActive()) {
                        auth.session._meta?.set?.('intendedPath', ctx.path);
                        ctx.redirect(loginPath);
                        return;
                    }
                    return next();
                });
            }
        }
    },

    /**
     * Reset the cached config. Useful in tests or when switching environments.
     */
    reset() {
        _cfg  = null;
        _base = null;
    },
};