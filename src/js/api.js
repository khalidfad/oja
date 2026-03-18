/**
 * oja/api.js
 * Fetch wrapper with auth, online/offline detection, and codec support.
 * Each app creates its own instance — base URLs and tokens stay isolated.
 *
 * ─── Basic usage ──────────────────────────────────────────────────────────────
 *
 *   import { Api } from '../oja/api.js';
 *
 *   const api = new Api({ base: window.location.origin });
 *
 *   api.setToken(jwt);
 *
 *   const data = await api.get('/config');
 *   const res  = await api.post('/firewall', { ip: '1.2.3.4', reason: 'Abuse' });
 *   const ok   = await api.delete('/firewall?ip=1.2.3.4');
 *
 *   api.onOffline(() => notify.banner('Connection lost', { type: 'warn' }));
 *   api.onOnline(()  => notify.dismissBanner());
 *
 * ─── MessagePack (opt-in) ─────────────────────────────────────────────────────
 *
 *   import { MsgPackCodec } from '../oja/codecs/msgpack.js';
 *
 *   const api = new Api({
 *       base  : window.location.origin,
 *       codec : new MsgPackCodec()
 *   });
 *
 *   // All requests now use Content-Type: application/msgpack
 *   // Responses decoded with MessagePack automatically
 *
 * ─── Request hooks ────────────────────────────────────────────────────────────
 *
 *   // Before every request — add custom headers, log, etc.
 *   api.beforeRequest((path, method, opts) => {
 *       opts.headers['X-Request-ID'] = crypto.randomUUID();
 *   });
 *
 *   // After every response — log, metrics, etc.
 *   api.afterResponse((path, method, res, ms) => {
 *       logger.debug('api', `${method} ${path}`, { ms, status: res.status });
 *   });
 *
 * ─── Events emitted ───────────────────────────────────────────────────────────
 *
 *   api:unauthorized  → 401 received    — auth.js listens to this
 *   api:error         → 5xx received
 *   api:offline       → fetch failed
 *   api:online        → connection restored
 */

import { jsonCodec } from './codecs/json.js';

export class Api {
    /**
     * @param {Object} options
     *   base          : string    — base URL prefix for all requests
     *   codec         : object    — encode/decode codec (default: JSON)
     *   timeout       : number    — ms before request aborts (default: 30000)
     *   retries       : number    — retry count on network failure (default: 0)
     *   retryDelay    : number    — ms between retries (default: 1000)
     */
    constructor(options = {}) {
        if (typeof options === 'string') options = { base: options }; // shorthand

        this._base          = options.base    || '';
        this._codec         = options.codec   || jsonCodec;
        this._timeout       = options.timeout || 30000;
        this._retries       = options.retries || 0;
        this._retryDelay    = options.retryDelay || 1000;

        this._token         = null;
        this._basic         = null;
        this._isOnline      = true;
        this._offlineFn     = null;
        this._onlineFn      = null;
        this._beforeHooks   = [];
        this._afterHooks    = [];
    }

    // ─── Auth ─────────────────────────────────────────────────────────────────

    setToken(token) {
        this._token = token;
        this._basic = null;
        return this;
    }

    setBasic(encoded) {
        this._basic  = encoded;
        this._token  = null;
        return this;
    }

    clearAuth() {
        this._token = null;
        this._basic = null;
        return this;
    }

    isAuthenticated() {
        return !!(this._token || this._basic);
    }

    // ─── Hooks ────────────────────────────────────────────────────────────────

    /**
     * Called before every request.
     * fn(path, method, fetchOptions) — mutate fetchOptions.headers to add custom headers.
     */
    beforeRequest(fn) {
        this._beforeHooks.push(fn);
        return this;
    }

    /**
     * Called after every response.
     * fn(path, method, response, elapsedMs)
     */
    afterResponse(fn) {
        this._afterHooks.push(fn);
        return this;
    }

    // ─── Online / offline ─────────────────────────────────────────────────────

    onOffline(fn) { this._offlineFn = fn; return this; }
    onOnline(fn)  { this._onlineFn  = fn; return this; }

