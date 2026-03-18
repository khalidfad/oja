/**
 * oja/form.js
 * Form lifecycle — submit, error, reset, and image upload/preview.
 * No schema. No magic. HTML stays pure.
 *
 * ─── Basic form ───────────────────────────────────────────────────────────────
 *
 *   import { form } from '../oja/form.js';
 *
 *   form.on('#loginForm', {
 *       submit:  async (data) => api.post('/login', data),
 *       success: (res)  => router.navigate('/dashboard'),
 *       error:   (err)  => form.showError('#loginForm', 'password', err.message)
 *   });
 *
 * ─── HTML (pure — no special attributes needed) ───────────────────────────────
 *
 *   <form id="loginForm">
 *       <input name="username" required>
 *       <input name="password" type="password" required>
 *       <span class="field-error" data-field="password"></span>
 *       <button type="submit">Sign In</button>
 *   </form>
 *
 * ─── Image upload + preview ───────────────────────────────────────────────────
 *
 *   // Wire in one line — preview updates instantly on file select
 *   form.image('#avatarInput', '#avatarPreview');
 *
 *   // With options
 *   form.image('#avatarInput', '#avatarPreview', {
 *       maxSizeMb  : 2,
 *       accept     : ['image/jpeg', 'image/png'],
 *       onError    : (err) => notify.error(err),
 *       onSelect   : (file, dataUrl) => console.log('selected', file.name),
 *       crop       : false,   // future: canvas crop support
 *   });
 *
 *   // Multiple images
 *   form.images('#galleryInput', '#galleryPreview', {
 *       max       : 5,
 *       onSelect  : (files) => console.log(files.length, 'files selected'),
 *   });
 *
 * ─── File upload with progress ────────────────────────────────────────────────
 *
 *   form.upload('#uploadForm', {
 *       url      : '/api/upload',
 *       field    : 'file',              // input[name] to use as file field
 *       progress : (pct) => updateBar(pct),
 *       success  : (res) => notify.success('Uploaded'),
 *       error    : (err) => notify.error(err.message),
 *   });
 */

// ─── Core form handling ───────────────────────────────────────────────────────

