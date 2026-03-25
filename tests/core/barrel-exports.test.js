/**
 * Tests that all new exports are correctly wired through oja.js and oja.full.js.
 * These are smoke tests — they verify the barrel files export the right names
 * without testing the implementations (covered by other test files).
 */
import { describe, it, expect } from 'vitest';

describe('oja.js barrel — new exports present', async () => {
    const oja = await import('../../src/oja.js');

    it('exports watch',            () => expect(typeof oja.watch).toBe('function'));
    it('exports untrack',          () => expect(typeof oja.untrack).toBe('function'));
    it('exports readonly',         () => expect(typeof oja.readonly).toBe('function'));
    it('exports onlyOnce',         () => expect(typeof oja.onlyOnce).toBe('function'));
    it('exports onClickOutside',   () => expect(typeof oja.onClickOutside).toBe('function'));
    it('exports onHover',          () => expect(typeof oja.onHover).toBe('function'));
    it('exports onLongPress',      () => expect(typeof oja.onLongPress).toBe('function'));
    it('exports allSlotsReady',    () => expect(typeof oja.allSlotsReady).toBe('function'));
    it('exports Reactive.watch',   () => expect(typeof oja.Reactive?.watch).toBe('function'));
    it('exports Reactive.untrack', () => expect(typeof oja.Reactive?.untrack).toBe('function'));
    it('exports Event.onClickOutside', () => expect(typeof oja.Event?.onClickOutside).toBe('function'));
    it('exports Event.onHover',        () => expect(typeof oja.Event?.onHover).toBe('function'));
    it('exports Event.onlyOnce',       () => expect(typeof oja.Event?.onlyOnce).toBe('function'));
});

describe('oja.full.js barrel — collapse/accordion/wizard present', async () => {
    const full = await import('../../src/oja.full.js');

    it('exports collapse', () => expect(typeof full.collapse).toBe('object'));
    it('exports accordion', () => expect(typeof full.accordion).toBe('object'));
    it('exports wizard', () => expect(typeof full.wizard).toBe('object'));
    it('collapse.attach is a function', () => expect(typeof full.collapse?.attach).toBe('function'));
    it('accordion.render is a function', () => expect(typeof full.accordion?.render).toBe('function'));
    it('wizard.render is a function', () => expect(typeof full.wizard?.render).toBe('function'));
});

describe('Store — new methods present', () => {
    it('has getOrSet', async () => {
        const { Store } = await import('../../src/js/core/store.js');
        const s = new Store('barrel-test');
        expect(typeof s.getOrSet).toBe('function');
    });

    it('has ttl', async () => {
        const { Store } = await import('../../src/js/core/store.js');
        const s = new Store('barrel-test-2');
        expect(typeof s.ttl).toBe('function');
    });

    it('has size getter', async () => {
        const { Store } = await import('../../src/js/core/store.js');
        const s = new Store('barrel-test-3');
        expect(typeof s.size).toBe('number');
    });
});

describe('notify — new methods present', () => {
    it('has update', async () => {
        const { notify } = await import('../../src/js/ui/notify.js');
        expect(typeof notify.update).toBe('function');
    });
    it('has promise', async () => {
        const { notify } = await import('../../src/js/ui/notify.js');
        expect(typeof notify.promise).toBe('function');
    });
    it('has progress', async () => {
        const { notify } = await import('../../src/js/ui/notify.js');
        expect(typeof notify.progress).toBe('function');
    });
    it('has config', async () => {
        const { notify } = await import('../../src/js/ui/notify.js');
        expect(typeof notify.config).toBe('function');
    });
});

