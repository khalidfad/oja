/**
 * oja/notify.js
 * Toast notifications and persistent banners.
 * Zero markup required — Oja injects and manages its own container.
 * App styles via .oja-toast-* and .oja-banner-* CSS classes.
 *
 * ─── Toasts ───────────────────────────────────────────────────────────────────
 *
 *   import { notify } from '../oja/notify.js';
 *
 *   notify.success('Host added successfully');
 *   notify.error('Connection failed');
 *   notify.warn('Session expires in 5 minutes');
 *   notify.info('3 hosts updated');
 *
 *   // With options
 *   notify.success('Deployed', { duration: 5000, dismissible: true });
 *
 *   // With action button
 *   notify.error('Deploy failed', {
 *       action: { label: 'View logs', fn: () => router.navigate('/logs') }
 *   });
 *
 *   // With Responder (rich content)
 *   notify.show(Responder.html('<strong>3 hosts</strong> updated'));
 *
 * ─── Banners (persistent) ────────────────────────────────────────────────────
 *
 *   notify.banner('⚠️ Connection lost. Reconnecting...', { type: 'warn' });
 *   notify.dismissBanner();
 *
 * ─── Conditional and event-driven ────────────────────────────────────────────
 *
 *   notify.if(condition, 'Message shown only when condition is true');
 *   notify.on('api:offline',  () => notify.banner('Connection lost', { type: 'warn' }));
 *   notify.on('api:online',   () => { notify.dismissBanner(); notify.success('Reconnected'); });
 *
 * ─── Session lifecycle integration ───────────────────────────────────────────
 *
 *   notify.on('auth:expiring', ({ ms }) =>
 *       notify.warn(`Session expires in ${Math.round(ms/60000)}m`, {
 *           action: { label: 'Renew', fn: () => auth.session.renew() }
 *       })
 *   );
 *
 * ─── Position ─────────────────────────────────────────────────────────────────
 *
 *   notify.setPosition('top-right');     // default
 *   notify.setPosition('top-left');
 *   notify.setPosition('top-center');
 *   notify.setPosition('bottom-right');
 *   notify.setPosition('bottom-left');
 *   notify.setPosition('bottom-center');
 */

import { listen, emit } from './events.js';
import { Responder }    from './responder.js';

// ─── State ────────────────────────────────────────────────────────────────────

let _container  = null;
let _banner     = null;
let _position   = 'top-right';
let _idCounter  = 0;

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPES = {
    success : { cls: 'oja-toast-success', icon: '✓' },
    error   : { cls: 'oja-toast-error',   icon: '✕' },
    warn    : { cls: 'oja-toast-warn',    icon: '⚠' },
    info    : { cls: 'oja-toast-info',    icon: 'ℹ' },
};

const DEFAULTS = {
    duration    : 4000,   // ms — 0 = persistent until dismissed
    dismissible : true,
    action      : null,   // { label, fn }
};

// ─── Public API ───────────────────────────────────────────────────────────────

export const notify = {

    success(message, options = {}) {
        return _show('success', message, options);
    },

    error(message, options = {}) {
        return _show('error', message, { duration: 6000, ...options });
    },

    warn(message, options = {}) {
        return _show('warn', message, options);
    },

    info(message, options = {}) {
        return _show('info', message, options);
    },

    /**
     * Show a Responder as a toast — for rich content.
     *
     *   notify.show(Responder.html('<strong>Deploy</strong> complete — 3 hosts'));
     */
    show(responder, options = {}) {
        if (!Responder.is(responder)) {
            return _show('info', String(responder), options);
        }
        return _showResponder(responder, options);
    },

    /**
     * Show only when condition is true.
     *
     *   notify.if(errors > 0, `${errors} errors found`);
     */
    if(condition, message, options = {}) {
        if (condition) _show('info', message, options);
        return this;
    },

    /**
     * Listen to a CustomEvent and run handler when it fires.
     * Thin wrapper over events.js listen() — kept here for discoverability.
     *
     *   notify.on('api:offline', () => notify.banner('Connection lost'));
     */
    on(eventName, handler) {
        return listen(eventName, handler);
    },

    // ─── Banner ───────────────────────────────────────────────────────────────

    /**
     * Show a persistent banner — one at a time, replaces previous.
     * Use for offline state, session warnings, system messages.
     * Inserts at the very top of <body> above all other content.
     *
     *   notify.banner('⚠️ Connection lost', { type: 'warn' });
     */
    banner(message, options = {}) {
        // Remove existing banner first
        _banner?.remove();

        const type = options.type || 'warn';
        const meta = TYPES[type] || TYPES.warn;

        _banner = document.createElement('div');
        _banner.className = `oja-banner oja-banner-${type}`;
        _banner.setAttribute('role', 'alert');
        _banner.innerHTML = `
            <span class="oja-banner-icon">${meta.icon}</span>
            <span class="oja-banner-msg">${_esc(message)}</span>
            ${options.action
            ? `<button class="oja-banner-action">${_esc(options.action.label)}</button>`
            : ''}
            ${options.dismissible !== false
            ? `<button class="oja-banner-dismiss" aria-label="Dismiss">✕</button>`
            : ''}
        `;

        if (options.action) {
            _banner.querySelector('.oja-banner-action')
                ?.addEventListener('click', options.action.fn);
        }

        _banner.querySelector('.oja-banner-dismiss')
            ?.addEventListener('click', () => notify.dismissBanner());

        // Always insert at the very top of body
        document.body.insertBefore(_banner, document.body.firstChild);

        emit('notify:banner', { message, type });
        return this;
    },

    /**
     * Remove the current banner with a fade-out animation.
     */
    dismissBanner() {
        if (_banner) {
            _banner.classList.add('oja-banner-leaving');
            setTimeout(() => {
                _banner?.remove();
                _banner = null;
            }, 200);
        }
        return this;
    },

    // ─── Position ─────────────────────────────────────────────────────────────

    /**
     * Set toast position. Takes effect immediately if container exists.
     * 'top-right' | 'top-left' | 'top-center' | 'bottom-right' | 'bottom-left' | 'bottom-center'
     *
     * Default: 'top-right'
     */
    setPosition(position) {
        _position = position;
        if (_container) {
            _container.className = `oja-toast-container oja-toast-${position}`;
        }
        return this;
    },

    // ─── Dismiss ──────────────────────────────────────────────────────────────

    /** Dismiss all visible toasts immediately */
    dismissAll() {
        _container?.querySelectorAll('.oja-toast').forEach(_dismiss);
        return this;
    }
};

