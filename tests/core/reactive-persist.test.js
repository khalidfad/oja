/**
 * Tests for context.persist — onQuotaExceeded callback and oja:quota-exceeded event.
 * These cover the new behaviour added in the plan.md P0 fix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { context } from '../../src/js/core/reactive.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

let keyCounter = 0;
function freshKey() { return `persist-test-${Date.now()}-${++keyCounter}`; }

function makeQuotaError() {
    const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
    // Some browsers set code 22
    Object.defineProperty(err, 'code', { value: 22 });
    return err;
}

// ─── onQuotaExceeded callback ─────────────────────────────────────────────────

describe('context.persist — onQuotaExceeded callback', () => {
    let key;
    let originalSetItem;

    beforeEach(() => {
        key = freshKey();
        originalSetItem = Storage.prototype.setItem;
    });

    afterEach(() => {
        Storage.prototype.setItem = originalSetItem;
        context.delete(key);
        window.removeEventListener('oja:quota-exceeded', () => {});
    });

    it('calls onQuotaExceeded when localStorage.setItem throws QuotaExceededError', async () => {
        const handler = vi.fn();

        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw makeQuotaError();
        });

        const [, setValue] = context.persist(key, 'initial', {
            onQuotaExceeded: handler,
        });

        setValue('trigger-quota');
        await Promise.resolve();

        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith(
            expect.stringContaining(key), // storage key contains the context key
            'trigger-quota',
            expect.any(Error)
        );
    });

    it('does not call onQuotaExceeded for non-quota errors', async () => {
        const handler = vi.fn();

        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw new Error('some other storage error');
        });

        const [, setValue] = context.persist(freshKey(), 'x', {
            onQuotaExceeded: handler,
        });

        setValue('boom');
        await Promise.resolve();

        expect(handler).not.toHaveBeenCalled();
    });

    it('works without onQuotaExceeded — does not throw', async () => {
        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw makeQuotaError();
        });

        const [, setValue] = context.persist(freshKey(), 'x');
        expect(() => setValue('trigger')).not.toThrow();
    });

    it('onQuotaExceeded throwing does not propagate', async () => {
        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw makeQuotaError();
        });

        const [, setValue] = context.persist(freshKey(), 'x', {
            onQuotaExceeded: () => { throw new Error('handler threw'); },
        });

        expect(() => setValue('boom')).not.toThrow();
    });
});

// ─── oja:quota-exceeded window event ──────────────────────────────────────────

describe('context.persist — oja:quota-exceeded window event', () => {
    let key;
    let originalSetItem;

    beforeEach(() => {
        key = freshKey();
        originalSetItem = Storage.prototype.setItem;
    });

    afterEach(() => {
        Storage.prototype.setItem = originalSetItem;
        context.delete(key);
    });

    it('dispatches oja:quota-exceeded on window when quota is hit', async () => {
        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw makeQuotaError();
        });

        const events = [];
        const listener = (e) => events.push(e.detail);
        window.addEventListener('oja:quota-exceeded', listener);

        const [, setValue] = context.persist(key, 'x');
        setValue('quota-trigger');
        await Promise.resolve();

        window.removeEventListener('oja:quota-exceeded', listener);

        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            key:     expect.stringContaining(key),
            storage: 'local',
            value:   'quota-trigger',
            error:   expect.any(Error),
        });
    });

    it('does not dispatch window event for non-quota errors', async () => {
        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw new Error('not a quota error');
        });

        const events = [];
        const listener = (e) => events.push(e);
        window.addEventListener('oja:quota-exceeded', listener);

        const [, setValue] = context.persist(freshKey(), 'x');
        setValue('boom');
        await Promise.resolve();

        window.removeEventListener('oja:quota-exceeded', listener);
        expect(events).toHaveLength(0);
    });

    it('fires window event even when no onQuotaExceeded callback is set', async () => {
        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw makeQuotaError();
        });

        const events = [];
        const listener = (e) => events.push(e.detail);
        window.addEventListener('oja:quota-exceeded', listener);

        const [, setValue] = context.persist(freshKey(), 'x');
        setValue('x');
        await Promise.resolve();

        window.removeEventListener('oja:quota-exceeded', listener);
        expect(events).toHaveLength(1);
    });

    it('fires both callback and window event when quota hit', async () => {
        Storage.prototype.setItem = vi.fn().mockImplementation(() => {
            throw makeQuotaError();
        });

        const cbCalls   = [];
        const evtCalls  = [];
        const listener  = (e) => evtCalls.push(e.detail);
        window.addEventListener('oja:quota-exceeded', listener);

        const [, setValue] = context.persist(freshKey(), 'x', {
            onQuotaExceeded: (k, v, e) => cbCalls.push({ k, v }),
        });
        setValue('both');
        await Promise.resolve();

        window.removeEventListener('oja:quota-exceeded', listener);

        expect(cbCalls).toHaveLength(1);
        expect(evtCalls).toHaveLength(1);
    });
});

// ─── Normal persist still works ───────────────────────────────────────────────

describe('context.persist — normal behaviour unchanged', () => {
    afterEach(() => {
        // Clean up all test keys
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k?.startsWith('oja:persist-test-')) localStorage.removeItem(k);
        }
    });

    it('persists and reads back a string value', () => {
        const k = freshKey();
        const [read, write] = context.persist(k, 'default');
        write('saved');
        expect(read()).toBe('saved');
        context.delete(k);
    });

    it('reads initial value from localStorage if present', () => {
        const k  = freshKey();
        const sk = `oja:${k}`;
        localStorage.setItem(sk, JSON.stringify('from-storage'));
        const [read] = context.persist(k, 'default');
        expect(read()).toBe('from-storage');
        context.delete(k);
        localStorage.removeItem(sk);
    });
});
