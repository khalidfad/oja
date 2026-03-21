/**
 * oja/system.js
 * Go-style deferred cleanup — functions registered with defer() run in LIFO
 * order when cleanup() is called, regardless of whether the surrounding work
 * succeeded or failed. Supports both sync and async cleanup functions.
 *
 * The core difference from try/finally: cleanup is decoupled from control flow.
 * Register cleanup at the point of acquisition, not at the end of the function.
 *
 * ─── Basic usage ──────────────────────────────────────────────────────────────
 *
 *   import { defer } from '../oja/system.js';
 *
 *   const d = defer();
 *
 *   const conn = await db.connect();
 *   d.defer(conn.close.bind(conn));   // will run on cleanup
 *
 *   const stream = fs.open(path);
 *   d.defer(stream.destroy.bind(stream));
 *
 *   // ... do work ...
 *
 *   await d.cleanup();  // stream.destroy() then conn.close(), LIFO order
 *
 * ─── With Out.fn() ────────────────────────────────────────────────────────────
 *
 *   // The returned cleanup function is registered as an onUnmount hook —
 *   // it fires automatically when the component unmounts.
 *   Out.to('#chart').fn(async (el) => {
 *       const d = defer();
 *       const line = chart.line(el, values, timestamps, opts);
 *       d.defer(line.destroy.bind(line));
 *       return () => d.cleanup();
 *   });
 *
 * ─── With arguments (eager evaluation, Go semantics) ──────────────────────────
 *
 *   // Arguments are captured at defer() call time, not cleanup time.
 *   // This matches Go's `defer fn(args)` — args are evaluated immediately.
 *   d.defer(removeUser, userId);   // userId captured now
 *
 * ─── Async cleanup ────────────────────────────────────────────────────────────
 *
 *   d.defer(async () => {
 *       await cache.flush();
 *   });
 *   await d.cleanup();  // awaits each async fn in order
 *
 * ─── Error isolation ──────────────────────────────────────────────────────────
 *
 *   // A failing cleanup does not skip remaining cleanups.
 *   // All errors are collected and returned as d.errors after cleanup().
 *   await d.cleanup();
 *   if (d.errors.length) console.error('cleanup errors:', d.errors);
 *
 * ─── Scoped helper ────────────────────────────────────────────────────────────
 *
 *   // withDefer runs a function and always calls cleanup when it returns.
 *   // The defer instance is passed as the first argument.
 *   const result = await withDefer(async (d) => {
 *       const conn = await db.connect();
 *       d.defer(conn.close.bind(conn));
 *       return await conn.query('SELECT 1');
 *   });
 */

// Create a new defer scope.
// Returns { defer, cleanup, errors } where errors accumulates after cleanup().
export function defer() {
    const _fns = [];
    const _errors = [];

    return {
        errors: _errors,

        // Register a cleanup function with optional pre-evaluated arguments.
        // Arguments are captured now — Go semantics, not closure semantics.
        defer(fn, ...args) {
            if (typeof fn !== 'function') {
                throw new TypeError('[oja/defer] defer() requires a function');
            }
            _fns.push(args.length > 0 ? () => fn(...args) : fn);
        },

        // Run all registered functions in LIFO order.
        // Awaits async functions. Isolates errors so all cleanups run.
        // Safe to call multiple times — clears the queue after the first run.
        async cleanup() {
            const pending = _fns.splice(0).reverse();
            for (const fn of pending) {
                try {
                    await fn();
                } catch (e) {
                    _errors.push(e);
                    console.error('[oja/defer] cleanup error:', e);
                }
            }
        },
    };
}

// Run an async function with an auto-cleanup defer scope.
// cleanup() is always called when fn returns, whether it throws or not.
// The defer instance d is passed as the first argument to fn.
export async function withDefer(fn) {
    const d = defer();
    try {
        return await fn(d);
    } finally {
        await d.cleanup();
    }
}