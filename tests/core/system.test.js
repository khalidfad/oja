import { describe, it, expect, vi, afterEach } from 'vitest';
import { defer, withDefer } from '../../src/js/core/system.js';

// ─── defer() ──────────────────────────────────────────────────────────────────

describe('defer()', () => {

    it('runs registered functions in LIFO order', async () => {
        const d = defer();
        const order = [];

        d.defer(() => order.push('first'));
        d.defer(() => order.push('second'));
        d.defer(() => order.push('third'));

        await d.cleanup();

        expect(order).toEqual(['third', 'second', 'first']);
    });

    it('runs with no registered functions without error', async () => {
        const d = defer();
        await expect(d.cleanup()).resolves.not.toThrow();
    });

    it('calls the registered function exactly once per cleanup()', async () => {
        const d = defer();
        const fn = vi.fn();
        d.defer(fn);
        await d.cleanup();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('clears the queue after cleanup — second cleanup() is a no-op', async () => {
        const d = defer();
        const fn = vi.fn();
        d.defer(fn);
        await d.cleanup();
        await d.cleanup();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('captures arguments at defer() call time, not cleanup time', async () => {
        const d = defer();
        const received = [];
        let val = 'original';
        d.defer((v) => received.push(v), val);
        val = 'mutated';
        await d.cleanup();
        expect(received).toEqual(['original']);
    });

    it('passes multiple arguments to the cleanup function', async () => {
        const d = defer();
        let received;
        d.defer((...args) => { received = args; }, 'a', 'b', 'c');
        await d.cleanup();
        expect(received).toEqual(['a', 'b', 'c']);
    });

    it('awaits async cleanup functions', async () => {
        const d = defer();
        let done = false;
        d.defer(async () => {
            await new Promise(r => setTimeout(r, 10));
            done = true;
        });
        await d.cleanup();
        expect(done).toBe(true);
    });

    it('runs all cleanups even when one throws — error isolation', async () => {
        const d = defer();
        const ran = [];
        d.defer(() => ran.push('first'));
        d.defer(() => { throw new Error('boom'); });
        d.defer(() => ran.push('third'));

        await d.cleanup();

        expect(ran).toContain('first');
        expect(ran).toContain('third');
    });

    it('collects errors in d.errors after cleanup', async () => {
        const d = defer();
        d.defer(() => { throw new Error('e1'); });
        d.defer(() => { throw new Error('e2'); });

        await d.cleanup();

        expect(d.errors).toHaveLength(2);
        expect(d.errors[0].message).toBe('e2');
        expect(d.errors[1].message).toBe('e1');
    });

    it('isolates errors from async cleanup functions', async () => {
        const d = defer();
        const ran = [];
        d.defer(() => ran.push('sync'));
        d.defer(async () => { throw new Error('async boom'); });

        await d.cleanup();

        expect(ran).toContain('sync');
        expect(d.errors).toHaveLength(1);
    });

    it('throws TypeError when defer() receives a non-function', () => {
        const d = defer();
        expect(() => d.defer('not a function')).toThrow(TypeError);
        expect(() => d.defer(42)).toThrow(TypeError);
        expect(() => d.defer(null)).toThrow(TypeError);
    });

    it('supports multiple registrations across multiple cleanup() calls', async () => {
        const d = defer();
        const log = [];

        d.defer(() => log.push('a'));
        await d.cleanup();

        d.defer(() => log.push('b'));
        await d.cleanup();

        expect(log).toEqual(['a', 'b']);
    });

    it('d.errors starts as an empty array', () => {
        const d = defer();
        expect(d.errors).toEqual([]);
    });
});

// ─── withDefer() ──────────────────────────────────────────────────────────────

describe('withDefer()', () => {

    it('passes a defer instance as the first argument', async () => {
        let received = null;
        await withDefer((d) => { received = d; });
        expect(typeof received.defer).toBe('function');
        expect(typeof received.cleanup).toBe('function');
    });

    it('calls cleanup after fn returns', async () => {
        const log = [];
        await withDefer((d) => {
            d.defer(() => log.push('cleaned'));
        });
        expect(log).toContain('cleaned');
    });

    it('calls cleanup even when fn throws', async () => {
        const log = [];
        await expect(
            withDefer((d) => {
                d.defer(() => log.push('cleaned despite throw'));
                throw new Error('fn error');
            })
        ).rejects.toThrow('fn error');
        expect(log).toContain('cleaned despite throw');
    });

    it('returns the value returned by fn', async () => {
        const result = await withDefer(() => 42);
        expect(result).toBe(42);
    });

    it('returns the resolved value of an async fn', async () => {
        const result = await withDefer(async () => 'async result');
        expect(result).toBe('async result');
    });

    it('runs cleanup in LIFO order', async () => {
        const order = [];
        await withDefer((d) => {
            d.defer(() => order.push('first'));
            d.defer(() => order.push('second'));
        });
        expect(order).toEqual(['second', 'first']);
    });

    it('awaits async deferred functions', async () => {
        let done = false;
        await withDefer((d) => {
            d.defer(async () => {
                await new Promise(r => setTimeout(r, 5));
                done = true;
            });
        });
        expect(done).toBe(true);
    });
});