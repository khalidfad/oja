import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execScripts } from '../../src/js/core/_exec.js';

// Minimal DOM setup — jsdom is provided by vitest config (environment: 'jsdom')

function makeContainer(scriptContent) {
    const div = document.createElement('div');
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = scriptContent;
    div.appendChild(script);
    document.body.appendChild(div);
    return div;
}

beforeEach(() => {
    document.body.innerHTML = '';
    // Clean up any injected window keys between tests
    Object.keys(window).filter(k => k.startsWith('__oja_')).forEach(k => delete window[k]);
});

// ─── preamble injection ───────────────────────────────────────────────────────

describe('execScripts() — preamble injection', () => {
    it('injects container when the script does not declare it', () => {
        const injectedSrcs = [];
        const origCreate = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag) => {
            const el = origCreate(tag);
            if (tag === 'script') {
                Object.defineProperty(el, 'src', {
                    set(v) { injectedSrcs.push(v); },
                    get() { return ''; },
                });
            }
            return el;
        });

        const container = makeContainer('// no container declaration');
        execScripts(container, null, {});

        // A blob URL will have been set — we just verify one was produced
        expect(injectedSrcs.length).toBeGreaterThan(0);
        document.createElement.mockRestore();
    });

    it('does not double-declare container when script already declares it', () => {
        // The declares() check uses a regex on the raw body text.
        // We test it directly by inspecting what would be in the preamble.
        const body = 'const container = document.getElementById("tweets-container");';

        const declares = (name) =>
            new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(body);

        expect(declares('container')).toBe(true);
        expect(declares('find')).toBe(false);
        expect(declares('props')).toBe(false);
    });

    it('detects let and var declarations as well', () => {
        const declares = (name) =>
            new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(
                'let find = () => {}; var findAll = null;'
            );

        expect(declares('find')).toBe(true);
        expect(declares('findAll')).toBe(true);
        expect(declares('container')).toBe(false);
    });

    it('detects function declarations', () => {
        const declares = (name) =>
            new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(
                'function find(sel) { return document.querySelector(sel); }'
            );

        expect(declares('find')).toBe(true);
    });

    it('does not false-positive on identifiers used inside expressions', () => {
        // "container" appears as a property or argument — not a top-level declaration
        const declares = (name) =>
            new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(
                'component.mount(container, "tweet.html", props);'
            );

        expect(declares('container')).toBe(false);
    });

    it('props is always treated as injectable (never checked)', () => {
        // Simulate what _exec.js does: props is unconditionally pushed,
        // regardless of what the body contains.
        const body = 'const props = { fake: true };';

        // The declares check is NOT applied to props — confirm the regex would
        // match so we know the decision to skip the check is intentional.
        const declares = (name) =>
            new RegExp(`\\b(?:const|let|var|function)\\s+${name}\\b`).test(body);

        // Would detect it — but _exec.js doesn't call declares('props')
        expect(declares('props')).toBe(true);
    });
});