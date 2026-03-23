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
 *   modal.pop();
 *
 * ─── Lifecycle hooks ──────────────────────────────────────────────────────────
 *
 *   modal.onOpen('routeDrawer', (data) => renderRouteDrawer(data));
 *   modal.onClose('routeDrawer', () => cleanup());
 *
 * ─── Dynamic content via Out ─────────────────────────────────────────────────
 *
 *   modal.open('detailModal', {
 *       body: Out.c('components/host-detail.html', hostData)
 *   });
 *
 *   // Plain HTML strings are also accepted — auto-wrapped as Out.html():
 *   // Note: Experimental, Out is the primary display primitive
 *   modal.open('alertModal', {
 *       body: '<p>Are you sure you want to delete this?</p>'
 *   });
 *
 * ─── HTML convention ──────────────────────────────────────────────────────────
 *
 *   <!-- Oja looks for [data-modal-body] inside the modal to render Outs -->
 *   <div class="modal-overlay" id="detailModal">
 *       <div class="modal">
 *           <button data-action="modal-close">&times;</button>
 *           <div data-modal-body></div>   ← Out renders here
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

import { emit, listen, on } from '../core/events.js';
import { Out }              from '../core/out.js';

// ─── Focus trap ───────────────────────────────────────────────────────────────

const FOCUSABLE_SELECTORS = [
    'button:not([disabled])',
    '[href]:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"]):not([disabled])',
    'details:not([disabled])',
    '[contenteditable="true"]',
].join(',');

let _previousFocus    = null;
let _focusTrapActive  = false;
let _focusTrapElement = null;

function _setupFocusTrap(modalElement) {
    if (_focusTrapActive) return;

    _previousFocus    = document.activeElement;
    _focusTrapElement = modalElement;
    _focusTrapActive  = true;

    modalElement.addEventListener('keydown', _handleTrapKeydown);
    _focusFirstElement(modalElement);
}

function _releaseFocusTrap() {
    if (!_focusTrapActive) return;

    _focusTrapElement?.querySelectorAll('[data-oja-focus-fallback]').forEach(el => el.remove());
    _focusTrapElement?.removeEventListener('keydown', _handleTrapKeydown);
    _focusTrapActive = false;

    if (
        _previousFocus &&
        document.contains(_previousFocus) &&
        !_previousFocus.disabled &&
        !_previousFocus.hasAttribute('disabled') &&
        _previousFocus.offsetParent !== null
    ) {
        _previousFocus.focus();
    }

    _previousFocus    = null;
    _focusTrapElement = null;
}

function _handleTrapKeydown(e) {
    if (e.key !== 'Tab' || !_focusTrapActive || !_focusTrapElement) return;

    const focusable = Array.from(
        _focusTrapElement.querySelectorAll(FOCUSABLE_SELECTORS)
    ).filter(el => el.offsetParent !== null);

    if (focusable.length === 0) { e.preventDefault(); return; }

    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
}

function _focusFirstElement(container) {
    requestAnimationFrame(() => {
        const focusable = container.querySelector(FOCUSABLE_SELECTORS);
        if (focusable) {
            focusable.focus();
        } else {
            container.setAttribute('tabindex', '-1');
            container.focus();
        }
    });
}

function _getAllFocusable(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SELECTORS))
        .filter(el => el.offsetParent !== null);
}

// ─── Stack ────────────────────────────────────────────────────────────────────

const _stack = [];
const _hooks = new Map();
let   _backdrop = null;

// ─── Accessibility helpers ────────────────────────────────────────────────────

function _setAriaHidden(element, hidden) {
    if (!element) return;
    element.setAttribute('aria-hidden', hidden ? 'true' : 'false');
    if (element.classList.contains('drawer') || element.classList.contains('modal-overlay')) {
        if (hidden) element.setAttribute('inert', '');
        else        element.removeAttribute('inert');
    }
}

function _announce(message) {
    const announcer = document.getElementById('oja-announcer');
    if (!announcer) return;
    announcer.textContent = message;
}

// ─── Public API ───────────────────────────────────────────────────────────────

