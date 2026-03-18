/**
 * oja/events.js
 * Delegated event system, timing utilities, and keyboard shortcuts.
 *
 * ─── Delegated DOM events ─────────────────────────────────────────────────────
 *
 *   import { on, once, off, emit, listen, debounce, throttle, keys } from '../oja/events.js';
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
 * ─── Cross-component messaging ────────────────────────────────────────────────
 *
 *   emit('host:selected', { hostname: 'api.example.com' });
 *   const unsub = listen('host:selected', ({ hostname }) => highlight(hostname));
 *   unsub();
 *
 * ─── Keyboard shortcuts ───────────────────────────────────────────────────────
 *
 *   Declarative shortcut map — no scattered keydown listeners.
 *   Shortcuts are ignored when focus is inside an input, textarea, or select.
 *
 *   keys({
 *       'ctrl+1':     () => router.navigate('/dashboard'),
 *       'ctrl+2':     () => router.navigate('/hosts'),
 *       'ctrl+3':     () => router.navigate('/firewall'),
 *       'escape':     () => modal.closeAll(),
 *       '/':          () => document.getElementById('search')?.focus(),
 *       'r':          () => router.refresh(),
 *       '?':          () => notify.info('Ctrl+1-6: Pages  ·  r: Refresh  ·  /: Search  ·  Esc: Close'),
 *   });
 *
 *   Modifier syntax:
 *     'ctrl+k'    → Ctrl/Cmd + k
 *     'shift+/'   → Shift + /  (i.e. ?)
 *     'escape'    → Escape key
 *     'f5'        → F5 (prevent default)
 *
 *   Returns an unsub function — call to remove all shortcuts registered in that map:
 *     const unsub = keys({ ... });
 *     unsub(); // remove all
 *
 * ─── Debounce and throttle ────────────────────────────────────────────────────
 *
 *   on('#host-search', 'input', debounce(renderHosts, 200));
 *   on('#scrollable',  'scroll', throttle(updateNav, 100));
 */

// ─── Delegated DOM events ─────────────────────────────────────────────────────

const _registry = new Map(); // event → [{ selector, fn, original }]

/**
 * Attach a delegated listener on document.body.
 * fn receives (event, matchedElement).
 * Works for elements added to the DOM after on() is called.
 *
 *   on('.btn-delete', 'click', (e, el) => deleteItem(el.dataset.id));
 */
export function on(selector, eventName, fn) {
    if (!_registry.has(eventName)) {
        _registry.set(eventName, []);

        document.body.addEventListener(eventName, (e) => {
            const handlers = _registry.get(eventName) || [];
            for (const { selector: sel, fn: handler } of handlers) {
                const target = e.target.closest(sel);
                if (target) handler(e, target);
            }
        });
    }

    _registry.get(eventName).push({ selector, fn, original: fn });
    return { selector, eventName, fn };
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
 */
export function off(selector, eventName, fn) {
    if (!_registry.has(eventName)) return;
    const handlers = _registry.get(eventName);
    const idx = handlers.findIndex(
        h => h.selector === selector && (h.fn === fn || h.original === fn)
    );
    if (idx !== -1) handlers.splice(idx, 1);
}

// ─── Custom events (cross-component messaging) ────────────────────────────────

/**
 * Fire a named custom event on document.
 * Any listener registered with listen() will receive detail.
 *
 *   emit('host:updated', { id: 'api-example-com', alive: false });
 */
export function emit(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: false }));
}

/**
 * Listen for a named custom event fired by emit().
 * Returns an unsubscribe function.
 *
 *   const unsub = listen('session:expired', () => app.logout());
 *   unsub();
 */
export function listen(name, fn) {
    const handler = (e) => fn(e.detail);
    document.addEventListener(name, handler);
    return () => document.removeEventListener(name, handler);
}

/**
 * Listen once for a named custom event, then automatically unsubscribe.
 */
