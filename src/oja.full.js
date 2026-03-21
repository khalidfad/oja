/**
 * oja.full.js — full barrel entry point (core + ui + ext + utils)
 *
 * Use this when you want everything:
 *   import { Router, Out, modal, chart, table, tabs, auth } from '../oja/src/oja.full.js';
 *
 * For production apps, import from the specific layer instead:
 *   import { Router, Out }    from '../oja/src/oja.js';           — kernel only
 *   import { modal, notify }  from '../oja/src/js/ui/modal.js';   — ui layer
 *   import { auth }           from '../oja/src/js/ext/auth.js';   — ext layer
 *   import { encrypt }        from '../oja/src/js/utils/encrypt.js'; — utils
 *
 * ─── Layer summary ────────────────────────────────────────────────────────────
 *
 *   js/core/    store, reactive, events, engine, template, out,
 *               component, _exec, router, layout, animate, ui, plugin
 *
 *   js/ui/      modal, notify, form, validate,
 *               canvas, clipboard, dragdrop, table, tabs
 *
 *   js/ext/     auth, channel, config, history, sw, vfs, runner, chart,
 *               socket, worker, wasm, webrtc, infinitescroll, pulltorefresh,
 *               lazy, cssvars, export
 *
 *   js/utils/   encrypt, logger, debug, adapter, formatter, register
 */

// ─── Core + UI + Utils (from oja.js) ─────────────────────────────────────────
export * from './oja.js';

// ─── UI layer — js/ui/ ────────────────────────────────────────────────────────
export { table }                                          from './js/ui/table.js';
export { tabs }                                           from './js/ui/tabs.js';
export { canvas }                                         from './js/ui/canvas.js';
export { clipboard }                                      from './js/ui/clipboard.js';
export { dragdrop }                                       from './js/ui/dragdrop.js';

// ─── Extension layer — js/ext/ ────────────────────────────────────────────────

// Charts & visualisation
export { chart }                                          from './js/ext/chart.js';

// Real-time
export { OjaSSE, OjaSocket }                              from './js/ext/socket.js';

// Concurrency
export { OjaWorker }                                      from './js/ext/worker.js';
export { OjaWasm }                                        from './js/ext/wasm.js';

// Peer-to-peer
export { webrtc }                                         from './js/ext/webrtc.js';

// Scroll patterns
export { infiniteScroll }                                 from './js/ext/infinitescroll.js';
export { pullToRefresh }                                  from './js/ext/pulltorefresh.js';

// Runtime utilities
export { cssVars }                                        from './js/ext/cssvars.js';
export { lazy }                                           from './js/ext/lazy.js';
export { exporter }                                       from './js/ext/export.js';