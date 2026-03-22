/**
 * tests/core/system.test.js
 * Covers: timeout, interval, sleep, defer (timeout/interval integration), withDefer
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeout, interval, sleep, defer, withDefer } from '../../src/js/core/system.js';

describe('timeout()', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('calls fn after ms', () => {
        const fn = vi.fn();
        timeout(fn, 100);
        expect(fn).not.toHaveBeenCalled();
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledOnce();
    });

    it('returns a cancel function that prevents fn from firing', () => {
        const fn = vi.fn();
        const cancel = timeout(fn, 100);
        cancel();
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    it('calling cancel after fn already fired is a no-op', () => {
        const fn = vi.fn();
        const cancel = timeout(fn, 50);
        vi.advanceTimersByTime(50);
        expect(() => cancel()).not.toThrow();
        expect(fn).toHaveBeenCalledOnce();
    });

    it('throws TypeError when fn is not a function', () => {
        expect(() => timeout('not-a-fn', 100)).toThrow(TypeError);
        expect(() => timeout(null, 100)).toThrow(TypeError);
    });
});

describe('interval()', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('calls fn repeatedly at each tick', () => {
        const fn = vi.fn();
        const stop = interval(fn, 100);
        vi.advanceTimersByTime(350);
        stop();
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('returns a stop function that halts future ticks', () => {
        const fn = vi.fn();
        const stop = interval(fn, 100);
        vi.advanceTimersByTime(250);
        stop();
        vi.advanceTimersByTime(500);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('calling stop multiple times is safe', () => {
        const fn = vi.fn();
        const stop = interval(fn, 100);
        stop();
        expect(() => stop()).not.toThrow();
    });

    it('throws TypeError when fn is not a function', () => {
        expect(() => interval(42, 100)).toThrow(TypeError);
    });
});

describe('sleep()', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('returns a Promise that resolves after ms', async () => {
        const resolved = vi.fn();
        sleep(200).then(resolved);
        expect(resolved).not.toHaveBeenCalled();
        vi.advanceTimersByTime(200);
        await Promise.resolve(); // flush microtask queue
        expect(resolved).toHaveBeenCalledOnce();
    });

    it('sleep(0) resolves on next tick', async () => {
        const resolved = vi.fn();
        sleep(0).then(resolved);
        vi.advanceTimersByTime(0);
        await Promise.resolve();
        expect(resolved).toHaveBeenCalledOnce();
    });
});

describe('defer()', () => {
    it('runs deferred fns in LIFO order on cleanup', async () => {
        const d = defer();
        const order = [];
        d.defer(() => order.push(1));
        d.defer(() => order.push(2));
        d.defer(() => order.push(3));
        await d.cleanup();
        expect(order).toEqual([3, 2, 1]);
    });

    it('captures arguments eagerly (Go semantics)', async () => {
        const d = defer();
        const calls = [];
        let x = 'initial';
        d.defer((val) => calls.push(val), x);
        x = 'mutated';
        await d.cleanup();
        expect(calls).toEqual(['initial']); // captured at defer time, not cleanup time
    });

    it('isolates errors — all fns run even if one throws', async () => {
        const d = defer();
        const ran = [];
        d.defer(() => ran.push('a'));
        d.defer(() => { throw new Error('boom'); });
        d.defer(() => ran.push('c'));
        await d.cleanup();
        expect(ran).toContain('a');
        expect(ran).toContain('c');
        expect(d.errors).toHaveLength(1);
        expect(d.errors[0].message).toBe('boom');
    });

    it('cleanup is idempotent — second call is a no-op', async () => {
        const d = defer();
        const fn = vi.fn();
        d.defer(fn);
        await d.cleanup();
        await d.cleanup();
        expect(fn).toHaveBeenCalledOnce();
    });

    it('throws TypeError when non-function passed to defer()', () => {
        const d = defer();
        expect(() => d.defer('not-a-fn')).toThrow(TypeError);
    });

    it('supports async cleanup functions', async () => {
        const d = defer();
        const log = [];
        d.defer(async () => { log.push('async'); });
        d.defer(() => log.push('sync'));
        await d.cleanup();
        expect(log).toEqual(['sync', 'async']); // LIFO: sync registered last
    });

    describe('defer.timeout()', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('auto-cancels timeout on cleanup()', async () => {
            const d = defer();
            const fn = vi.fn();
            d.timeout(fn, 500);
            await d.cleanup(); // cancels before it fires
            vi.advanceTimersByTime(600);
            expect(fn).not.toHaveBeenCalled();
        });

        it('returns the cancel fn for early cancellation', () => {
            const d = defer();
            const fn = vi.fn();
            const cancel = d.timeout(fn, 500);
            cancel(); // cancel early
            vi.advanceTimersByTime(600);
            expect(fn).not.toHaveBeenCalled();
        });

        it('timeout that fires before cleanup does not error', async () => {
            const d = defer();
            const fn = vi.fn();
            d.timeout(fn, 100);
            vi.advanceTimersByTime(150); // fires
            await d.cleanup();           // cleanup tries to cancel already-fired timer — safe
            expect(fn).toHaveBeenCalledOnce();
            expect(d.errors).toHaveLength(0);
        });
    });

    describe('defer.interval()', () => {
        beforeEach(() => vi.useFakeTimers());
        afterEach(() => vi.useRealTimers());

        it('auto-stops interval on cleanup()', async () => {
            const d = defer();
            const fn = vi.fn();
            d.interval(fn, 100);
            vi.advanceTimersByTime(250); // 2 ticks
            await d.cleanup();
            vi.advanceTimersByTime(500); // no more ticks
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('returns the stop fn for early stopping', () => {
            const d = defer();
            const fn = vi.fn();
            const stop = d.interval(fn, 100);
            vi.advanceTimersByTime(150); // 1 tick
            stop();
            vi.advanceTimersByTime(300); // no more ticks
            expect(fn).toHaveBeenCalledTimes(1);
        });
    });
});

describe('withDefer()', () => {
    it('passes defer instance to fn and always calls cleanup', async () => {
        const cleanupCalled = vi.fn();
        await withDefer(async (d) => {
            d.defer(cleanupCalled);
        });
        expect(cleanupCalled).toHaveBeenCalledOnce();
    });

    it('returns the value from fn', async () => {
        const result = await withDefer(async () => 42);
        expect(result).toBe(42);
    });

    it('calls cleanup even when fn throws', async () => {
        const cleanupCalled = vi.fn();
        await expect(
            withDefer(async (d) => {
                d.defer(cleanupCalled);
                throw new Error('fn error');
            })
        ).rejects.toThrow('fn error');
        expect(cleanupCalled).toHaveBeenCalledOnce();
    });

    it('cleanup runs in LIFO order inside withDefer', async () => {
        const order = [];
        await withDefer(async (d) => {
            d.defer(() => order.push(1));
            d.defer(() => order.push(2));
        });
        expect(order).toEqual([2, 1]);
    });
});