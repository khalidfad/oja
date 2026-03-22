/**
 * tests/core/queryAll.test.js
 * Covers queryAll() — the scoped querySelectorAll companion to query()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { query, queryAll } from '../../src/js/core/ui.js';

beforeEach(() => {
    document.body.innerHTML = `
        <div id="root">
            <span class="chip active" data-level="ALL">ALL</span>
            <span class="chip" data-level="INFO">INFO</span>
            <span class="chip" data-level="WARN">WARN</span>
        </div>
        <div id="other">
            <span class="chip" data-level="ERROR">ERROR</span>
        </div>
    `;
});

describe('queryAll()', () => {
    it('returns a plain Array, not a NodeList', () => {
        const result = queryAll('.chip');
        expect(Array.isArray(result)).toBe(true);
    });

    it('returns all matching elements from document by default', () => {
        expect(queryAll('.chip')).toHaveLength(4);
    });

    it('scopes to the provided element', () => {
        const root = query('#root');
        expect(queryAll('.chip', root)).toHaveLength(3);
    });

    it('returns empty array when nothing matches', () => {
        expect(queryAll('.nonexistent')).toHaveLength(0);
    });

    it('returns empty array when scope has no matches', () => {
        const other = query('#other');
        expect(queryAll('.active', other)).toHaveLength(0);
    });

    it('supports chaining Array methods directly', () => {
        const active = queryAll('.chip').filter(el => el.classList.contains('active'));
        expect(active).toHaveLength(1);
        expect(active[0].dataset.level).toBe('ALL');
    });

    it('map works directly on result', () => {
        const levels = queryAll('.chip', query('#root')).map(el => el.dataset.level);
        expect(levels).toEqual(['ALL', 'INFO', 'WARN']);
    });

    it('handles null/undefined scope gracefully — falls back to document', () => {
        expect(() => queryAll('.chip', null)).not.toThrow();
        expect(queryAll('.chip', null)).toHaveLength(4);
    });
});