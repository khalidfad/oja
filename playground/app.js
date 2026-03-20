// Oja Playground — built with Oja
import {
    state, effect, context,
    on, find, findAll,
    Channel, go, VFS
} from 'https://cdn.jsdelivr.net/npm/@agberohq/oja@v0.0.8/build/oja.core.esm.js';

const OJA_CDN = 'https://cdn.jsdelivr.net/npm/@agberohq/oja@v0.0.8/build/oja.core.esm.js';

const EXAMPLES = [
    { name: 'Counter',          desc: 'state + effect basics',                 dir: 'starter'   },
    { name: 'Todo List',        desc: 'reactive array with add / remove',      dir: 'todo'      },
    { name: 'Router + Context', desc: 'multi-page SPA with shared state',      dir: 'router'    },
    { name: 'Guestbook',        desc: 'form.on + context + each()',            dir: 'guestbook' },
    { name: 'Rhyme Rush AI',    desc: 'Audio pipeline + Channel + go()',       dir: 'game'      },
    { name: 'Channel Pipeline', desc: 'Go-style async data flow',              dir: 'channel'   },
];

const OJA_KEYWORDS = [
    'state', 'effect', 'context', 'derived', 'batch',
    'Router', 'Out', 'layout', 'modal', 'notify',
    'on', 'once', 'emit', 'listen', 'find', 'findAll',
    'Channel', 'go', 'pipeline', 'VFS', 'Api', 'animate',
    'component', 'ui'
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function exampleBase(dir) {
    const base = new URL(`./examples/${dir}/`, import.meta.url).href;
    return base.endsWith('/') ? base : base + '/';
}

function iconFor(path) {
    if (path.endsWith('.html')) return '📄';
    if (path.endsWith('.js'))   return '⚡';
    if (path.endsWith('.css'))  return '🎨';
    return '📁';
}

function escHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'": '&#39;' }[m]));
}

// ─── App state ────────────────────────────────────────────────────────────────

const [files, setFiles]             = state({});
const [activeFile, setActiveFile]   = state('index.html');
const [openTabs, setOpenTabs]       = state([]);
const [consoleLogs, setConsoleLogs] = state([]);
const [consoleFilter, setFilter]    = state('all');
const [consolePaused, setPaused]    = state(false);
const [theme, setTheme]             = context('playground-theme', 'dark');

let editor      = null;
let updateTimer = null;
let blobUrls    = [];
let _vfs        = null;

// ─── VFS persistence ─────────────────────────────────────────────────────────

async function initVFS() {
    // VFS is now imported at the top level
    _vfs = new VFS('oja-playground');
    await _vfs.ready();

    const existing = await _vfs.ls('/');
    if (existing.length === 0) {
        await loadExample(EXAMPLES[0]);
    } else {
        const all = await _vfs.getAll();
        setFiles(all);
        const paths = Object.keys(all).sort();
        if (paths.length > 0) {
            setActiveFile(paths[0]);
            setOpenTabs(paths.slice(0, 4));
        }
        addLog('info', `Loaded ${existing.length} files from storage`);
    }

    _vfs.onChange('/', async () => {
        const all = await _vfs.getAll();
        setFiles(all);
    });
}

function persistFile(path, content) {
    if (_vfs) _vfs.write(path, content);
}

// ─── CodeMirror Editor ────────────────────────────────────────────────────────

function setupAutocomplete() {
    CodeMirror.registerHelper("hint", "javascript", (cm) => {
        const cursor = cm.getCursor();
        const line = cm.getLine(cursor.line);
        const start = cursor.ch;
        let wordStart = start;
        while (wordStart > 0 && /[\w$]/.test(line.charAt(wordStart - 1))) wordStart--;
        const curWord = line.slice(wordStart, start);

        if (!curWord) return null;
        const list = OJA_KEYWORDS.filter(w => w.startsWith(curWord));
        if (!list.length) return null;

        return {
            list: list,
            from: CodeMirror.Pos(cursor.line, wordStart),
            to: CodeMirror.Pos(cursor.line, start)
        };
    });
}