export function listenOnce(name, fn) {
    const unsub = listen(name, (detail) => {
        unsub();
        fn(detail);
    });
    return unsub;
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────

/**
 * Register a declarative keyboard shortcut map.
 * All shortcuts in the map share one keydown listener — no global clutter.
 * Shortcuts are ignored when focus is inside an input, textarea, or select.
 *
 * Modifier syntax (case-insensitive):
 *   'ctrl+k'   → Ctrl (or Cmd on Mac) + k
 *   'shift+r'  → Shift + r
 *   'escape'   → Escape key (no modifier)
 *   'f5'       → F5 function key
 *
 *   keys({
 *       'ctrl+1':  () => router.navigate('/dashboard'),
 *       'ctrl+2':  () => router.navigate('/hosts'),
 *       'escape':  () => modal.closeAll(),
 *       '/':       () => document.getElementById('search')?.focus(),
 *       'r':       () => router.refresh(),
 *       '?':       () => notify.info('Ctrl+1-6  ·  r: Refresh  ·  /: Search'),
 *   });
 *
 * @param {Object} map   — shortcut → handler function
 * @returns {Function}   — call to unregister all shortcuts in this map
 */
export function keys(map) {
    const parsed = Object.entries(map).map(([combo, fn]) => {
        const parts  = combo.toLowerCase().split('+');
        const ctrl   = parts.includes('ctrl') || parts.includes('cmd');
        const shift  = parts.includes('shift');
        const alt    = parts.includes('alt');
        const key    = parts.find(p => !['ctrl','cmd','shift','alt'].includes(p)) || '';
        return { ctrl, shift, alt, key, fn };
    });

    const handler = (e) => {
        // Don't fire shortcuts when typing in an input
        if (e.target.matches('input, textarea, select, [contenteditable]')) return;

        for (const { ctrl, shift, alt, key, fn } of parsed) {
            const ctrlMatch  = ctrl  ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
            const shiftMatch = shift ? e.shiftKey : !e.shiftKey;
            const altMatch   = alt   ? e.altKey   : !e.altKey;
            const keyMatch   = e.key.toLowerCase() === key;

            if (ctrlMatch && shiftMatch && altMatch && keyMatch) {
                e.preventDefault();
                fn(e);
                return; // first match wins
            }
        }
    };

    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
}

// ─── Timing utilities ─────────────────────────────────────────────────────────

/**
 * Debounce — delays execution until `ms` milliseconds after the last call.
 * Use for: search inputs, save-on-type, resize, autocomplete.
 *
 *   on('#host-search', 'input', debounce(renderHosts, 200));
 *
 * @param {Function} fn  — function to debounce
 * @param {number}   ms  — quiet period in ms (default: 200)
 * @returns {Function}   — debounced wrapper; call .cancel() to abort pending
 */
export function debounce(fn, ms = 200) {
    let timer = null;

    const debounced = function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
        }, ms);
    };

    debounced.cancel = () => {
        clearTimeout(timer);
        timer = null;
    };

    return debounced;
}

/**
 * Throttle — fires at most once per `ms` milliseconds.
 * Use for: scroll handlers, mousemove, window resize, live chart updates.
 *
 *   on('#scrollable', 'scroll', throttle(updateScrollbar, 100));
 *
 * @param {Function} fn  — function to throttle
 * @param {number}   ms  — minimum interval in ms (default: 100)
 * @returns {Function}   — throttled wrapper; call .cancel() to reset
 */
export function throttle(fn, ms = 100) {
    let lastCall = 0;
    let timer    = null;

    const throttled = function (...args) {
        const now  = Date.now();
        const wait = ms - (now - lastCall);

        if (wait <= 0) {
            clearTimeout(timer);
            lastCall = now;
            fn.apply(this, args);
        } else {
            clearTimeout(timer);
            timer = setTimeout(() => {
                lastCall = Date.now();
                timer    = null;
                fn.apply(this, args);
            }, wait);
        }
    };

    throttled.cancel = () => {
        clearTimeout(timer);
        timer    = null;
        lastCall = 0;
    };

    return throttled;
}