describe('Out — new methods present', () => {
    it('Out.to().show is a function', async () => {
        const { Out } = await import('../../src/js/core/out.js');
        const div = document.createElement('div');
        document.body.appendChild(div);
        const target = Out.to(div);
        expect(typeof target.show).toBe('function');
        expect(typeof target.hide).toBe('function');
        expect(typeof target.toggle).toBe('function');
        expect(typeof target.addClass).toBe('function');
        expect(typeof target.removeClass).toBe('function');
        expect(typeof target.toggleClass).toBe('function');
        expect(typeof target.attr).toBe('function');
        expect(typeof target.css).toBe('function');
        expect(typeof target.mode).toBe('function');
    });

    it('Out.sparkline is a function', async () => {
        const { Out } = await import('../../src/js/core/out.js');
        expect(typeof Out.sparkline).toBe('function');
    });

    it('Out.timeSeries is a function', async () => {
        const { Out } = await import('../../src/js/core/out.js');
        expect(typeof Out.timeSeries).toBe('function');
    });
});

describe('modal — new methods present', () => {
    it('has prompt', async () => {
        const { modal } = await import('../../src/js/ui/modal.js');
        expect(typeof modal.prompt).toBe('function');
    });
    it('has beforeClose', async () => {
        const { modal } = await import('../../src/js/ui/modal.js');
        expect(typeof modal.beforeClose).toBe('function');
    });
});

describe('sw — new exports present', () => {
    it('sw.waitFor is a function', async () => {
        const { sw } = await import('../../src/js/ext/sw.js');
        expect(typeof sw.waitFor).toBe('function');
    });
    it('sw.onStateChange is a function', async () => {
        const { sw } = await import('../../src/js/ext/sw.js');
        expect(typeof sw.onStateChange).toBe('function');
    });
    it('sw.clearVFS is a function', async () => {
        const { sw } = await import('../../src/js/ext/sw.js');
        expect(typeof sw.clearVFS).toBe('function');
    });
    it('sw.isControlling is defined', async () => {
        const { sw } = await import('../../src/js/ext/sw.js');
        expect(typeof sw.isControlling).toBe('boolean');
    });
});

describe('vfs — new methods present', () => {
    it('VFS instance has persist()', async () => {
        const { VFS } = await import('../../src/js/ext/vfs.js');
        const v = new VFS('barrel-vfs');
        expect(typeof v.persist).toBe('function');
    });
    it('VFS instance has quota()', async () => {
        const { VFS } = await import('../../src/js/ext/vfs.js');
        const v = new VFS('barrel-vfs-2');
        expect(typeof v.quota).toBe('function');
    });
});

describe('router — new methods present', () => {
    it('Router instance has destroy()', async () => {
        const { Router } = await import('../../src/js/core/router.js');
        const r = new Router({ mode: 'hash', outlet: '#app' });
        expect(typeof r.destroy).toBe('function');
    });
    it('Router instance has is()', async () => {
        const { Router } = await import('../../src/js/core/router.js');
        const r = new Router({ mode: 'hash', outlet: '#app' });
        expect(typeof r.is).toBe('function');
    });
    it('Router instance has param()', async () => {
        const { Router } = await import('../../src/js/core/router.js');
        const r = new Router({ mode: 'hash', outlet: '#app' });
        expect(typeof r.param).toBe('function');
    });
    it('Router instance has name() and path()', async () => {
        const { Router } = await import('../../src/js/core/router.js');
        const r = new Router({ mode: 'hash', outlet: '#app' });
        expect(typeof r.name).toBe('function');
        expect(typeof r.path).toBe('function');
    });
});

describe('animate — new methods present', () => {
    it('animate has collapse, expand, countUp, typewriter, shake', async () => {
        const { animate } = await import('../../src/js/core/animate.js');
        expect(typeof animate.collapse).toBe('function');
        expect(typeof animate.expand).toBe('function');
        expect(typeof animate.countUp).toBe('function');
        expect(typeof animate.typewriter).toBe('function');
        expect(typeof animate.shake).toBe('function');
    });
});

describe('Trie — new methods present', () => {
    it('Trie instance has startsWith()', async () => {
        const { Trie } = await import('../../src/js/utils/search.js');
        const t = new Trie();
        expect(typeof t.startsWith).toBe('function');
    });
});

describe('Search — new methods present', () => {
    it('Search instance has suggest()', async () => {
        const { Search } = await import('../../src/js/utils/search.js');
        const s = new Search();
        expect(typeof s.suggest).toBe('function');
    });
});
