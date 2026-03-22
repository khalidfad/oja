/**
 * oja/system.js
 *
 * Three complementary primitives for async lifecycle and cleanup:
 *
 *   timeout(fn, ms)       — setTimeout that returns a cancel function
 *   interval(fn, ms)      — setInterval that returns a stop function
 *   sleep(ms)             — Promise-based delay, no cleanup needed
 *   defer()               — Go-style cleanup scope; timeout/interval auto-register
 *   withDefer(fn)         — run async fn with guaranteed cleanup on exit
 *
 * ─── timeout / interval ───────────────────────────────────────────────────────
 *
 *   // Both return a cleanup function. Call it to cancel early.
 *   const cancel = timeout(() => save(), 5000);
 *   cancel(); // cancelled — fn never runs
 *
 *   const stop = interval(() => poll(), 2000);
 *   stop(); // stopped — no more ticks
 *
 * ─── sleep ────────────────────────────────────────────────────────────────────
 *
 *   // Promise-based delay. No ID to track, no cleanup needed.
 *   await sleep(1000);
 *   console.log('1 second later');
 *
 * ─── defer() — Go-style cleanup scope ────────────────────────────────────────
 *
 *   const d = defer();
 *
 *   const conn = await db.connect();
 *   d.defer(conn.close.bind(conn));       // registered for cleanup
 *
 *   d.timeout(() => session.expire(), 30_000);   // auto-cancelled on d.cleanup()
 *   d.interval(() => heartbeat(), 5000);          // auto-stopped on d.cleanup()
 *
 *   await d.cleanup();   // stops interval, cancels timeout, closes conn — LIFO
 *
 * ─── defer() with arguments (Go semantics) ────────────────────────────────────
 *
 *   // Arguments are captured at call time, not at cleanup time.
 *   d.defer(removeUser, userId);  // userId is captured now
 *
 * ─── withDefer — scoped helper ────────────────────────────────────────────────
 *
 *   const result = await withDefer(async (d) => {
 *       d.interval(() => poll(), 2000);  // auto-stopped when block exits
 *       return await doWork();
 *   });
 *
 * ─── Out.fn() integration ─────────────────────────────────────────────────────
 *
 *   Out.to('#chart').fn(async (el) => {
 *       const d = defer();
 *       const line = chart.line(el, vals, ts, opts);
 *       d.defer(line.destroy.bind(line));
 *       return () => d.cleanup();   // called on component unmount
 *   });
 *
 * ─── Error isolation ──────────────────────────────────────────────────────────
 *
 *   // A failing cleanup does not skip remaining cleanups.
 *   await d.cleanup();
 *   if (d.errors.length) console.error('cleanup errors:', d.errors);
 */

/**
 * Safe timeout — returns a cancel function.
 * Calling cancel() before the timer fires prevents fn from running.
 *
 * @param {Function} fn
 * @param {number}   ms
 * @returns {Function} cancel — call to abort early
 */
export function timeout(fn, ms) {
    if (typeof fn !== 'function') {
        throw new TypeError('[oja/timeout] requires a function');
    }
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
}

/**
 * Safe interval — returns a stop function.
 * Calling stop() halts future ticks immediately.
 *
 * @param {Function} fn
 * @param {number}   ms
 * @returns {Function} stop — call to halt the interval
 */
export function interval(fn, ms) {
    if (typeof fn !== 'function') {
        throw new TypeError('[oja/interval] requires a function');
    }
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
}

/**
 * Promise-based delay — no cleanup needed.
 * Safe to use in async functions; just await it.
 *
 * @param {number} ms
 * @returns {Promise<void>}
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a defer scope.
 * Returns { defer, timeout, interval, cleanup, errors }.
 *
 * - defer(fn, ...args) — register a cleanup function
 * - timeout(fn, ms)    — schedule a timeout; auto-cancelled on cleanup()
 * - interval(fn, ms)   — start an interval; auto-stopped on cleanup()
 * - cleanup()          — run all registered fns LIFO; isolates errors
 * - errors             — array populated with any errors thrown during cleanup
 */
export function defer() {
    const _fns    = [];
    const _errors = [];

    return {
        errors: _errors,

        /**
         * Register a cleanup function with optional pre-evaluated arguments.
         * Arguments are captured now — Go semantics, not closure semantics.
         */
        defer(fn, ...args) {
            if (typeof fn !== 'function') {
                throw new TypeError('[oja/defer] defer() requires a function');
            }
            _fns.push(args.length > 0 ? () => fn(...args) : fn);
        },

        /**
         * Schedule a timeout that is automatically cancelled by cleanup().
         * Returns the cancel function so it can also be cancelled early.
         */
        timeout(fn, ms) {
            const cancel = timeout(fn, ms);
            this.defer(cancel);
            return cancel;
        },

        /**
         * Start an interval that is automatically stopped by cleanup().
         * Returns the stop function so it can also be stopped early.
         */
        interval(fn, ms) {
            const stop = interval(fn, ms);
            this.defer(stop);
            return stop;
        },

        /**
         * Run all registered fns in LIFO order.
         * Awaits async fns. A failing cleanup does not skip remaining cleanups.
         * Clears the queue — safe to call multiple times.
         */
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

/**
 * Run an async function with a guaranteed cleanup defer scope.
 * cleanup() is always called on return, whether fn throws or not.
 * The defer instance is passed as the first argument to fn.
 *
 * @param {Function} fn  — async (d: DeferScope) => T
 * @returns {Promise<T>}
 */
export async function withDefer(fn) {
    const d = defer();
    try {
        return await fn(d);
    } finally {
        await d.cleanup();
    }
}