export const form = {

    /**
     * Wire a form's full submit lifecycle.
     * Automatically: collects values, disables submit, calls handler, re-enables.
     *
     *   form.on('#loginForm', {
     *       submit  : async (data) => api.post('/login', data),
     *       success : (res) => router.navigate('/dashboard'),
     *       error   : (err) => form.showError('#loginForm', 'password', err.message)
     *   });
     */
    on(target, handlers = {}) {
        const el = _resolve(target);
        if (!el) return;

        el.addEventListener('submit', async (e) => {
            e.preventDefault();
            form.clearErrors(el);

            const data = form.collect(el);
            form.disable(el);

            try {
                const res = await handlers.submit(data);
                if (handlers.success) handlers.success(res);
            } catch (err) {
                if (handlers.error) handlers.error(err);
                else console.error('[oja/form] unhandled error:', err);
            } finally {
                form.enable(el);
            }
        });

        return this;
    },

    /**
     * Collect all named field values as a plain object.
     * Checkboxes → boolean. Multi-selects → array. Numbers → number.
     */
    collect(target) {
        const el   = _resolve(target);
        const data = {};
        if (!el) return data;

        new FormData(el).forEach((value, key) => {
            if (key in data) {
                if (!Array.isArray(data[key])) data[key] = [data[key]];
                data[key].push(value);
            } else {
                data[key] = value;
            }
        });

        // Unchecked checkboxes default to false
        el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            if (!(cb.name in data)) data[cb.name] = false;
        });

        // Number inputs → parse as number
        el.querySelectorAll('input[type="number"]').forEach(inp => {
            if (inp.name in data) data[inp.name] = Number(data[inp.name]);
        });

        return data;
    },

    /**
     * Show an error message next to a named field.
     * Looks for <span data-field="name"> or <div data-field="name"> inside the form.
     */
    showError(target, fieldName, message) {
        const el = _resolve(target);
        if (!el) return;

        const slot = el.querySelector(`[data-field="${fieldName}"]`);
        if (slot) {
            slot.textContent = message;
            slot.style.display = 'block';
            slot.classList.add('oja-field-error');
        }

        const input = el.querySelector(`[name="${fieldName}"]`);
        if (input) input.classList.add('oja-input-error');

        return this;
    },

    /** Clear all error messages inside a form */
    clearErrors(target) {
        const el = _resolve(target);
        if (!el) return;

        el.querySelectorAll('[data-field]').forEach(slot => {
            slot.textContent   = '';
            slot.style.display = 'none';
            slot.classList.remove('oja-field-error');
        });
        el.querySelectorAll('.oja-input-error').forEach(inp => {
            inp.classList.remove('oja-input-error');
        });

        return this;
    },

    /** Disable all inputs and submit button — call during async submit */
    disable(target) {
        _resolve(target)
            ?.querySelectorAll('input, select, textarea, button')
            .forEach(f => f.disabled = true);
        return this;
    },

    /** Re-enable all inputs — call after submit completes */
    enable(target) {
        _resolve(target)
            ?.querySelectorAll('input, select, textarea, button')
            .forEach(f => f.disabled = false);
        return this;
    },

    /** Reset all fields to default values and clear errors */
    reset(target) {
        const el = _resolve(target);
        if (!el) return;
        el.reset();
        form.clearErrors(el);
        return this;
    },

    // ─── Image upload + preview ────────────────────────────────────────────────

    /**
     * Wire a file input to an image preview element.
     * Preview updates instantly on file select. No server call needed.
     *
     *   form.image('#avatarInput', '#avatarPreview');
     *
     *   form.image('#avatarInput', '#avatarPreview', {
     *       maxSizeMb : 2,
     *       accept    : ['image/jpeg', 'image/png', 'image/webp'],
     *       onError   : (msg) => notify.error(msg),
     *       onSelect  : (file, dataUrl) => { ... },
     *   });
     *
     * HTML:
     *   <input type="file" id="avatarInput" accept="image/*">
     *   <img id="avatarPreview" src="" alt="Preview">
     */
    image(inputSelector, previewSelector, options = {}) {
        const input   = _resolve(inputSelector);
        const preview = _resolve(previewSelector);
        if (!input || !preview) return;

        const {
            maxSizeMb = 5,
            accept    = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
            onError   = null,
            onSelect  = null,
        } = options;

        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return;

            // Validate type
            if (accept.length && !accept.includes(file.type)) {
                const msg = `Invalid file type. Accepted: ${accept.join(', ')}`;
                if (onError) onError(msg);
                else console.warn('[oja/form] ' + msg);
                input.value = '';
                return;
            }

            // Validate size
            if (file.size > maxSizeMb * 1024 * 1024) {
                const msg = `File too large. Maximum: ${maxSizeMb}MB`;
                if (onError) onError(msg);
                else console.warn('[oja/form] ' + msg);
                input.value = '';
                return;
            }

            // Read and show preview
            const dataUrl = await _readFile(file);
            preview.src = dataUrl;
            preview.style.display = '';

            if (onSelect) onSelect(file, dataUrl);
        });

        return this;
    },

    /**
     * Wire a multi-file input to a preview container.
     * Appends <img> elements into the container for each selected file.
     *
     *   form.images('#galleryInput', '#galleryPreview', {
     *       max     : 5,
     *       onSelect: (files) => console.log(files.length, 'selected'),
     *   });
     *
     * HTML:
     *   <input type="file" id="galleryInput" accept="image/*" multiple>
     *   <div id="galleryPreview"></div>
     */
    images(inputSelector, containerSelector, options = {}) {
        const input     = _resolve(inputSelector);
        const container = _resolve(containerSelector);
        if (!input || !container) return;

        const {
            max       = 10,
            maxSizeMb = 5,
            accept    = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
            onError   = null,
            onSelect  = null,
        } = options;

        input.addEventListener('change', async () => {
            const files = Array.from(input.files || []);
            if (!files.length) return;

            if (files.length > max) {
                const msg = `Too many files. Maximum: ${max}`;
                if (onError) onError(msg);
                return;
            }

            container.innerHTML = '';
            const valid = [];

            for (const file of files) {
                if (accept.length && !accept.includes(file.type)) continue;
                if (file.size > maxSizeMb * 1024 * 1024) continue;

                const dataUrl = await _readFile(file);
                const img     = document.createElement('img');
                img.src              = dataUrl;
                img.style.maxWidth   = '120px';
                img.style.maxHeight  = '120px';
                img.style.objectFit  = 'cover';
                img.dataset.filename = file.name;
                container.appendChild(img);
                valid.push(file);
            }

            if (onSelect) onSelect(valid);
        });

        return this;
    },

    // ─── XHR upload with progress ─────────────────────────────────────────────

    /**
     * Upload form files with progress tracking.
     * Uses XMLHttpRequest — the only way to get upload progress in browsers.
     *
     *   form.upload('#uploadForm', {
     *       url      : '/api/upload',
     *       field    : 'file',
     *       headers  : { 'Authorization': 'Bearer ' + token },
     *       progress : (percent) => updateProgressBar(percent),
     *       success  : (res)     => notify.success('Uploaded'),
     *       error    : (err)     => notify.error(err.message),
     *   });
     */
    upload(target, options = {}) {
        const el = _resolve(target);
        if (!el) return;

        el.addEventListener('submit', (e) => {
            e.preventDefault();
            form.disable(el);

            const fd      = new FormData(el);
            const xhr     = new XMLHttpRequest();

            xhr.open('POST', options.url || el.action || '/upload');

            // Auth headers
            if (options.headers) {
                for (const [k, v] of Object.entries(options.headers)) {
                    xhr.setRequestHeader(k, v);
                }
            }

            // Progress
            if (options.progress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        options.progress(Math.round((e.loaded / e.total) * 100));
                    }
                });
            }

            xhr.addEventListener('load', () => {
                form.enable(el);
                if (xhr.status >= 200 && xhr.status < 300) {
                    let res = xhr.responseText;
                    try { res = JSON.parse(res); } catch {}
                    if (options.success) options.success(res);
                } else {
                    if (options.error) options.error(new Error(`HTTP ${xhr.status}`));
                }
            });

            xhr.addEventListener('error', () => {
                form.enable(el);
                if (options.error) options.error(new Error('Network error'));
            });

            xhr.addEventListener('abort', () => {
                form.enable(el);
            });

            xhr.send(fd);

            // Return xhr so caller can call xhr.abort() if needed
            return xhr;
        });

        return this;
    }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _resolve(target) {
    if (!target) return null;
    if (typeof target === 'string') {
        const el = document.querySelector(target);
        if (!el) console.warn(`[oja/form] element not found: ${target}`);
        return el;
    }
    return target;
}

function _readFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = (e) => resolve(e.target.result);
        reader.onerror = ()  => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}