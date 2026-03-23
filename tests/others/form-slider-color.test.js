/**
 * Tests for form.slider() and form.colorPicker()
 * Written against the actual implementation in src/js/ui/form.js
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { form } from '../../src/js/ui/form.js';

beforeEach(() => { document.body.innerHTML = ''; });
afterEach(()  => { document.body.innerHTML = ''; });

function el(id = 'wrap') {
    const div = document.createElement('div');
    div.id = id;
    document.body.appendChild(div);
    return `#${id}`;
}

// ─── form.slider() ────────────────────────────────────────────────────────────

describe('form.slider()', () => {
    it('returns null for an unknown target', () => {
        expect(form.slider('#nonexistent')).toBeNull();
    });

    it('renders an oja-slider-wrap inside the container', () => {
        form.slider(el(), { value: 50 });
        expect(document.querySelector('.oja-slider-wrap')).not.toBeNull();
    });

    it('renders a range input with correct min/max/step/value', () => {
        form.slider(el(), { min: 10, max: 200, step: 5, value: 50 });
        const input = document.querySelector('input[type="range"]');
        expect(Number(input.min)).toBe(10);
        expect(Number(input.max)).toBe(200);
        expect(Number(input.step)).toBe(5);
        expect(Number(input.value)).toBe(50);
    });

    it('renders a label span with the initial value', () => {
        form.slider(el(), { value: 75 });
        const label = document.querySelector('.oja-slider-label');
        expect(label).not.toBeNull();
        expect(label.textContent).toBe('75');
    });

    it('uses label fn to format the initial display', () => {
        form.slider(el(), { value: 80, label: (v) => `${v}%` });
        expect(document.querySelector('.oja-slider-label').textContent).toBe('80%');
    });

    it('calls onInput on every input event (pointer move)', () => {
        const onInput = vi.fn();
        form.slider(el(), { value: 0, onInput });
        const input = document.querySelector('input[type="range"]');
        input.value = '42';
        input.dispatchEvent(new Event('input'));
        expect(onInput).toHaveBeenCalledWith(42);
    });

    it('calls onChange on change event (pointer up)', () => {
        const onChange = vi.fn();
        form.slider(el(), { value: 0, onChange });
        const input = document.querySelector('input[type="range"]');
        input.value = '88';
        input.dispatchEvent(new Event('change'));
        expect(onChange).toHaveBeenCalledWith(88);
    });

    it('updates label text on input', () => {
        form.slider(el(), { value: 0, label: (v) => `val:${v}` });
        const input = document.querySelector('input[type="range"]');
        input.value = '33';
        input.dispatchEvent(new Event('input'));
        expect(document.querySelector('.oja-slider-label').textContent).toBe('val:33');
    });

    it('getValue() returns current numeric value', () => {
        const h = form.slider(el(), { value: 42 });
        expect(h.getValue()).toBe(42);
    });

    it('setValue() updates the input and label', () => {
        const h = form.slider(el(), { value: 0, label: (v) => `${v}` });
        h.setValue(99);
        expect(Number(document.querySelector('input[type="range"]').value)).toBe(99);
        expect(document.querySelector('.oja-slider-label').textContent).toBe('99');
    });

    it('destroy() clears the container', () => {
        const h = form.slider(el(), { value: 50 });
        h.destroy();
        expect(document.querySelector('.oja-slider-wrap')).toBeNull();
    });
});

// ─── form.colorPicker() ───────────────────────────────────────────────────────

describe('form.colorPicker()', () => {
    it('returns null for an unknown target', () => {
        expect(form.colorPicker('#nonexistent')).toBeNull();
    });

    it('renders a native color input', () => {
        form.colorPicker(el(), { value: '#ff0000' });
        expect(document.querySelector('input[type="color"]')).not.toBeNull();
    });

    it('sets the initial color on the native input', () => {
        form.colorPicker(el(), { value: '#3b82f6' });
        expect(document.querySelector('input[type="color"]').value).toBe('#3b82f6');
    });

    it('renders a preview div', () => {
        form.colorPicker(el(), { value: '#123456' });
        expect(document.querySelector('.oja-color-preview')).not.toBeNull();
    });

    it('renders swatch buttons when swatches provided', () => {
        form.colorPicker(el(), { swatches: ['#ff0000', '#00ff00', '#0000ff'] });
        expect(document.querySelectorAll('.oja-color-swatch')).toHaveLength(3);
    });

    it('does not render swatch row when swatches is empty', () => {
        form.colorPicker(el(), { swatches: [] });
        expect(document.querySelector('.oja-color-swatches')).toBeNull();
    });

    it('renders alpha slider when alpha is true', () => {
        form.colorPicker(el(), { alpha: true });
        expect(document.querySelector('.oja-color-alpha')).not.toBeNull();
    });

    it('does not render alpha slider by default', () => {
        form.colorPicker(el(), {});
        expect(document.querySelector('.oja-color-alpha')).toBeNull();
    });

    it('calls onChange when native input changes', () => {
        const onChange = vi.fn();
        form.colorPicker(el(), { value: '#000000', onChange });
        const input = document.querySelector('input[type="color"]');
        input.value = '#ff0000';
        input.dispatchEvent(new Event('input'));
        expect(onChange).toHaveBeenCalledWith('#ff0000');
    });

    it('clicking a swatch calls onChange with swatch color', () => {
        const onChange = vi.fn();
        form.colorPicker(el(), { value: '#000000', swatches: ['#aabbcc'], onChange });
        document.querySelector('.oja-color-swatch').click();
        expect(onChange).toHaveBeenCalledWith('#aabbcc');
    });

    it('getValue() returns { color, alpha } object', () => {
        const h = form.colorPicker(el(), { value: '#abcdef' });
        const v = h.getValue();
        expect(v).toHaveProperty('color');
        expect(v).toHaveProperty('alpha');
        expect(v.color).toBe('#abcdef');
        expect(v.alpha).toBe(1);
    });

    it('setValue() updates the native input and preview', () => {
        const h = form.colorPicker(el(), { value: '#000000' });
        h.setValue('#ffffff');
        expect(document.querySelector('input[type="color"]').value).toBe('#ffffff');
    });

    it('setAlpha() updates alpha value', () => {
        const h = form.colorPicker(el(), { value: '#ff0000', alpha: true });
        h.setAlpha(0.5);
        expect(h.getValue().alpha).toBe(0.5);
    });

    it('destroy() clears the container', () => {
        const h = form.colorPicker(el(), { value: '#ff0000' });
        h.destroy();
        expect(document.querySelector('#wrap').innerHTML).toBe('');
    });
});
