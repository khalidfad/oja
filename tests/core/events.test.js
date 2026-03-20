import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle, rafThrottle } from '../../src/js/core/events.js';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

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