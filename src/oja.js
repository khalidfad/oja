/**
 * oja.js — barrel entry point
 *
 * Single import for apps that want everything:
 *   import { Router, Responder, auth, notify, debounce, keys, context, OjaWorker } from '../oja/src/oja.js';
 *
 * Individual imports for zero-build:
 *   import { Router }          from '../oja/src/js/router.js';
 *   import { context }         from '../oja/src/js/reactive.js';
 *   import { keys, debounce }  from '../oja/src/js/events.js';
 *   import { OjaWorker }       from '../oja/src/js/worker.js';
 *   import { OjaWasm }         from '../oja/src/js/wasm.js';
 *   import { Channel, go }     from '../oja/src/js/channel.js';
 */

// ─── Core ─────────────────────────────────────────────────────────────────────
export { Store }                                          from './js/store.js';
export { state, effect, derived, batch, context }         from './js/reactive.js';
export { render, renderRaw, fill, each, template }        from './js/template.js';

// ─── Network ──────────────────────────────────────────────────────────────────
export { Api }                                            from './js/api.js';
export { OjaSSE, OjaSocket }                              from './js/socket.js';

// ─── Codecs ───────────────────────────────────────────────────────────────────
export { JsonCodec, jsonCodec }                           from './js/codecs/json.js';
export { MsgPackCodec }                                   from './js/codecs/msgpack.js';

// ─── UI ───────────────────────────────────────────────────────────────────────
export { Router }                                         from './js/router.js';
export { Responder, ResponderBase }                       from './js/responder.js';
export { component }                                      from './js/component.js';
export { modal }                                          from './js/modal.js';
export { notify }                                         from './js/notify.js';
export { ui }                                             from './js/ui.js';

// ─── Forms + Events ───────────────────────────────────────────────────────────
export { form }                                           from './js/form.js';
export { on, once, off, emit, listen, listenOnce,
    debounce, throttle, keys }                       from './js/events.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export { auth }                                           from './js/auth.js';

// ─── Concurrency ──────────────────────────────────────────────────────────────
export { OjaWorker }                                      from './js/worker.js';
export { OjaWasm }                                        from './js/wasm.js';
export { Channel, go, pipeline, fanOut, fanIn,
    merge, split }                                   from './js/channel.js';

// ─── Dev tools ────────────────────────────────────────────────────────────────
export { logger }                                         from './js/logger.js';
export { debug }                                          from './js/debug.js';
export { adapter }                                        from './js/adapter.js';