// Tracks any in-flight confirm promise resolver keyed by modal ID.
// A second call before the first resolves dismisses the previous one gracefully.
const _pendingConfirms = new Map();

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

        _setAriaHidden(el, false);
        _stack.push({ id, data, element: el });
        el.classList.add('active');

        const focusable = _getAllFocusable(el);

        if (focusable.length === 0) {
            console.warn(`[oja/modal] #${id} has no focusable elements — adding fallback`);
            const fallback = document.createElement('button');
            fallback.setAttribute('aria-label', 'Close modal');
            fallback.dataset.ojaFocusFallback = 'true';
            Object.assign(fallback.style, {
                position: 'absolute', width: '1px', height: '1px',
                padding: '0', margin: '-1px', overflow: 'hidden',
                clip: 'rect(0,0,0,0)', border: '0',
            });
            fallback.addEventListener('click', () => modal.close());
            el.appendChild(fallback);
        }

        _setupFocusTrap(el);

        if (_stack.length === 1) {
            _showBackdrop();
            document.body.style.overflow = 'hidden';
            document.body.setAttribute('aria-hidden', 'true');
        }

        if (data.body && Out.is(data.body)) {
            const bodyEl = el.querySelector('[data-modal-body]');
            if (bodyEl) data.body.render(bodyEl, data);
        } else if (typeof data.body === 'string') {
            // Convenience: plain HTML strings are auto-wrapped as Out.html()
            const bodyEl = el.querySelector('[data-modal-body]');
            if (bodyEl) Out.html(data.body).render(bodyEl, data);
        }

        if (data.footer && Out.is(data.footer)) {
            const footerEl = el.querySelector('[data-modal-footer]');
            if (footerEl) data.footer.render(footerEl, data);
        } else if (typeof data.footer === 'string') {
            const footerEl = el.querySelector('[data-modal-footer]');
            if (footerEl) Out.html(data.footer).render(footerEl, data);
        }

        if (Object.keys(data).length > 0) _fillModal(el, data);

        _runHooks(id, 'open', data);
        emit('modal:open', { id, data });
        _announce(`Opened ${el.getAttribute('aria-label') || id}`);

        return this;
    },

    /** Alias for open() — semantic for drawer stacks. */
    push(id, data = {}) { return this.open(id, data); },

    /**
     * Close the top-most modal/drawer on the stack.
     */
    close() {
        if (_stack.length === 0) return;

        const { id, element } = _stack.pop();
        element.classList.remove('active');
        _setAriaHidden(element, true);

        if (_stack.length === 0) {
            _releaseFocusTrap();
            _hideBackdrop();
            document.body.style.overflow = '';
            document.body.removeAttribute('aria-hidden');
        } else {
            const topElement = _stack[_stack.length - 1].element;
            _setupFocusTrap(topElement);
        }

        _runHooks(id, 'close');
        emit('modal:close', { id });
        _announce(`Closed ${element.getAttribute('aria-label') || id}`);

        return this;
    },

    /** Alias for close(). */
    pop() { return this.close(); },

    /**
     * Close a specific modal by ID, regardless of stack position.
     * Closes everything above it in the stack first.
     */
    closeById(id) {
        const idx = _stack.findIndex(entry => entry.id === id);
        if (idx === -1) return;
        while (_stack.length > idx) this.close();
        return this;
    },

    /** Close everything. */
    closeAll() {
        while (_stack.length > 0) this.close();
        return this;
    },

    // ─── State ────────────────────────────────────────────────────────────────

    current() { return _stack.length > 0 ? _stack[_stack.length - 1].id : null; },
    stack()   { return _stack.map(({ id, data }) => ({ id, data })); },
    isOpen(id){ return _stack.some(entry => entry.id === id); },
    depth()   { return _stack.length; },

    // ─── Lifecycle hooks ──────────────────────────────────────────────────────

    /**
     * Register a handler called when a modal opens.
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
     */
    setBackdrop(idOrElement) {
        _backdrop = typeof idOrElement === 'string'
            ? document.getElementById(idOrElement)
            : idOrElement;

        if (_backdrop) {
            _backdrop.setAttribute('aria-label', 'Close modal');
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
        const id = options.modalId || 'confirmModal';

        // If a confirm for this modal is already in flight, resolve it false
        // before opening a new one — prevents stacked click listeners on the
        // same ok/cancel buttons.
        const pending = _pendingConfirms.get(id);
        if (pending) {
            _pendingConfirms.delete(id);
            pending(false);
        }

        return new Promise(resolve => {
            _pendingConfirms.set(id, resolve);

            const done = (result) => {
                if (!_pendingConfirms.has(id)) return;
                _pendingConfirms.delete(id);
                resolve(result);
                modal.closeById(id);
            };

            modal.open(id, { message, ...options });

            const el = document.getElementById(id);
            if (!el) { done(false); return; }

            const msgEl = el.querySelector('[data-modal-field="message"]');
            if (msgEl) {
                msgEl.textContent = message;
                msgEl.id = 'confirm-message';
                el.setAttribute('aria-describedby', 'confirm-message');
            }

            const ok     = el.querySelector('[data-confirm-ok]');
            const cancel = el.querySelector('[data-confirm-cancel]');

            if (ok)     ok.setAttribute('aria-label',     options.okLabel     || 'Confirm');
            if (cancel) cancel.setAttribute('aria-label', options.cancelLabel || 'Cancel');

            ok?.addEventListener('click',     () => done(true),  { once: true });
            cancel?.addEventListener('click', () => done(false), { once: true });

            const unsub = listen('modal:close', ({ id: closedId }) => {
                if (closedId === id) { unsub(); done(false); }
            });
        });
    },

    // ─── Accessibility utilities ──────────────────────────────────────────────

    getFocusable(id) {
        const el = document.getElementById(id);
        return el ? _getAllFocusable(el) : [];
    },

    setFocus(id, selector) {
        const el = document.getElementById(id);
        if (!el) return;
        const target = selector ? el.querySelector(selector) : _getAllFocusable(el)[0];
        target?.focus();
    },
};

