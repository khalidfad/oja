/**
 * oja/component.js
 * Loads .html files, mounts them into the DOM, and manages lifecycle
 * transitions (add / remove / update) with CSS animations by default.
 * GSAP, D3, or any other library can be plugged in via hooks().
 *
 * Usage:
 *   import { component } from '../oja/component.js';
 *
 *   // Mount a component into a container (fetch + render + inject)
 *   await component.mount('#hostsContainer', 'components/hosts.html', data);
 *
 *   // Add a single new item with enter animation
 *   await component.add('#hostsContainer', 'components/host-row.html', rowData);
 *
 *   // Remove an element with leave animation, then delete from DOM
 *   await component.remove('#host-row-api\\.example\\.com');
 *
 *   // Re-render an element and flash a highlight
 *   await component.update('#host-row-api\\.example\\.com', newData);
 *
 *   // Override default CSS transitions with GSAP (opt-in per app)
 *   import gsap from 'https://cdn.jsdelivr.net/npm/gsap';
 *   component.hooks({
 *       entering: (el) => gsap.from(el, { opacity: 0, y: 10, duration: 0.25 }),
 *       leaving:  (el) => gsap.to(el,   { opacity: 0, y: -10, duration: 0.2 }),
 *       updated:  (el) => gsap.fromTo(el,
 *           { backgroundColor: '#fffbe6' },
 *           { backgroundColor: 'transparent', duration: 0.4 })
 *   });
 */

import { render, each, fill } from './template.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

const _cache = new Map(); // url → html string

async function _load(url) {
    if (_cache.has(url)) return _cache.get(url);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[oja/component] failed to load: ${url} (${res.status})`);
    const html = await res.text();
    _cache.set(url, html);
    return html;
}

// ─── Hooks (overrideable transitions) ────────────────────────────────────────

let _hooks = {
    entering: null, // (el) => Promise | void
    leaving:  null, // (el) => Promise | void
    updated:  null, // (el) => Promise | void
};

// ─── CSS class transitions (defaults) ────────────────────────────────────────

const CSS_TRANSITION_MS = 250; // must match oja.css animation durations

function _enter(el) {
    if (_hooks.entering) return Promise.resolve(_hooks.entering(el));
    el.classList.add('oja-entering');
    return new Promise(resolve => {
        setTimeout(() => {
            el.classList.remove('oja-entering');
            resolve();
        }, CSS_TRANSITION_MS);
    });
}

function _leave(el) {
    if (_hooks.leaving) return Promise.resolve(_hooks.leaving(el));
    el.classList.add('oja-leaving');
    return new Promise(resolve => {
        setTimeout(() => {
            el.classList.remove('oja-leaving');
            resolve();
        }, CSS_TRANSITION_MS);
    });
}

function _flash(el) {
    if (_hooks.updated) return Promise.resolve(_hooks.updated(el));
    el.classList.add('oja-updated');
    return new Promise(resolve => {
        setTimeout(() => {
            el.classList.remove('oja-updated');
            resolve();
        }, CSS_TRANSITION_MS * 2);
    });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const component = {

    /**
     * Replace the entire contents of a container with a rendered component.
     * Use for full page sections (hosts list, firewall table, etc.)
     *
     * @param {string|Element} target   - CSS selector or DOM element
     * @param {string}         url      - path to .html component file
     * @param {Object}         data     - data for {{interpolation}}
     * @param {Object}         lists    - { listName: [items], ... } for data-each loops
     */
    async mount(target, url, data = {}, lists = {}) {
        const container = _resolve(target);
        if (!container) return;

        // Show loading slot if present
        const loadingEl = container.querySelector('[data-loading]');
        const errorEl   = container.querySelector('[data-error]');
        if (loadingEl) loadingEl.style.display = '';
        if (errorEl)   errorEl.style.display   = 'none';

        try {
            const html = await _load(url);
            container.innerHTML = render(html, data);

            for (const [name, items] of Object.entries(lists)) {
                each(container, name, items);
            }

            fill(container, data);

        } catch (e) {
            console.error(`[oja/component] failed to mount "${url}":`, e);

            // Show error slot if present, otherwise inject a minimal fallback
            if (errorEl) {
                errorEl.style.display = '';
                if (loadingEl) loadingEl.style.display = 'none';
            } else {
                container.innerHTML = `<div class="oja-error" data-component="${url}">
                    Failed to load component.
                    <button onclick="this.closest('.oja-error').dispatchEvent(new CustomEvent('oja:retry', {bubbles:true}))">Retry</button>
                </div>`;
            }

            throw e; // re-throw so callers can handle if needed
        }
    },

    /**
     * Append a new item to a container with an enter animation.
     * Use for adding a single row/card to an existing list.
     */
    async add(target, url, data = {}) {
        const container = _resolve(target);
        if (!container) return;

        const html    = await _load(url);
        const wrapper = document.createElement('div');
        wrapper.innerHTML = render(html, data);
        fill(wrapper, data);

        const el = wrapper.firstElementChild || wrapper;
        container.appendChild(el);
        await _enter(el);
        return el;
    },

    /**
     * Animate an element out, then remove it from the DOM.
     * Use for deleting a row, dismissing a card, etc.
     */
    async remove(target) {
        const el = _resolve(target);
        if (!el) return;
        await _leave(el);
        el.remove();
    },

    /**
     * Re-render an element with new data and flash a highlight.
     * Use when a value changes and you want the user to notice.
     */
    async update(target, data = {}) {
        const el = _resolve(target);
        if (!el) return;
        fill(el, data);
        await _flash(el);
    },

    /**
     * Pre-fetch and cache a component without mounting it.
     * Call during app init to avoid loading delays on first navigation.
     */
    async prefetch(url) {
        await _load(url);
    },

    /**
     * Override default CSS transitions with custom animation library.
     * Each hook receives the element and should return a Promise or void.
     *
     *   component.hooks({
     *       entering: (el) => gsap.from(el, { opacity: 0, duration: 0.3 }),
     *       leaving:  (el) => gsap.to(el,   { opacity: 0, duration: 0.2 }),
     *       updated:  (el) => gsap.fromTo(el, { background: '#fffbe6' }, { background: 'transparent' })
     *   });
     */
    hooks(overrides = {}) {
        _hooks = { ..._hooks, ...overrides };
    },

    /**
     * Clear the component HTML cache.
     * Useful during development or after a deploy.
     */
    clearCache(url) {
        if (url) _cache.delete(url);
        else _cache.clear();
    }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _resolve(target) {
    if (!target) return null;
    if (typeof target === 'string') {
        const el = document.querySelector(target);
        if (!el) console.warn(`[oja/component] element not found: ${target}`);
        return el;
    }
    return target;
}