/**
 * oja.js — barrel entry point
 *
 * Single import for apps that want everything:
 *   import { Router, Responder, auth, notify } from '../oja/src/oja.js';
 *
 * Individual imports for tree-shaking / zero-build:
 *   import { Router }       from '../oja/src/js/router.js';
 *   import { MsgPackCodec } from '../oja/src/js/codecs/msgpack.js';
 *
 * Built outputs (build/):
 *   oja.min.js  → IIFE — window.Oja.Router  — for <script src>
 *   oja.esm.js  → ESM  — import { Router }  — for modern apps
 */

// ─── Core ─────────────────────────────────────────────────────────────────────
export { Store }                                    from './js/store.js';
export { state, effect, derived, batch }            from './js/reactive.js';
export { render, renderRaw, fill, each, template }  from './js/template.js';

// ─── Network ──────────────────────────────────────────────────────────────────
export { Api }                                      from './js/api.js';
export { OjaSSE, OjaSocket }                        from './js/socket.js';

// ─── Codecs ───────────────────────────────────────────────────────────────────
export { JsonCodec, jsonCodec }                     from './js/codecs/json.js';
export { MsgPackCodec }                             from './js/codecs/msgpack.js';

// ─── UI ───────────────────────────────────────────────────────────────────────
export { Router }                                   from './js/router.js';
export { Responder, ResponderBase }                 from './js/responder.js';
export { component }                                from './js/component.js';
export { modal }                                    from './js/modal.js';
export { notify }                                   from './js/notify.js';

// ─── Forms + Events ───────────────────────────────────────────────────────────
export { form }                                     from './js/form.js';
export { on, once, off, emit, listen, listenOnce }  from './js/events.js';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export { auth }                                     from './js/auth.js';

// ─── Dev tools ────────────────────────────────────────────────────────────────
export { logger }                                   from './js/logger.js';
export { debug }                                    from './js/debug.js';
export { adapter }                                  from './js/adapter.js';