// ─── Keyboard and event wiring ────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || _stack.length === 0) return;
    e.preventDefault();

    const topModal     = _stack[_stack.length - 1];
    const cancelButton = topModal.element.querySelector(
        '[data-confirm-cancel], [data-action="modal-close"], .close-modal'
    );

    if (cancelButton) cancelButton.click();
    else modal.close();
});

on('[data-action="modal-close"]', 'click', () => modal.close());
on('.close-modal',   'click', () => modal.close());
on('.drawer-close',  'click', () => modal.close());

document.addEventListener('DOMContentLoaded', () => {
    const backdrop = document.getElementById('drawerBackdrop')
        || document.getElementById('modalBackdrop');
    if (backdrop && !_backdrop) modal.setBackdrop(backdrop);
});

// ─── Internals ────────────────────────────────────────────────────────────────

function _showBackdrop() {
    if (!_backdrop) {
        _backdrop = document.getElementById('drawerBackdrop')
            || document.getElementById('modalBackdrop');
        if (_backdrop) {
            _backdrop.setAttribute('aria-label', 'Close modal');
            _backdrop.addEventListener('click', () => modal.close());
        }
    }
    if (_backdrop) {
        _backdrop.classList.add('active');
        _setAriaHidden(_backdrop, false);
    }
}

function _hideBackdrop() {
    if (_backdrop) {
        _backdrop.classList.remove('active');
        _setAriaHidden(_backdrop, true);
    }
}

function _ensureHooks(id) {
    if (!_hooks.has(id)) _hooks.set(id, { open: new Set(), close: new Set() });
}

function _runHooks(id, type, data) {
    _hooks.get(id)?.[type]?.forEach(fn => {
        try { fn(data); } catch (e) {
            console.warn(`[oja/modal] ${type} hook error for #${id}:`, e);
        }
    });
}

function _fillModal(el, data) {
    el.querySelectorAll('[data-modal-field]').forEach(field => {
        const key = field.dataset.modalField;
        if (data[key] !== undefined) field.textContent = data[key];
    });

    if (data['aria-label']) el.setAttribute('aria-label', data['aria-label']);

    if (data['aria-description']) {
        // aria-description is not a valid ARIA attribute. The correct pattern
        // is aria-describedby pointing to a visually-hidden element that
        // contains the description text.
        const descId = `${el.id || 'oja-modal'}-desc`;
        let descEl   = el.querySelector(`#${descId}`);
        if (!descEl) {
            descEl = document.createElement('p');
            descEl.id = descId;
            descEl.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0';
            el.appendChild(descEl);
        }
        descEl.textContent = data['aria-description'];
        el.setAttribute('aria-describedby', descId);
    }

    // Only set role from a fixed allowlist. Accepting arbitrary role values
    // from caller-supplied data would allow attribute injection if data ever
    // originates from user input or an API response.
    const ALLOWED_ROLES = new Set(['dialog', 'alertdialog']);
    if (data['role'] && ALLOWED_ROLES.has(data['role'])) {
        el.setAttribute('role', data['role']);
    } else if (!el.getAttribute('role')) {
        el.setAttribute('role', 'dialog');
    }

    if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true');
}