/**
 * oja/sw.js
 * Service Worker registration and messaging helpers.
 * Works standalone — no dependency on VFS or any other Oja module.
 *
 * ─── Register and wait for control ───────────────────────────────────────────
 *
 *   import { sw } from '../oja/sw.js';
 *
 *   await sw.register('./sw.js');
 *   // Page is now controlled by the SW — safe to postMessage
 *
 * ─── Send a message and await the ACK ────────────────────────────────────────
 *
 *   await sw.send({ type: 'SYNC_VFS', files });
 *   // Resolves when SW posts back { type: 'VFS_SYNCED' } or after timeout
 *
 *   // Custom ACK type
 *   await sw.send({ type: 'CLEAR_CACHE' }, { ack: 'CACHE_CLEARED' });
 *
 * ─── One-way fire and forget ─────────────────────────────────────────────────
 *
 *   sw.post({ type: 'PREFETCH', url: '/assets/chunk.js' });
 *
 * ─── Listen for messages from the SW ─────────────────────────────────────────
 *
 *   const off = sw.on('PUSH_UPDATE', (data) => notify.info(data.message));
 *   off(); // unsubscribe
 *
 * ─── VFS integration (convenience wrapper) ───────────────────────────────────
 *
 *   // Sync a VFS getAll() map to the SW and wait for ACK
 *   await sw.syncVFS(files, { ack: 'VFS_SYNCED', timeout: 2000 });
 */

const DEFAULT_TIMEOUT = 2000;
const _listeners = new Map(); // type → Set<fn>

// Wire the single shared message listener once
if (typeof navigator !== 'undefined' && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (e) => {
        if (!e.data?.type) return;
        const fns = _listeners.get(e.data.type);
        if (fns) fns.forEach(fn => fn(e.data));
    });
}

export const sw = {

    // Register the SW and resolve when the page is controlled by it.
    // On first install, waits for controllerchange.
    // On subsequent loads, the SW already controls the page — resolves immediately.
    register(scriptUrl, options = {}) {
        if (!('serviceWorker' in navigator)) return Promise.resolve(null);

        return new Promise(async (resolve) => {
            let reg;
            try {
                reg = await navigator.serviceWorker.register(scriptUrl, options);
            } catch (e) {
                console.warn('[oja/sw] registration failed:', e);
                resolve(null);
                return;
            }

            if (navigator.serviceWorker.controller) {
                resolve(reg);
                return;
            }

            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(reg), { once: true });
            setTimeout(() => resolve(reg), DEFAULT_TIMEOUT);
        });
    },

    // Post a message to the active SW and resolve when the expected ACK arrives.
    // Falls back to resolving after timeout if the SW never replies.
    send(message, options = {}) {
        const { ack = null, timeout = DEFAULT_TIMEOUT } = options;

        return new Promise(async (resolve) => {
            try {
                const reg = await navigator.serviceWorker.ready;
                const worker = reg.active;
                if (!worker) { resolve(null); return; }

                if (!ack) {
                    worker.postMessage(message);
                    resolve(null);
                    return;
                }

                let timer;
                const off = sw.on(ack, (data) => {
                    clearTimeout(timer);
                    off();
                    resolve(data);
                });

                timer = setTimeout(() => {
                    off();
                    resolve(null);
                }, timeout);

                worker.postMessage(message);

            } catch (e) {
                resolve(null);
            }
        });
    },

    // Fire and forget — post a message with no waiting for reply.
    post(message) {
        navigator.serviceWorker?.controller?.postMessage(message);
    },

    // Listen for a specific message type from the SW.
    // Returns an unsubscribe function.
    on(type, fn) {
        if (!_listeners.has(type)) _listeners.set(type, new Set());
        _listeners.get(type).add(fn);
        return () => {
            const fns = _listeners.get(type);
            if (fns) {
                fns.delete(fn);
                if (fns.size === 0) _listeners.delete(type);
            }
        };
    },

    // Sync a flat file map { path: content } to the SW.
    // Expects the SW to handle { type: 'SYNC_VFS', files } and reply { type: 'VFS_SYNCED' }.
    // The ack and timeout options let you adapt to a custom SW protocol.
    syncVFS(files, options = {}) {
        const { ack = 'VFS_SYNCED', timeout = DEFAULT_TIMEOUT } = options;
        return sw.send({ type: 'SYNC_VFS', files }, { ack, timeout });
    },

    // Returns the currently active ServiceWorker, or null.
    get active() {
        return navigator.serviceWorker?.controller || null;
    },

    // Returns true if the browser supports service workers.
    get supported() {
        return 'serviceWorker' in navigator;
    },
};