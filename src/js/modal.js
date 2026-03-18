/**
 * oja/modal.js
 * Modal stack — handles normal modals and cascading drawer/modal patterns.
 * Escape key and browser back always close the top of the stack.
 *
 * ─── Normal modal ─────────────────────────────────────────────────────────────
 *
 *   import { modal } from '../oja/modal.js';
 *
 *   modal.open('loginModal');
 *   modal.open('confirmModal', { message: 'Are you sure?' });
 *   modal.close();      // closes top of stack
 *   modal.closeAll();   // closes everything
 *
 * ─── Cascading drawers (admin pattern) ───────────────────────────────────────
 *
 *   // hosts page → open route drawer (level 1)
 *   modal.push('routeDrawer', { host: 'api.example.com', idx: 0 });
 *
 *   // inside route drawer → open backend drawer (level 2)
 *   modal.push('backendDrawer', { backend: backendData });
 *
 *   // inside backend drawer → confirm action (level 3)
 *   modal.push('confirmModal', { message: 'Delete backend?', onConfirm: fn });
 *
 *   // Escape or back → pop one level at a time
 *   modal.pop();   // closes confirmModal, backendDrawer still open
 *   modal.pop();   // closes backendDrawer, routeDrawer still open
 *   modal.pop();   // closes routeDrawer
 *
 * ─── Lifecycle hooks ──────────────────────────────────────────────────────────
 *
 *   modal.onOpen('routeDrawer', (data) => renderRouteDrawer(data));
 *   modal.onClose('routeDrawer', () => cleanup());
 *
 * ─── Dynamic content via Responder ───────────────────────────────────────────
 *
 *   modal.open('detailModal', {
 *       body: Responder.component('components/host-detail.html', hostData)
 *   });
 *
 * ─── HTML convention ──────────────────────────────────────────────────────────
 *
 *   <!-- Oja looks for [data-modal-body] inside the modal to render Responders -->
 *   <div class="modal-overlay" id="detailModal">
 *       <div class="modal">
 *           <button data-action="modal-close">&times;</button>
 *           <div data-modal-body></div>   ← Responder renders here
 *       </div>
 *   </div>
 *
 *   <!-- Drawers use the same pattern -->
 *   <div class="drawer" id="routeDrawer">
 *       <div class="drawer-content" data-modal-body></div>
 *   </div>
 *
 *   <!-- Backdrop -->
 *   <div class="drawer-backdrop" id="drawerBackdrop"></div>
 */

import { emit, listen, on } from './events.js';
import { Responder } from './responder.js';

// ─── Stack ────────────────────────────────────────────────────────────────────

// Each entry: { id, data, element }
const _stack    = [];

// Lifecycle hooks: id → { open: Set<fn>, close: Set<fn> }
const _hooks    = new Map();

// Backdrop element (shared across all drawers in admin pattern)
let _backdrop   = null;

// ─── Public API ───────────────────────────────────────────────────────────────

