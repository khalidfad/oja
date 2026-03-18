/**
 * oja/reactive.js
 * Fine-grained reactivity. Inspired by Svelte's reactive statements.
 * No virtual DOM — effects update real DOM directly and surgically.
 *
 * Usage:
 *   import { state, effect, derived, batch } from '../oja/reactive.js';
 *
 *   const [count, setCount] = state(0);
 *
 *   effect(() => {
 *       document.getElementById('count').textContent = count();
 *   });
 *
 *   setCount(1);        // effect re-runs automatically
 *   setCount(n => n+1); // functional update
 *
 *   const double = derived(() => count() * 2);
 *   double(); // → 2
 *
 *   // Batch multiple writes into one update cycle
 *   batch(() => {
 *       setCount(10);
 *       setName('Ade');
 *   });
 */

class ReactiveSystem {
    constructor() {
        this._currentEffect = null;
        this._effectQueue   = new Set();
        this._scheduled     = false;
        this._dirtyFlags    = new Map();
        this._dependencies  = new WeakMap();
    }

    // ─── state() ──────────────────────────────────────────────────────────────

    state(initialValue) {
        const subscribers = new Set();
        let value = initialValue;

        const read = () => {
            if (this._currentEffect) {
                subscribers.add(this._currentEffect);
                if (!this._dependencies.has(this._currentEffect)) {
                    this._dependencies.set(this._currentEffect, new Set());
                }
                this._dependencies.get(this._currentEffect).add(read);
            }
            return value;
        };

        const write = (newValue) => {
            if (typeof newValue === 'function') {
                newValue = newValue(value);
            }
            if (value === newValue) return;
            value = newValue;

            for (const effect of subscribers) {
                this._dirtyFlags.set(effect, true);
            }
            this._scheduleEffects([...subscribers]);
        };

        return [read, write];
    }

    // ─── derived() ────────────────────────────────────────────────────────────

    derived(fn) {
        const [read, write] = this.state(undefined);
        this.effect(() => write(fn()));
        return read;
    }

    // ─── effect() ─────────────────────────────────────────────────────────────

    effect(fn) {
        const run = () => {
            this._currentEffect = run;

            // Clean previous dependency subscriptions
            if (this._dependencies.has(run)) {
                this._dependencies.delete(run);
            }

            try {
                fn();
            } finally {
                this._currentEffect = null;
                this._dirtyFlags.delete(run);
            }
        };

        // Run immediately to collect dependencies
        run();

        // Return cleanup function
        return () => {
            this._dirtyFlags.delete(run);
            this._dependencies.delete(run);
        };
    }

    // ─── batch() ──────────────────────────────────────────────────────────────

    batch(fn) {
        // Track nesting depth — only the outermost batch flushes
        this._batchDepth = (this._batchDepth || 0) + 1;
        try {
            fn();
        } finally {
            this._batchDepth--;
            // Only flush when the outermost batch completes
            if (this._batchDepth === 0) {
                this._flush();
            }
        }
    }

    // ─── Internals ────────────────────────────────────────────────────────────

    _scheduleEffects(effects) {
        for (const effect of effects) {
            this._effectQueue.add(effect);
        }
        // Only schedule microtask if not inside a batch
        if (!this._batchDepth && !this._scheduled) {
            this._scheduled = true;
            queueMicrotask(() => this._flush());
        }
    }

    _flush() {
        const queue = [...this._effectQueue];
        this._effectQueue.clear();
        this._scheduled = false;

        for (const effect of queue) {
            if (this._dirtyFlags.has(effect)) {
                effect();
            }
        }
    }
}

// Single shared instance
const _sys = new ReactiveSystem();

export const state   = (v)  => _sys.state(v);
export const derived = (fn) => _sys.derived(fn);
export const effect  = (fn) => _sys.effect(fn);
export const batch   = (fn) => _sys.batch(fn);