function initEditor() {
    setupAutocomplete();
    const textarea = find('#editorTextarea');

    editor = CodeMirror.fromTextArea(textarea, {
        lineNumbers      : true,
        theme            : 'dracula',
        mode             : 'htmlmixed',
        indentUnit       : 2,
        tabSize          : 2,
        lineWrapping     : true,
        styleActiveLine  : true,
        foldGutter       : true,
        gutters          : ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
        matchBrackets    : true,
        autoCloseBrackets: true,
        autoCloseTags    : true,
        extraKeys        : { "Ctrl-Space": "autocomplete" }
    });

    editor.on('inputRead', (cm, change) => {
        if (change.text[0].match(/[a-z]/i)) {
            cm.showHint({ completeSingle: false });
        }
    });

    editor.on('change', () => {
        const path = activeFile();
        if (!path) return;
        const updated = { ...files() };
        updated[path] = editor.getValue();
        setFiles(updated);
        persistFile(path, editor.getValue());
        clearTimeout(updateTimer);
        updateTimer = setTimeout(runPreview, 400);
    });

    editor.on('cursorActivity', () => {
        const c = editor.getCursor();
        find('#cursorPosition').textContent = `Ln ${c.line + 1}, Col ${c.ch + 1}`;
    });

    syncEditorContent();
}

function syncEditorContent() {
    if (!editor) return;
    const path    = activeFile();
    const content = files()[path] || '';
    if (editor.getValue() !== content) {
        editor.setValue(content);
    }
    editor.setOption('mode',
        path.endsWith('.js')  ? 'javascript' :
            path.endsWith('.css') ? 'css'        : 'htmlmixed'
    );
    find('#fileType').textContent = path.split('.').pop().toUpperCase();
}

// ─── Declarative UI Effects ──────────────────────────────────────────────────

effect(() => {
    const fileMap = files();
    const active  = activeFile();
    const list    = find('#fileTree');
    const paths   = Object.keys(fileMap).sort();

    list.innerHTML = paths.map(p => `
        <div class="file-item ${p === active ? 'active' : ''}" data-path="${escHtml(p)}">
            <span class="file-icon">${iconFor(p)}</span>
            <span class="file-name">${escHtml(p)}</span>
            <span class="file-del" data-path="${escHtml(p)}">✕</span>
        </div>
    `).join('');

    find('#fileStats').textContent = `${paths.length} file${paths.length === 1 ? '' : 's'}`;
});

effect(() => {
    const tabs   = openTabs();
    const active = activeFile();
    const bar    = find('#tabBar');

    bar.innerHTML = tabs.map(p => `
        <div class="tab ${p === active ? 'active' : ''}" data-path="${escHtml(p)}">
            <span>${escHtml(p.split('/').pop())}</span>
            <span class="tab-close" data-path="${escHtml(p)}">✕</span>
        </div>
    `).join('');
});

effect(() => {
    const logs     = consoleLogs();
    const filter   = consoleFilter();
    const panel    = find('#consoleLogs');
    const filtered = filter === 'all' ? logs : logs.filter(l => l.level === filter);

    if (filtered.length === 0) {
        panel.innerHTML = '<div class="console-empty">✓ No logs — run your code to see output</div>';
        return;
    }

    panel.innerHTML = filtered.map(l => `
        <div class="log-line">
            <span class="log-time">${l.time}</span>
            <span class="log-level ${l.level}">${l.level}</span>
            <span class="log-message">${escHtml(l.message)}</span>
        </div>
    `).join('');

    panel.scrollTop = panel.scrollHeight;
});

effect(syncEditorContent);

// ─── File Operations ──────────────────────────────────────────────────────────

function openFile(path) {
    if (!files()[path]) return;
    if (!openTabs().includes(path)) setOpenTabs([...openTabs(), path]);
    setActiveFile(path);
}

function closeTab(path) {
    const remaining = openTabs().filter(p => p !== path);
    setOpenTabs(remaining);
    if (activeFile() === path) {
        setActiveFile(remaining[0] || null);
    }
}

function deleteFile(path) {
    if (path === 'index.html') {
        addLog('error', 'Cannot delete index.html — it is the entry point');
        return;
    }
    if (!confirm(`Delete ${path}?`)) return;
    const updated = { ...files() };
    delete updated[path];
    setFiles(updated);
    if (_vfs) _vfs.rm(path);
    closeTab(path);
    runPreview();
}

