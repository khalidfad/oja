/**
 * oja/store.js
 * Persistent state with storage cascade and optional encryption.
 *
 * Storage cascade — tries each layer in order, falls back automatically:
 *   sessionStorage → localStorage → memory (Map)
 *
 * This means the same code works unchanged across:
 *   Web (normal)    → sessionStorage
 *   Web (private)   → memory
 *   Mobile webview  → sessionStorage or localStorage
 *   Embedded iframe → memory
 *
 * ─── Basic usage ──────────────────────────────────────────────────────────────
 *
 *   import { Store } from '../oja/store.js';
 *
 *   const store = new Store('admin');
 *   store.set('page', 'hosts');
 *   store.get('page');                   // → 'hosts'
 *   store.get('missing', 'dashboard');   // → 'dashboard'
 *   store.has('page');                   // → true
 *   store.clear('page');                 // remove one key
 *   store.clear();                       // remove all keys for this namespace
 *   store.all();                         // → { page: 'hosts', ... }
 *
 * ─── Encrypted store (for tokens and sensitive data) ─────────────────────────
 *
 *   const secure = new Store('admin', { encrypt: true });
 *
 *   // When encrypt:true all reads and writes are async — no special prefix needed
 *   await secure.set('token', jwt);
 *   await secure.get('token');
 *
 * ─── Storage preference ───────────────────────────────────────────────────────
 *
 *   // Prefer localStorage (survives tab close — for remember-me)
 *   const persistent = new Store('admin', { prefer: 'local' });
 *
 *   // Session only (cleared on tab close — default)
 *   const session = new Store('admin', { prefer: 'session' });
 *
 * ─── Events ───────────────────────────────────────────────────────────────────
 *
 *   store.onChange('page', (newVal, oldVal) => console.log('page changed'));
 *   store.offChange('page', handler);
 */

import { encrypt } from '../utils/encrypt.js';

// ─── Storage adapters ─────────────────────────────────────────────────────────

class _SessionAdapter {
    get name() { return 'session'; }
    available() {
        try {
            sessionStorage.setItem('__oja__', '1');
            sessionStorage.removeItem('__oja__');
            return true;
        } catch { return false; }
    }
    get(k)    { return sessionStorage.getItem(k); }
    set(k, v) { sessionStorage.setItem(k, v); }
    remove(k) { sessionStorage.removeItem(k); }
    keys()    {
        const out = [];
        for (let i = 0; i < sessionStorage.length; i++) out.push(sessionStorage.key(i));
        return out;
    }
    clear()   { sessionStorage.clear(); }
}

class _LocalAdapter {
    get name() { return 'local'; }
    available() {
        try {
            localStorage.setItem('__oja__', '1');
            localStorage.removeItem('__oja__');
            return true;
        } catch { return false; }
    }
    get(k)    { return localStorage.getItem(k); }
    set(k, v) { localStorage.setItem(k, v); }
    remove(k) { localStorage.removeItem(k); }
    keys()    {
        const out = [];
        for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
        return out;
    }
    clear()   { localStorage.clear(); }
}

class _MemoryAdapter {
    get name() { return 'memory'; }
    constructor() { this._map = new Map(); }
    available()  { return true; }
    get(k)       { return this._map.has(k) ? this._map.get(k) : null; }
    set(k, v)    { this._map.set(k, v); }
    remove(k)    { this._map.delete(k); }
    keys()       { return [...this._map.keys()]; }
    clear()      { this._map.clear(); }
}

// ─── Store ────────────────────────────────────────────────────────────────────

