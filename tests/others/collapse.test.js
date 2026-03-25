import { describe, it, expect, vi, beforeEach } from 'vitest';
import { collapse, accordion } from '../../src/js/ui/collapse.js';

beforeEach(() => {
    document.body.innerHTML = '';
    // Stub animate.collapse/expand since they rely on DOM transitions
    vi.mock('../../src/js/core/animate.js', () => ({
        animate: {
            collapse: vi.fn(() => Promise.resolve()),
            expand:   vi.fn(() => Promise.resolve()),
        },
    }));
});

// ─── collapse.attach() ────────────────────────────────────────────────────────

describe('collapse.attach(trigger, panel)', () => {
    it('returns a handle with open/close/toggle/isOpen/destroy', () => {
        const trigger = document.createElement('button');
        const panel   = document.createElement('div');
        panel.id = 'test-panel';
        document.body.appendChild(trigger);
        document.body.appendChild(panel);

        const handle = collapse.attach(trigger, panel);
        expect(typeof handle.open).toBe('function');
        expect(typeof handle.close).toBe('function');
        expect(typeof handle.toggle).toBe('function');
        expect(typeof handle.isOpen).toBe('function');
        expect(typeof handle.destroy).toBe('function');
    });

    it('starts closed by default (panel display:none)', () => {
        const trigger = document.createElement('button');
        const panel   = document.createElement('div');
        document.body.appendChild(trigger);
        document.body.appendChild(panel);

        collapse.attach(trigger, panel, { animation: false });
        expect(panel.style.display).toBe('none');
    });

    it('starts open when { open: true }', () => {
        const trigger = document.createElement('button');
        const panel   = document.createElement('div');
        document.body.appendChild(trigger);
        document.body.appendChild(panel);

        collapse.attach(trigger, panel, { open: true, animation: false });
        expect(panel.style.display).not.toBe('none');
    });

    it('isOpen() reflects state correctly', async () => {
        const trigger = document.createElement('button');
        const panel   = document.createElement('div');
        document.body.appendChild(trigger);
        document.body.appendChild(panel);

        const handle = collapse.attach(trigger, panel, { animation: false });
        expect(handle.isOpen()).toBe(false);
        await handle.open();
        expect(handle.isOpen()).toBe(true);
        await handle.close();
        expect(handle.isOpen()).toBe(false);
    });

    it('sets aria-expanded on trigger', async () => {
        const trigger = document.createElement('button');
        const panel   = document.createElement('div');
        document.body.appendChild(trigger);
        document.body.appendChild(panel);

        const handle = collapse.attach(trigger, panel, { animation: false });
        expect(trigger.getAttribute('aria-expanded')).toBe('false');
        await handle.open();
        expect(trigger.getAttribute('aria-expanded')).toBe('true');
    });

    it('returns nullHandle when panel not found', () => {
        const handle = collapse.attach('#nonexistent-trigger', '#nonexistent-panel');
        expect(() => handle.open()).not.toThrow();
        expect(() => handle.close()).not.toThrow();
        expect(handle.isOpen()).toBe(false);
    });
});

// ─── collapse imperative API ──────────────────────────────────────────────────

describe('collapse.show() / hide() / toggle()', () => {
    it('show() makes the element visible (no animation)', async () => {
        const el = document.createElement('div');
        el.style.display = 'none';
        document.body.appendChild(el);
        await collapse.show(el, { animation: false });
        expect(el.style.display).not.toBe('none');
    });

    it('hide() sets display:none (no animation)', async () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        await collapse.hide(el, { animation: false });
        expect(el.style.display).toBe('none');
    });

    it('toggle() flips visibility', async () => {
        const el = document.createElement('div');
        el.style.display = 'none';
        document.body.appendChild(el);
        await collapse.toggle(el, { animation: false });
        expect(el.style.display).not.toBe('none');
        await collapse.toggle(el, { animation: false });
        expect(el.style.display).toBe('none');
    });
});

// ─── accordion.render() ───────────────────────────────────────────────────────

describe('accordion.render(container, items)', () => {
    it('renders one item per entry', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        accordion.render(container, [
            { key: 'a', label: 'Alpha', content: '<p>Content A</p>' },
            { key: 'b', label: 'Beta',  content: '<p>Content B</p>' },
        ], { animation: false });

        const items = container.querySelectorAll('.oja-accordion-item');
        expect(items.length).toBe(2);
    });

    it('renders trigger buttons with labels', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        accordion.render(container, [
            { key: 'x', label: 'My Question', content: 'Answer' },
        ], { animation: false });

        const label = container.querySelector('.oja-accordion-label');
        expect(label?.textContent).toBe('My Question');
    });

    it('returns handle with open/close/isOpen/destroy', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = accordion.render(container, [
            { key: 'q1', label: 'Q1', content: 'A1' },
        ], { animation: false });

        expect(typeof handle.open).toBe('function');
        expect(typeof handle.close).toBe('function');
        expect(typeof handle.isOpen).toBe('function');
        expect(typeof handle.destroy).toBe('function');
    });

    it('openFirst: true opens the first item', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        accordion.render(container, [
            { key: 'first', label: 'First', content: 'Content' },
            { key: 'second', label: 'Second', content: 'Content 2' },
        ], { openFirst: true, animation: false });

        const firstBody = container.querySelector('.oja-accordion-body');
        expect(firstBody?.style.display).not.toBe('none');
    });

    it('destroy() clears container', () => {
        const container = document.createElement('div');
        document.body.appendChild(container);

        const handle = accordion.render(container, [
            { key: 'k', label: 'L', content: 'C' },
        ], { animation: false });

        handle.destroy();
        expect(container.innerHTML).toBe('');
    });
});