function createFile(path, content = '') {
    path = path.trim();
    if (!path) return;
    if (files()[path] !== undefined) {
        addLog('error', `File "${path}" already exists`);
        return;
    }
    const body    = content || (path.endsWith('.html') ? '<div></div>' : '');
    const updated = { ...files(), [path]: body };
    setFiles(updated);
    persistFile(path, body);
    setOpenTabs([...openTabs(), path]);
    setActiveFile(path);
    runPreview();
}

// ─── Run & Preview ────────────────────────────────────────────────────────────

function runPreview() {
    blobUrls.forEach(u => URL.revokeObjectURL(u));
    blobUrls = [];

    const indexContent = files()['index.html'];
    if (!indexContent) {
        find('#previewFrame').srcdoc = `<body><p>No index.html found</p></body>`;
        return;
    }

    const blobMap = {};
    Object.entries(files()).forEach(([path, content]) => {
        const mime = path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html';
        const blob = new Blob([content], { type: mime });
        const url  = URL.createObjectURL(blob);
        blobMap[path] = url;
        blobUrls.push(url);
    });

    let html = indexContent;

    html = html.replace(/(import\s+(?:[\w*{},\s]+from\s+)?['"])([^'"]+)(['"])/g, (m, pre, spec, post) => {
        if (spec.startsWith('http') || spec.startsWith('blob:')) return m;
        const resolved = spec.replace(/^\.\//, '');
        return blobMap[resolved] ? pre + blobMap[resolved] + post : m;
    });

    html = html.replace(/(src|href)=["']([^"']+)["']/g, (m, attr, val) => {
        if (val.startsWith('http') || val.startsWith('blob:') || val.startsWith('#') || val.startsWith('data:')) return m;
        return blobMap[val] ? `${attr}="${blobMap[val]}"` : m;
    });

    const bridge = `<script>
        (function() {
            ['log','warn','error','info'].forEach(m => {
                const orig = console[m];
                console[m] = function(...args) {
                    orig.apply(console, args);
                    window.parent.postMessage({ type: 'console', level: m,
                        args: args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); } catch { return String(a); } })
                    }, '*');
                };
            });
        })();
    <\/script>`;

    html = html.replace('</head>', bridge + '</head>');
    find('#previewFrame').srcdoc = html;
    find('#previewStatus').innerHTML = '● running';
}

function addLog(level, message) {
    if (consolePaused()) return;
    setConsoleLogs([...consoleLogs(), {
        id     : Date.now() + Math.random(),
        time   : new Date().toLocaleTimeString([], { hour12: false }),
        level,
        message: String(message),
    }].slice(-500));
}

// ─── Example Loading ──────────────────────────────────────────────────────────

async function loadExample(ex) {
    if (!_vfs) return;
    addLog('info', `Loading example: ${ex.name}...`);

    await _vfs.clear();
    const base = exampleBase(ex.dir);

    try {
        const result = await _vfs.mount(base, { force: true });
        const all = await _vfs.getAll();
        const paths = Object.keys(all).sort();

        setFiles(all);
        setOpenTabs(paths.slice(0, 4));
        setActiveFile(paths.includes('index.html') ? 'index.html' : paths[0]);

        runPreview();
        addLog('info', `Successfully loaded ${ex.name}`);
    } catch (e) {
        addLog('error', `Failed to load example: ${e.message}`);
    }
}

// ─── UI Interaction (Oja `on` wiring) ─────────────────────────────────────────

function setupInteraction() {
    on('#runBtn', 'click', runPreview);
    on('#themeToggleBtn', 'click', () => {
        const next = theme() === 'dark' ? 'light' : 'dark';
        setTheme(next);
        document.documentElement.setAttribute('data-theme', next);
        editor.setOption('theme', next === 'dark' ? 'dracula' : 'default');
        localStorage.setItem('oja-playground-theme', next);
    });

    on('#fileTree', 'click', (e) => {
        const item = e.target.closest('.file-item');
        if (!item) return;
        if (e.target.classList.contains('file-del')) {
            deleteFile(item.dataset.path);
        } else {
            openFile(item.dataset.path);
        }
    });

    on('#addFileSidebar', 'click', () => find('#newFileDialog').classList.add('open'));
    on('#newFileBtn', 'click', () => find('#newFileDialog').classList.add('open'));

    on('#tabBar', 'click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        if (e.target.classList.contains('tab-close')) {
            closeTab(tab.dataset.path);
        } else {
            openFile(tab.dataset.path);
        }
    });

    on('#cancelDialog', 'click', () => find('#newFileDialog').classList.remove('open'));
    on('#confirmDialog', 'click', () => {
        const input = find('#newFileName');
        if (input.value.trim()) {
            createFile(input.value.trim());
            find('#newFileDialog').classList.remove('open');
            input.value = '';
        }
    });

    on('#examplesBtn', 'click', () => {
        const list = find('#exampleList');
        list.innerHTML = EXAMPLES.map(ex => `
            <div class="example-card" data-dir="${ex.dir}">
                <div class="example-name">${escHtml(ex.name)}</div>
                <div class="example-desc">${escHtml(ex.desc)}</div>
            </div>
        `).join('');
        find('#examplesDialog').classList.add('open');
    });

    on('#exampleList', 'click', (e) => {
        const card = e.target.closest('.example-card');
        if (!card) return;
        const ex = EXAMPLES.find(x => x.dir === card.dataset.dir);
        if (ex) loadExample(ex);
        find('#examplesDialog').classList.remove('open');
    });

    on('#closeExamples', 'click', () => find('#examplesDialog').classList.remove('open'));

    on('#clearConsoleBtn', 'click', () => setConsoleLogs([]));
    on('#pauseConsoleBtn', 'click', () => {
        setPaused(!consolePaused());
        find('#pauseConsoleBtn').textContent = consolePaused() ? '▶' : '⏸';
    });

    on('.console-filter', 'click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        findAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        setFilter(chip.dataset.level);
    });

    on('#collapseSidebar', 'click', () => {
        find('#sidebar').classList.toggle('collapsed');
        setTimeout(() => editor.refresh(), 310);
    });

    on('#collapseConsole', 'click', () => find('#consoleArea').classList.toggle('collapsed'));
    on('#collapsePreview', 'click', () => find('#previewArea').classList.toggle('collapsed'));
    on('#toggleMobile', 'click', () => find('#previewFrame').classList.toggle('mobile-view'));
    on('#toggleFull', 'click', () => {
        const frame = find('#previewFrame');
        if (frame.requestFullscreen) frame.requestFullscreen();
    });

    on(window, 'message', (e) => {
        if (e.data?.type === 'console') addLog(e.data.level, e.data.args.join(' '));
    });

    on(document, 'keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runPreview(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 'n')     { e.preventDefault(); find('#newFileDialog').classList.add('open'); }
    });
}

function initPanelResize() {
    const makeDraggable = (handle, target, axis) => {
        on(handle, 'mousedown', (e) => {
            e.preventDefault();
            const startPos = axis === 'x' ? e.clientX : e.clientY;
            const startSize = axis === 'x' ? target.offsetWidth : target.offsetHeight;
            const onMove = (moveEvt) => {
                const currentPos = axis === 'x' ? moveEvt.clientX : moveEvt.clientY;
                const delta = currentPos - startPos;
                const newSize = axis === 'x' ? startSize + delta : startSize - delta;
                if (axis === 'x') target.style.width = Math.max(40, newSize) + 'px';
                else find('#bottomSplit').style.height = Math.max(30, newSize) + 'px';
                if (editor) editor.refresh();
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    };
    makeDraggable(find('.resize-handle-x'), find('#sidebar'), 'x');
    makeDraggable(find('.resize-handle-y'), find('#bottomSplit'), 'y');
}

function init() {
    const savedTheme = localStorage.getItem('oja-playground-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    setTheme(savedTheme);

    initEditor();
    setupInteraction();
    initPanelResize();

    initVFS().catch(e => addLog('warn', 'VFS unavailable: ' + e.message));
}

init();