export class Store {
    /**
     * @param {string} namespace   — scopes all keys, prevents collisions between apps
     * @param {Object} options
     *   prefer  : 'session' | 'local'   — preferred storage layer (default: 'session')
     *   encrypt : boolean                — enable AES-GCM encryption (default: false)
     *   secret  : string                 — encryption passphrase (default: namespace)
     *   aad     : string                 — additional authenticated data (optional)
     */
    constructor(namespace = 'oja', options = {}) {
        this._ns      = namespace + ':';
        this._opts    = options;
        this._secret  = options.secret  || namespace;
        this._aad     = options.aad     || null;
        this._encrypt = options.encrypt && encrypt.available();
        this._layer   = null;
        this._changes = new Map();

        this._init(options.prefer || 'session');
    }

    _init(prefer) {
        const session = new _SessionAdapter();
        const local   = new _LocalAdapter();
        const memory  = new _MemoryAdapter();

        if (prefer === 'local') {
            this._layer = local.available()   ? local
                : session.available() ? session
                    : memory;
        } else {
            this._layer = session.available() ? session
                : local.available()   ? local
                    : memory;
        }
    }

    get storageLayer() { return this._layer.name; }

    // ─── API — sync when encrypt:false, async when encrypt:true ──────────────
    // When constructed with encrypt:true, set() and get() return Promises.
    // No special naming needed — the constructor option is the contract.

    set(key, value) {
        if (this._encrypt) return this._setEncrypted(key, value);
        return this._setSync(key, value);
    }

    get(key, fallback = null) {
        if (this._encrypt) return this._getEncrypted(key, fallback);
        return this._getSync(key, fallback);
    }

    has(key) {
        return this._layer.get(this._ns + key) !== null;
    }

    clear(key) {
        if (key !== undefined) {
            const old = this._getSync(key);
            this._layer.remove(this._ns + key);
            this._notify(key, null, old);
        } else {
            this._layer.keys()
                .filter(k => k.startsWith(this._ns))
                .forEach(k => {
                    const shortKey = k.slice(this._ns.length);
                    const old = this._getSync(shortKey);
                    this._layer.remove(k);
                    this._notify(shortKey, null, old);
                });
        }
        return this;
    }

    clearAll() {
        this._layer.clear();
        this._changes.clear();
        return this;
    }

    all() {
        const result = {};
        this._layer.keys()
            .filter(k => k.startsWith(this._ns))
            .forEach(k => {
                const shortKey = k.slice(this._ns.length);
                result[shortKey] = this._getSync(shortKey);
            });
        return result;
    }

    // ─── Sync internals ───────────────────────────────────────────────────────

    _setSync(key, value) {
        const old = this._getSync(key);
        try {
            this._layer.set(this._ns + key, JSON.stringify(value));
            this._notify(key, value, old);
        } catch (e) {
            console.warn('[oja/store] set failed:', key, e);
        }
        return this;
    }

