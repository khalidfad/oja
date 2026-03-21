/**
 * oja/formatter.js
 * Shared pure transformation functions — single source of truth for both
 * template.js filter pipes and engine.js reactive bindings.
 *
 * All functions are stateless, synchronous, and free of side-effects.
 * No dependencies — safe to import from any module in the framework.
 *
 * ─── Template pipe usage ──────────────────────────────────────────────────────
 *
 *   template.js registers these under short pipe names:
 *   {{.name | upper}}   {{.bytes | bytes}}   {{.ts | ago}}
 *
 * ─── Engine binding usage ─────────────────────────────────────────────────────
 *
 *   engine.js exposes these via engine.formatters:
 *   engine.bindText('#el', 'cpu', engine.formatters.formatPercent)
 *   <span data-oja-bind="cpu" data-oja-transform="formatPercent"></span>
 *
 * ─── Extending ────────────────────────────────────────────────────────────────
 *
 *   For custom formatters needed in templates only:
 *     template.filter('slug', s => s.toLowerCase().replace(/ /g, '-'))
 *
 *   For custom formatters needed in engine bindings only:
 *     engine.formatters.myFmt = v => ...
 *
 *   For custom formatters needed in both, add them here and register in each.
 */

// Convert to uppercase string. Null/undefined returns empty string.
export function uppercase(v) {
    return String(v ?? '').toUpperCase();
}

// Convert to lowercase string. Null/undefined returns empty string.
export function lowercase(v) {
    return String(v ?? '').toLowerCase();
}

// Capitalise the first letter only. Null/undefined returns empty string.
export function capitalize(v) {
    const s = String(v ?? '');
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Title-case every word. Null/undefined returns empty string.
export function titleCase(v) {
    return String(v ?? '').replace(/\b\w/g, l => l.toUpperCase());
}

// Serialize value to indented JSON string.
export function toJson(v) {
    return JSON.stringify(v, null, 2);
}

// Serialize value to compact single-line JSON string.
export function toCompactJson(v) {
    return JSON.stringify(v);
}

// Format a byte count as a human-readable string (B, KB, MB, GB, TB).
// Non-numeric or zero input returns '0 B'.
export function formatBytes(v) {
    const b = parseInt(v, 10);
    if (isNaN(b) || b === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(b) / Math.log(k));
    return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Format a number as a percentage string with one decimal place.
// Non-numeric input is returned as-is.
export function formatPercent(v) {
    const n = parseFloat(v);
    return isNaN(n) ? String(v ?? '') : n.toFixed(1) + '%';
}

// Format a Unix timestamp (ms or Date) as a relative time string.
// Returns '' for falsy input.
export function timeAgo(ts) {
    if (!ts) return '';
    const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (secs < 60)    return `${secs}s ago`;
    if (secs < 3600)  return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
}

// Format a timestamp as a locale date string. Returns '' for falsy input.
export function formatDate(ts) {
    return ts ? new Date(ts).toLocaleDateString() : '';
}

// Format a timestamp as a locale time string. Returns '' for falsy input.
export function formatTime(ts) {
    return ts ? new Date(ts).toLocaleTimeString() : '';
}

// Truncate a string to n characters, appending '…' if truncated.
// n defaults to 50 when omitted.
export function truncate(s, n = 50) {
    const str = String(s ?? '');
    return str.length > n ? str.slice(0, n) + '…' : str;
}

// Return dflt when v is null, undefined, or empty string. Otherwise return v.
export function fallback(v, dflt = '') {
    return (v !== undefined && v !== null && v !== '') ? v : dflt;
}

// Return 'active' when v is truthy, 'inactive' otherwise.
export function booleanStatus(v) {
    return v ? 'active' : 'inactive';
}

// Return 'is-true' when v is truthy, 'is-false' otherwise.
export function booleanClass(v) {
    return v ? 'is-true' : 'is-false';
}