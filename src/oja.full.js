/**
 * oja.full.js — full barrel entry point (core + all extensions)
 *
 * Use this when you want everything including extensions:
 *   import { Router, Out, OjaSocket, OjaWorker, canvas } from '../oja/src/oja.full.js';
 *
 * For production apps that need tree-shaking, import from oja.js (core)
 * and import only the specific extensions you use:
 *   import { Router, Out }     from '../oja/src/oja.js';
 *   import { OjaSocket }       from '../oja/src/js/ext/socket.js';
 *   import { canvas }          from '../oja/src/js/ui/canvas.js';
 *   import { infiniteScroll }  from '../oja/src/js/ext/infinitescroll.js';\n *   import { clipboard }       from '../oja/src/js/ui/clipboard.js';
 */

// ─── Everything in core (includes engine, formatter, register) ────────────────
export * from './oja.js';

// ─── Extensions — js/ext/ ────────────────────────────────────────────────────
// Opt-in modules for things beyond the core DOM layer.
// Import individually for better tree-shaking, or use this barrel for everything.

// Real-time (WebSocket + SSE)
export { OjaSSE, OjaSocket }                              from './js/ext/socket.js';

// Concurrency (threading + WebAssembly)
export { OjaWorker }                                      from './js/ext/worker.js';
export { OjaWasm }                                        from './js/ext/wasm.js';

// Peer-to-peer
export { webrtc }                                         from './js/ext/webrtc.js';

// Runtime utilities
export { cssVars }                                        from './js/ext/cssvars.js';
export { lazy }                                           from './js/ext/lazy.js';
export { exporter }                                       from './js/ext/export.js';

// Scroll patterns
export { infiniteScroll }                                 from './js/ext/infinitescroll.js';
export { pullToRefresh }                                  from './js/ext/pulltorefresh.js';

// Charts
export { chart }                                          from './js/ext/chart.js';

// ─── UI extensions — js/ui/ ──────────────────────────────────────────────────
// Opt-in DOM and interaction utilities.

export { canvas }                                         from './js/ui/canvas.js';
export { clipboard }                                      from './js/ui/clipboard.js';
export { dragdrop }                                       from './js/ui/dragdrop.js';