    // ─── HTTP verbs ───────────────────────────────────────────────────────────

    get(path, options = {})          { return this._request(path, 'GET',    null,   options); }
    post(path, body, options = {})   { return this._request(path, 'POST',   body,   options); }
    put(path, body, options = {})    { return this._request(path, 'PUT',    body,   options); }
    patch(path, body, options = {})  { return this._request(path, 'PATCH',  body,   options); }
    delete(path, options = {})       { return this._request(path, 'DELETE', null,   options); }

    /**
     * Upload a file or FormData — does not encode with codec,
     * lets the browser set the correct multipart boundary.
     */
    upload(path, formData, options = {}) {
        return this._request(path, 'POST', formData, { ...options, raw: true });
    }

    // ─── Core ─────────────────────────────────────────────────────────────────

    async _request(path, method, body = null, options = {}) {
        const headers = {};

        if (this._token)      headers['Authorization'] = 'Bearer ' + this._token;
        else if (this._basic) headers['Authorization'] = 'Basic '  + this._basic;

        // Codec content type (skipped for raw uploads and GET)
        if (body !== null && !options.raw) {
            headers['Content-Type'] = this._codec.contentType;
            headers['Accept']       = this._codec.contentType;
        }

        // Merge any extra headers passed per-request
        if (options.headers) Object.assign(headers, options.headers);

        const opts = { method, headers };

        // Encode body
        if (body !== null) {
            if (options.raw || body instanceof FormData) {
                opts.body = body; // browser handles multipart
                delete opts.headers['Content-Type']; // let browser set boundary
            } else {
                const encoded = await Promise.resolve(this._codec.encode(body));
                opts.body = encoded;
            }
        }

        // Run beforeRequest hooks
        for (const fn of this._beforeHooks) {
            try { await fn(path, method, opts); } catch (e) {
                console.warn('[oja/api] beforeRequest hook error:', e);
            }
        }

        // Abort controller for timeout
        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), this._timeout);
        opts.signal = controller.signal;

        const url     = this._base + path;
        const startMs = Date.now();
        let   res     = null;
        let   attempt = 0;

        while (attempt <= this._retries) {
            try {
                res = await fetch(url, opts);
                clearTimeout(timeoutId);
                this._setOnline(true);
                break;
            } catch (e) {
                attempt++;
                if (attempt > this._retries || e.name === 'AbortError') {
                    clearTimeout(timeoutId);
                    this._setOnline(false);
                    return null;
                }
                await _wait(this._retryDelay * attempt);
            }
        }

        const elapsedMs = Date.now() - startMs;

        // Run afterResponse hooks
        for (const fn of this._afterHooks) {
            try { await fn(path, method, res, elapsedMs); } catch (e) {
                console.warn('[oja/api] afterResponse hook error:', e);
            }
        }

        // Handle status codes
        if (res.status === 401) {
            _emit('api:unauthorized', { path, method });
            return null;
        }

        if (res.status === 204) return true;  // No Content
        if (res.status === 404) return null;

        if (res.status >= 500) {
            _emit('api:error', { status: res.status, path, method });
            return null;
        }

        // Decode response body using codec
        return this._decode(res);
    }

    async _decode(res) {
        const ct = res.headers.get('content-type') || '';

        // MessagePack response
        if (ct.includes('msgpack') || this._codec.binaryType === 'binary') {
            try {
                const buf = await res.arrayBuffer();
                if (!buf.byteLength) return null;
                return await Promise.resolve(this._codec.decode(buf));
            } catch {
                return null;
            }
        }

        // Text / JSON response — always use JSON codec decode for safety
        try {
            const text = await res.text();
            if (!text.trim()) return null;
            return jsonCodec.decode(text);
        } catch {
            return null;
        }
    }

    _setOnline(online) {
        if (this._isOnline === online) return;
        this._isOnline = online;
        if (online  && this._onlineFn)  this._onlineFn();
        if (!online && this._offlineFn) this._offlineFn();
        _emit(online ? 'api:online' : 'api:offline');
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _emit(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
}

function _wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}