export const modal = {

    /**
     * Open a modal or drawer by element ID.
     * Data is passed to onOpen hooks and available as [data-modal-body] context.
     * Alias: modal.push() — semantic for drawer stacks.
     */
    open(id, data = {}) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`[oja/modal] element not found: #${id}`);
            return;
        }

        // Push onto stack
        _stack.push({ id, data, element: el });

        // Show element
        el.classList.add('active');
        el.setAttribute('aria-hidden', 'false');

        // Show backdrop if this is the first item on the stack
        if (_stack.length === 1) {
            _showBackdrop();
        }

        // Lock body scroll when modal is open
        if (!el.classList.contains('drawer')) {
            document.body.style.overflow = 'hidden';
        }

        // Render Responder body if provided
        if (data.body && Responder.is(data.body)) {
            const bodyEl = el.querySelector('[data-modal-body]');
            if (bodyEl) {
                data.body.render(bodyEl, data);
            }
        }

        // Fill any {{key}} in the modal with data
        if (Object.keys(data).length > 0) {
            _fillModal(el, data);
        }

        // Run onOpen hooks
        _runHooks(id, 'open', data);

        // Emit event
        emit('modal:open', { id, data });

        // Focus first focusable element
        _focusFirst(el);

        return this;
    },

    /** Alias for open() — more semantic for drawer stacks */
    push(id, data = {}) {
        return this.open(id, data);
    },

    /**
     * Close the top-most modal/drawer on the stack.
     * Alias: modal.pop()
     */
    close() {
        if (_stack.length === 0) return;
        const { id, element } = _stack.pop();

        element.classList.remove('active');
        element.setAttribute('aria-hidden', 'true');

        // Hide backdrop when stack is empty
        if (_stack.length === 0) {
            _hideBackdrop();
            document.body.style.overflow = '';
        }

        // Run onClose hooks
        _runHooks(id, 'close');

        // Emit event
        emit('modal:close', { id });

        return this;
    },

    /** Alias for close() */
    pop() {
        return this.close();
    },

    /**
     * Close a specific modal by ID, regardless of stack position.
     * Closes everything above it in the stack first.
     */
    closeById(id) {
        const idx = _stack.findIndex(entry => entry.id === id);
        if (idx === -1) return;

        // Close from top down to this entry
        while (_stack.length > idx) {
            this.close();
        }
        return this;
    },

    /**
     * Close everything.
     */
    closeAll() {
        while (_stack.length > 0) this.close();
        return this;
    },

    // ─── State ────────────────────────────────────────────────────────────────

    /** ID of the top-most open modal, or null */
    current() {
        return _stack.length > 0 ? _stack[_stack.length - 1].id : null;
    },

    /** Full stack as array of { id, data } */
    stack() {
        return _stack.map(({ id, data }) => ({ id, data }));
    },

    /** Is a specific modal currently open? */
    isOpen(id) {
        return _stack.some(entry => entry.id === id);
    },

    /** How deep is the stack? */
    depth() {
        return _stack.length;
    },

    // ─── Lifecycle hooks ──────────────────────────────────────────────────────

    /**
     * Register a handler called when a modal opens.
     * Handler receives the data passed to open().
     * Returns an unsubscribe function.
     *
     *   modal.onOpen('routeDrawer', (data) => renderRoute(data));
     */
    onOpen(id, handler) {
        _ensureHooks(id);
        _hooks.get(id).open.add(handler);
        return () => _hooks.get(id)?.open.delete(handler);
    },

    /**
     * Register a handler called when a modal closes.
     * Returns an unsubscribe function.
     *
     *   modal.onClose('routeDrawer', () => clearRouteState());
     */
    onClose(id, handler) {
        _ensureHooks(id);
        _hooks.get(id).close.add(handler);
        return () => _hooks.get(id)?.close.delete(handler);
    },

    // ─── Backdrop ─────────────────────────────────────────────────────────────

    /**
     * Register an element as the backdrop.
     * Clicking it closes the top-most modal.
     * Oja auto-detects #drawerBackdrop if this is not called.
     */
    setBackdrop(idOrElement) {
        _backdrop = typeof idOrElement === 'string'
            ? document.getElementById(idOrElement)
            : idOrElement;

        if (_backdrop) {
            _backdrop.addEventListener('click', () => modal.close());
        }
    },

    // ─── Confirm helper ───────────────────────────────────────────────────────

    /**
     * Programmatic confirm dialog.
     * Returns a Promise resolving to true (confirmed) or false (cancelled).
     *
     *   const confirmed = await modal.confirm('Delete this host?');
     *   if (confirmed) await api.delete(`/hosts/${id}`);
     *
     * Requires a #confirmModal in the HTML with:
     *   <p data-modal-field="message"></p>
     *   <button data-confirm-ok>Yes</button>
     *   <button data-confirm-cancel>Cancel</button>
     */
    confirm(message, options = {}) {
        return new Promise(resolve => {
            const id = options.modalId || 'confirmModal';
            modal.open(id, { message, ...options });

            const el = document.getElementById(id);
            if (!el) { resolve(false); return; }

            const msgEl = el.querySelector('[data-modal-field="message"]');
            if (msgEl) msgEl.textContent = message;

            const ok     = el.querySelector('[data-confirm-ok]');
            const cancel = el.querySelector('[data-confirm-cancel]');

            const cleanup = () => modal.closeById(id);

            const onOk = () => { cleanup(); resolve(true); };
            const onCancel = () => { cleanup(); resolve(false); };

            ok?.addEventListener('click',     onOk,     { once: true });
            cancel?.addEventListener('click', onCancel, { once: true });

            // Resolve false if modal is closed another way (Escape, backdrop)
            const unsub = listen('modal:close', ({ id: closedId }) => {
                if (closedId === id) { unsub(); resolve(false); }
            });
        });
    }
};

// Semantic alias
modal.push = modal.open;
modal.pop  = modal.close;

// ─── Keyboard and event wiring ────────────────────────────────────────────────

// Escape key closes top of stack
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _stack.length > 0) {
        e.preventDefault();
        modal.close();
    }
});

// Delegated close buttons — [data-action="modal-close"]
on('[data-action="modal-close"]', 'click', () => modal.close());
on('.close-modal',                'click', () => modal.close());
on('.drawer-close',               'click', () => modal.close());

// Auto-detect backdrop on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
    const backdrop = document.getElementById('drawerBackdrop')
        || document.getElementById('modalBackdrop');
    if (backdrop && !_backdrop) {
        modal.setBackdrop(backdrop);
    }
});

// ─── Internals ────────────────────────────────────────────────────────────────

function _showBackdrop() {
    if (!_backdrop) {
        _backdrop = document.getElementById('drawerBackdrop')
            || document.getElementById('modalBackdrop');
        if (_backdrop) {
            _backdrop.addEventListener('click', () => modal.close());
        }
    }
    if (_backdrop) _backdrop.classList.add('active');
}

function _hideBackdrop() {
    if (_backdrop) _backdrop.classList.remove('active');
}

function _ensureHooks(id) {
    if (!_hooks.has(id)) {
        _hooks.set(id, { open: new Set(), close: new Set() });
    }
}

function _runHooks(id, type, data) {
    _hooks.get(id)?.[type]?.forEach(fn => {
        try { fn(data); } catch (e) {
            console.warn(`[oja/modal] ${type} hook error for #${id}:`, e);
        }
    });
}

function _fillModal(el, data) {
    // Fill [data-modal-field="key"] elements
    el.querySelectorAll('[data-modal-field]').forEach(field => {
        const key = field.dataset.modalField;
        if (data[key] !== undefined) {
            field.textContent = data[key];
        }
    });
}

function _focusFirst(el) {
    requestAnimationFrame(() => {
        const focusable = el.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
    });
}