import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    emit, listen, listenOnce, waitFor,
    debounce, throttle, rafThrottle,
} from '../../src/js/core/events.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

// ─── emit / listen ────────────────────────────────────────────────────────────

describe('emit() + listen()', () => {
    it('delivers detail to a registered listener', () => {
        const fn = vi.fn();
        const unsub = listen('test:basic', fn);
        emit('test:basic', { x: 1 });
        expect(fn).toHaveBeenCalledWith({ x: 1 }, expect.any(CustomEvent));
        unsub();
    });

    it('does not call listener after unsub', () => {
        const fn = vi.fn();
        const unsub = listen('test:unsub', fn);
        unsub();
        emit('test:unsub', {});
        expect(fn).not.toHaveBeenCalled();
    });

    it('delivers to multiple independent listeners on the same event', () => {
        const a = vi.fn();
        const b = vi.fn();
        const u1 = listen('test:multi', a);
        const u2 = listen('test:multi', b);
        emit('test:multi', { v: 42 });
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).toHaveBeenCalledTimes(1);
        u1(); u2();
    });

    it('passes an empty object when no detail is provided', () => {
        const fn = vi.fn();
        const unsub = listen('test:nodetail', fn);
        emit('test:nodetail');
        expect(fn).toHaveBeenCalledWith({}, expect.any(CustomEvent));
        unsub();
    });

    it('does not bleed events across different names', () => {
        const fn = vi.fn();
        const unsub = listen('test:isolated', fn);
        emit('test:other', {});
        expect(fn).not.toHaveBeenCalled();
        unsub();
    });
});

// ─── listenOnce ───────────────────────────────────────────────────────────────

describe('listenOnce()', () => {
    it('fires exactly once then stops', () => {
        const fn = vi.fn();
        listenOnce('test:once', fn);
        emit('test:once', {});
        emit('test:once', {});
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('returns an unsub that prevents the one-time call', () => {
        const fn = vi.fn();
        const unsub = listenOnce('test:once-cancel', fn);
        unsub();
        emit('test:once-cancel', {});
        expect(fn).not.toHaveBeenCalled();
    });
});

// ─── waitFor ──────────────────────────────────────────────────────────────────

describe('waitFor()', () => {
    it('resolves with the event detail when the event fires', async () => {
        const promise = waitFor('test:wait');
        emit('test:wait', { done: true });
        const result = await promise;
        expect(result).toEqual({ done: true });
    });

    it('rejects after timeout when no event fires', async () => {
        const promise = waitFor('test:timeout', 100);
        vi.advanceTimersByTime(100);
        await expect(promise).rejects.toThrow(/Timeout/);
    });
});

// ─── wildcard listener ────────────────────────────────────────────────────────

describe("listen('*')", () => {
    it('receives all emitted events', () => {
        const fn = vi.fn();
        const unsub = listen('*', fn);
        emit('test:wild-a', { a: 1 });
        emit('test:wild-b', { b: 2 });
        expect(fn).toHaveBeenCalledTimes(2);
        expect(fn).toHaveBeenCalledWith('test:wild-a', { a: 1 });
        expect(fn).toHaveBeenCalledWith('test:wild-b', { b: 2 });
        unsub();
    });

    it('stops receiving after unsub', () => {
        const fn = vi.fn();
        const unsub = listen('*', fn);
        unsub();
        emit('test:wild-gone', {});
        expect(fn).not.toHaveBeenCalled();
    });
});

// ─── debounce ─────────────────────────────────────────────────────────────────

describe('debounce()', () => {
    it('fires once after the delay when called multiple times', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced();
        debounced();
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('resets the timer on each call', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        vi.advanceTimersByTime(80);
        debounced();
        vi.advanceTimersByTime(80);
        expect(fn).not.toHaveBeenCalled();

        vi.advanceTimersByTime(20);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fires on leading edge when leading:true', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100, { leading: true });

        debounced();
        expect(fn).toHaveBeenCalledTimes(1);

        debounced();
        debounced();
        vi.advanceTimersByTime(100);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('cancel() prevents the pending call', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.cancel();
        vi.advanceTimersByTime(200);
        expect(fn).not.toHaveBeenCalled();
    });

    it('flush() fires immediately and cancels pending timer', () => {
        const fn = vi.fn();
        const debounced = debounce(fn, 100);

        debounced();
        debounced.flush();
        expect(fn).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(200);
        expect(fn).toHaveBeenCalledTimes(1);
    });
});

// ─── throttle ─────────────────────────────────────────────────────────────────

describe('throttle()', () => {
    it('fires immediately on first call', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('ignores subsequent calls within the interval', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        throttled();
        throttled();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('fires again after the interval elapses', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        vi.advanceTimersByTime(100);
        throttled();
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('cancel() resets state so next call fires immediately', () => {
        const fn = vi.fn();
        const throttled = throttle(fn, 100);

        throttled();
        throttled.cancel();
        throttled();
        expect(fn).toHaveBeenCalledTimes(2);
    });
});

// ─── rafThrottle ──────────────────────────────────────────────────────────────

describe('rafThrottle()', () => {
    it('fires the function on the next animation frame', () => {
        const fn = vi.fn();
        const throttled = rafThrottle(fn);

        throttled();
        expect(fn).not.toHaveBeenCalled();

        vi.runAllTimers();
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('coalesces multiple calls into one frame execution', () => {
        const fn = vi.fn();
        const throttled = rafThrottle(fn);

        throttled('a');
        throttled('b');
        throttled('c');
        vi.runAllTimers();

        expect(fn).toHaveBeenCalledTimes(1);
        expect(fn).toHaveBeenCalledWith('c');
    });

    it('cancel() prevents the pending frame from firing', () => {
        const fn = vi.fn();
        const throttled = rafThrottle(fn);

        throttled();
        throttled.cancel();
        vi.runAllTimers();
        expect(fn).not.toHaveBeenCalled();
    });
});