// ─── Core ─────────────────────────────────────────────────────────────────────

function _show(type, message, options = {}) {
    _ensureContainer();

    const opts = { ...DEFAULTS, ...options };
    const meta = TYPES[type] || TYPES.info;
    const id   = `oja-toast-${++_idCounter}`;

    const toast = document.createElement('div');
    toast.id        = id;
    toast.className = `oja-toast ${meta.cls}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    toast.innerHTML = `
        <span class="oja-toast-icon">${meta.icon}</span>
        <span class="oja-toast-msg">${_esc(message)}</span>
        ${opts.action
        ? `<button class="oja-toast-action">${_esc(opts.action.label)}</button>`
        : ''}
        ${opts.dismissible
        ? `<button class="oja-toast-close" aria-label="Dismiss">✕</button>`
        : ''}
    `;

    if (opts.action) {
        toast.querySelector('.oja-toast-action')
            ?.addEventListener('click', () => {
                opts.action.fn();
                _dismiss(toast);
            });
    }

    if (opts.dismissible) {
        toast.querySelector('.oja-toast-close')
            ?.addEventListener('click', () => _dismiss(toast));
    }

    _container.appendChild(toast);

    // Trigger enter animation on next frame (allows CSS transition to play)
    requestAnimationFrame(() => toast.classList.add('oja-toast-visible'));

    // Auto-dismiss
    if (opts.duration > 0) {
        setTimeout(() => _dismiss(toast), opts.duration);
    }

    emit('notify:toast', { id, type, message });
    return id;
}

async function _showResponder(responder, options = {}) {
    _ensureContainer();

    const opts  = { ...DEFAULTS, ...options };
    const id    = `oja-toast-${++_idCounter}`;

    const toast = document.createElement('div');
    toast.id        = id;
    toast.className = `oja-toast oja-toast-custom`;
    toast.setAttribute('role', 'status');

    const body  = document.createElement('span');
    body.className = 'oja-toast-msg';
    toast.appendChild(body);

    if (opts.dismissible) {
        const btn = document.createElement('button');
        btn.className   = 'oja-toast-close';
        btn.setAttribute('aria-label', 'Dismiss');
        btn.textContent = '✕';
        btn.addEventListener('click', () => _dismiss(toast));
        toast.appendChild(btn);
    }

    _container.appendChild(toast);
    await responder.render(body);
    requestAnimationFrame(() => toast.classList.add('oja-toast-visible'));

    if (opts.duration > 0) {
        setTimeout(() => _dismiss(toast), opts.duration);
    }

    return id;
}

function _dismiss(toast) {
    if (!toast || toast.classList.contains('oja-toast-leaving')) return;
    toast.classList.add('oja-toast-leaving');
    toast.classList.remove('oja-toast-visible');
    setTimeout(() => toast.remove(), 300);
}

function _ensureContainer() {
    if (_container && document.body.contains(_container)) return;

    _container = document.createElement('div');
    _container.className = `oja-toast-container oja-toast-${_position}`;
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(_container);
}

function _esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}