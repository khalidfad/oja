/**
 * oja/events.js
 * Delegated event system. jQuery got the API right — this is that,
 * without the weight.
 *
 * Usage:
 *   import { on, once, off, emit, listen } from '../oja/events.js';
 *
 *   // Listen for clicks on any element matching selector (even future ones)
 *   on('[data-action="open-route"]', 'click', (e, el) => app.openRoute(el.dataset));
 *   on('.nav-link',  'click', (e, el) => router.navigate(el.dataset.page));
 *   on('.chip',      'click', (e, el) => app.setFilter(el.dataset.level));
 *
 *   // Fire once then remove itself
 *   once('#confirmOk', 'click', (e, el) => app.confirm());
 *
 *   // Remove a specific listener
 *   off('[data-action="open-route"]', 'click', handler);
 *
 *   // Cross-component communication — no direct references needed
 *   emit('host:selected', { hostname: 'api.example.com' });
 *   listen('host:selected', ({ hostname }) => app.openPerformanceModal(hostname));
 */

// ─── Delegated DOM events ─────────────────────────────────────────────────────

// Internal registry: event → [ { selector, fn, original } ]
const _registry = new Map();

/**
 * Attach a delegated listener on document.body.
 * fn receives (event, matchedElement).
 * Works for elements added to the DOM after on() is called.
 */
export function on(selector, eventName, fn) {
    if (!_registry.has(eventName)) {
        _registry.set(eventName, []);

        // One real listener per event type on the body
        document.body.addEventListener(eventName, (e) => {
            const handlers = _registry.get(eventName) || [];
            for (const { selector: sel, fn: handler } of handlers) {
                const target = e.target.closest(sel);
                if (target) {
                    handler(e, target);
                }
            }
        });
    }

    _registry.get(eventName).push({ selector, fn, original: fn });
    return { selector, eventName, fn }; // return handle for off()
}

/**
 * Like on() but removes itself after the first match.
 */
export function once(selector, eventName, fn) {
    const wrapper = (e, el) => {
        off(selector, eventName, wrapper);
        fn(e, el);
    };
    return on(selector, eventName, wrapper);
}

/**
 * Remove a specific delegated listener.
 * Pass the original fn reference used in on().
 */
export function off(selector, eventName, fn) {
    if (!_registry.has(eventName)) return;
    const handlers = _registry.get(eventName);
    const idx = handlers.findIndex(h => h.selector === selector && (h.fn === fn || h.original === fn));
    if (idx !== -1) handlers.splice(idx, 1);
}

// ─── Custom events (cross-component messaging) ────────────────────────────────

/**
 * Fire a named custom event on document.
 * Any listener registered with listen() will receive detail.
 */
export function emit(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
}

/**
 * Listen for a named custom event fired by emit().
 * Returns an unsubscribe function.
 *
 *   const unsub = listen('session:expired', () => app.logout());
 *   unsub(); // stop listening
 */
export function listen(name, fn) {
    const handler = (e) => fn(e.detail);
    document.addEventListener(name, handler);
    return () => document.removeEventListener(name, handler);
}

/**
 * Listen once for a named custom event.
 */
export function listenOnce(name, fn) {
    const unsub = listen(name, (detail) => {
        unsub();
        fn(detail);
    });
    return unsub;
}