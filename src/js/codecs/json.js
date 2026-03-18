/**
 * oja/codecs/json.js
 * Default codec — JSON over text.
 * Used by api.js and socket.js when no codec is specified.
 *
 * A codec is a plain object with:
 *   encode(data)  → string | ArrayBuffer   — called before send
 *   decode(raw)   → any                    — called after receive
 *   contentType   → string                 — HTTP Content-Type header
 *   binaryType    → 'text' | 'binary'      — WebSocket frame type
 *
 * Usage:
 *   import { JsonCodec } from '../oja/codecs/json.js';
 *   const api = new Api({ base: origin, codec: new JsonCodec() });
 */

export class JsonCodec {
    get contentType() { return 'application/json'; }
    get binaryType()  { return 'text'; }
    get name()        { return 'json'; }

    /**
     * Encode data for sending.
     * Strings are passed through — already serialised.
     * Everything else is JSON.stringify'd.
     */
    encode(data) {
        if (typeof data === 'string') return data;
        return JSON.stringify(data);
    }

    /**
     * Decode a received payload.
     * Handles: string, ArrayBuffer, Blob, ReadableStream body text.
     */
    decode(raw) {
        if (raw === null || raw === undefined) return null;

        // Already parsed (e.g. from fetch response.json())
        if (typeof raw === 'object' && !(raw instanceof ArrayBuffer)) return raw;

        // String
        if (typeof raw === 'string') {
            if (!raw.trim()) return null;
            try { return JSON.parse(raw); } catch { return raw; }
        }

        // ArrayBuffer (WebSocket binary frame)
        if (raw instanceof ArrayBuffer) {
            const text = new TextDecoder().decode(raw);
            try { return JSON.parse(text); } catch { return text; }
        }

        return raw;
    }
}

// Singleton — used as default throughout Oja
export const jsonCodec = new JsonCodec();