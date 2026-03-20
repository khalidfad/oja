import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { layout } from '../../src/js/core/layout.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Minimal Out-compatible object so we can test inject/slot without a real fetch.
function makeOut(html) {
    return {
        __isOut: true,
        render: vi.fn(async (el) => { el.innerHTML = html; }),
        getText: () => html,
    };
}

// layout.inject/slot check Out.is() which tests for __isOut.
// Patch Out.is at the module level via the import side-effect shim below.
// Since Out is imported inside layout.js we patch via a global sentinel.

beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
});

// ─── inject() ─────────────────────────────────────────────────────────────────

describe('layout.inject()', () => {
    it('writes an HTML string into an element matched by selector', async () => {
        const container = document.createElement('div');
        container.innerHTML = '<span id="target"></span>';
        document.body.appendChild(container);

        // Simulate an active layout by calling a minimal apply-like shim.
        // inject() falls back to the last active container; we provide it explicitly.
        await layout.inject('#target', '<b>hello</b>', container);

        const el = container.querySelector('#target');
        expect(el.innerHTML).toBe('<b>hello</b>');
    });

    it('warns and returns this when no layout is mounted and no target provided', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        // Pass a container that is not in _active — inject() will try to use
        // _lastContainer() which may be null if nothing has ever been applied.
        const result = await layout.inject('#missing');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('inject()'));
        warn.mockRestore();
        expect(result).toBe(layout); // returns this for chaining
    });

    it('warns when the selector matches nothing inside the container', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const container = document.createElement('div');
        document.body.appendChild(container);

        await layout.inject('#nope', '<p>x</p>', container);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('#nope'));
        warn.mockRestore();
    });

    it('emits layout:injected after a successful injection', async () => {
        const container = document.createElement('div');
        container.innerHTML = '<div class="slot"></div>';
        document.body.appendChild(container);

        const handler = vi.fn();
        document.addEventListener('layout:injected', handler);

        await layout.inject('.slot', '<span>ok</span>', container);

        document.removeEventListener('layout:injected', handler);
        expect(handler).toHaveBeenCalled();
    });

    it('targets by arbitrary CSS selector, not just [data-slot]', async () => {
        const container = document.createElement('div');
        container.innerHTML = '<footer class="page-footer"></footer>';
        document.body.appendChild(container);

        await layout.inject('.page-footer', '<p>footer content</p>', container);

        expect(container.querySelector('.page-footer').innerHTML).toBe('<p>footer content</p>');
    });
});

// ─── onReady() ────────────────────────────────────────────────────────────────

describe('layout.onReady()', () => {
    it('calls the hook when layout:mounted fires (outside a script context)', async () => {
        const fn = vi.fn();
        layout.onReady(fn);

        document.dispatchEvent(new CustomEvent('layout:mounted'));
        // CustomEvent is synchronous in jsdom
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('only fires once — subsequent layout:mounted events do not re-trigger it', async () => {
        const fn = vi.fn();
        layout.onReady(fn);

        document.dispatchEvent(new CustomEvent('layout:mounted'));
        document.dispatchEvent(new CustomEvent('layout:mounted'));
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns the layout object for chaining', () => {
        const result = layout.onReady(() => {});
        expect(result).toBe(layout);
    });
});

// ─── slot() ───────────────────────────────────────────────────────────────────

describe('layout.slot()', () => {
    it('fills a [data-slot] element with an HTML string', async () => {
        const container = document.createElement('div');
        container.innerHTML = '<div data-slot="main"></div>';
        document.body.appendChild(container);

        await layout.slot('main', '<p>content</p>', container);

        expect(container.querySelector('[data-slot="main"]').innerHTML).toBe('<p>content</p>');
    });

    it('warns when the named slot does not exist', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const container = document.createElement('div');
        document.body.appendChild(container);

        await layout.slot('ghost', '<p>x</p>', container);

        expect(warn).toHaveBeenCalledWith(expect.stringContaining('ghost'));
        warn.mockRestore();
    });

    it('warns and returns this when no layout is mounted', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const result = await layout.slot('nav', '<nav/>');
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('slot()'));
        warn.mockRestore();
        expect(result).toBe(layout);
    });

    it('emits layout:slot after successful fill', async () => {
        const container = document.createElement('div');
        container.innerHTML = '<div data-slot="footer"></div>';
        document.body.appendChild(container);

        const handler = vi.fn();
        document.addEventListener('layout:slot', handler);

        await layout.slot('footer', '<footer>ok</footer>', container);

        document.removeEventListener('layout:slot', handler);
        expect(handler).toHaveBeenCalled();
    });
});