    _getSync(key, fallback = null) {
        try {
            const raw = this._layer.get(this._ns + key);
            if (raw === null || raw === undefined) return fallback;
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    }

    // ─── Encrypted internals ──────────────────────────────────────────────────

    async _setEncrypted(key, value) {
        const serialised = JSON.stringify(value);
        let stored = serialised;
        try {
            stored = await encrypt.seal(serialised, this._secret, this._ns, this._aad);
        } catch (e) {
            console.warn('[oja/store] encryption failed, storing plain:', e);
        }
        const old = await this._getEncrypted(key);
        try {
            this._layer.set(this._ns + key, stored);
            this._notify(key, value, old);
        } catch (e) {
            console.warn('[oja/store] set failed:', key, e);
        }
        return this;
    }

    async _getEncrypted(key, fallback = null) {
        try {
            const raw = this._layer.get(this._ns + key);
            if (raw === null || raw === undefined) return fallback;

            let plain = raw;
            if (encrypt.isSealed(raw)) {
                try {
                    plain = await encrypt.open(raw, this._secret, this._ns, this._aad);
                } catch (e) {
                    console.warn('[oja/store] decryption failed:', key, e);
                    return fallback;
                }
            }
            return JSON.parse(plain);
        } catch {
            return fallback;
        }
    }

    /**
     * Rotate encryption key for all stored values.
     * Re-encrypts all data with a new passphrase while preserving existing values.
     * Returns { successCount, errorCount }.
     */
    async rotateKey(newSecret, options = {}) {
        if (!this._encrypt) throw new Error('[oja/store] Cannot rotate key on non-encrypted store');

        const { oldSecret = this._secret, onProgress = null, batchSize = 10 } = options;
        const keys = this._layer.keys()
            .filter(k => k.startsWith(this._ns))
            .map(k => k.slice(this._ns.length));

        let successCount = 0;
        let errorCount   = 0;

        for (let i = 0; i < keys.length; i += batchSize) {
            await Promise.all(keys.slice(i, i + batchSize).map(async (key) => {
                try {
                    const raw = this._layer.get(this._ns + key);
                    if (!raw || !encrypt.isSealed(raw)) { errorCount++; return; }

                    const reencrypted = await encrypt.rotate(raw, oldSecret, newSecret, this._ns, this._aad);
                    this._layer.set(this._ns + key, reencrypted);
                    successCount++;
                    onProgress?.({ key, success: true });
                } catch (e) {
                    errorCount++;
                    console.warn('[oja/store] failed to re-encrypt key:', key, e);
                    onProgress?.({ key, success: false, error: e.message });
                }
            }));
        }

        if (successCount > 0) {
            this._secret = newSecret;
            _emit('store:key-rotated', { namespace: this._ns, successCount, errorCount });
        }
        return { successCount, errorCount };
    }

    /**
     * Export all encrypted data with current key.
     * Useful for backup or migration.
     */
    async exportEncrypted() {
        if (!this._encrypt) throw new Error('[oja/store] Cannot export from non-encrypted store');

        const data = {};
        this._layer.keys()
            .filter(k => k.startsWith(this._ns))
            .forEach(fullKey => {
                const raw = this._layer.get(fullKey);
                if (encrypt.isSealed(raw)) {
                    data[fullKey.slice(this._ns.length)] = raw;
                }
            });

        return { namespace: this._ns, version: 1, data };
    }

    /**
     * Import encrypted data produced by exportEncrypted().
     */
    async importEncrypted(exported) {
        if (!this._encrypt) throw new Error('[oja/store] Cannot import to non-encrypted store');
        if (exported.namespace !== this._ns) throw new Error('[oja/store] Namespace mismatch on import');

        for (const [key, value] of Object.entries(exported.data)) {
            this._layer.set(this._ns + key, value);
        }
        _emit('store:imported', { namespace: this._ns, count: Object.keys(exported.data).length });
        return this;
    }

    // ─── Change listeners ─────────────────────────────────────────────────────

    onChange(key, handler) {
        if (!this._changes.has(key)) this._changes.set(key, new Set());
        this._changes.get(key).add(handler);
        return () => this.offChange(key, handler);
    }

    offChange(key, handler) {
        this._changes.get(key)?.delete(handler);
    }

    _notify(key, newVal, oldVal) {
        if (newVal === oldVal) return;
        this._changes.get(key)?.forEach(fn => {
            try { fn(newVal, oldVal); } catch (e) {
                console.warn('[oja/store] onChange handler error:', e);
            }
        });
    }

    // ─── Convenience ─────────────────────────────────────────────────────────

    increment(key, n = 1) {
        const current = this._getSync(key, 0);
        this._setSync(key, (typeof current === 'number' ? current : 0) + n);
        return this;
    }

    push(key, value) {
        const arr = this._getSync(key, []);
        if (!Array.isArray(arr)) return this;
        arr.push(value);
        this._setSync(key, arr);
        return this;
    }

    merge(key, partial) {
        const current = this._getSync(key, {});
        this._setSync(key, { ...current, ...partial });
        return this;
    }
}

function _emit(name, detail = {}) {
    if (typeof document === 'undefined') return;
    document.dispatchEvent(new CustomEvent(name, { detail }));
}