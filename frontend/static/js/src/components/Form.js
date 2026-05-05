// @ts-check
// Form — thin helpers that return HTML strings for glass-styled inputs +
// selects. The existing render pipeline is template-literal innerHTML, so
// these mirror that shape (string in → string out) instead of returning
// DOM elements callers would have to insert separately.
//
// What we save: the per-call boilerplate of remembering which class name
// goes with which background ("glass-input" on light pages, "glass-input-modal"
// in dark modals, "glass-input-light" for explicit light variant on dark pages).
// What we DON'T encapsulate: the wrapping <div> + <label> + form-hint, because
// styles vary too much per site (light vs dark theme, optional hints, custom
// margins). Callers keep their own wrapper markup.
//
// Phase F can add cross-cutting concerns here in one place — e.g. aria-required
// on every required input, aria-invalid wiring for errors, etc.
//
// Usage:
//   glassInput({ id: 'tripName', placeholder: 'e.g. Tuscany', required: true, variant: 'modal' })
//     → '<input type="text" id="tripName" class="glass-input-modal" placeholder="..." required>'
//
//   glassSelect({ id: 'manualSettleFrom', options: peopleOptionsHtml, variant: 'modal' })
//     → '<select id="manualSettleFrom" class="glass-input-modal">...</select>'

const VARIANT_CLASS = {
    default: 'glass-input',
    modal: 'glass-input-modal',
    light: 'glass-input-light',
};

/** @param {Record<string, any> | undefined} attrs */
const _attrsToString = (attrs) => {
    if (!attrs) return '';
    return Object.entries(attrs)
        .filter(([, v]) => v !== undefined && v !== null && v !== false)
        .map(([k, v]) => v === true ? ` ${k}` : ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
        .join('');
};

/**
 * @param {object} opts
 * @param {string} [opts.type='text']
 * @param {string} [opts.id]
 * @param {string} [opts.name]
 * @param {string|number} [opts.value]
 * @param {string} [opts.placeholder]
 * @param {boolean} [opts.required]
 * @param {boolean} [opts.autofocus]
 * @param {string} [opts.autocomplete]
 * @param {'default'|'modal'|'light'} [opts.variant='default']
 * @param {string} [opts.className] - extra classes appended after the variant class
 * @param {string} [opts.style] - inline style override
 * @param {Record<string, any>} [opts.attrs] - arbitrary extra attributes (data-*, min, step, max, accept, multiple, ...)
 * @returns {string}
 */
export function glassInput(opts) {
    const {
        type = 'text', id, name, value, placeholder,
        required, autofocus, autocomplete,
        variant = 'default', className, style, attrs,
    } = opts;
    const cls = `${VARIANT_CLASS[variant]}${className ? ' ' + className : ''}`;
    const baseAttrs = {
        type,
        id,
        name,
        value,
        placeholder,
        required,
        autofocus,
        autocomplete,
        class: cls,
        style,
    };
    return `<input${_attrsToString(baseAttrs)}${_attrsToString(attrs)}>`;
}

/**
 * @param {object} opts
 * @param {string} [opts.id]
 * @param {string} [opts.name]
 * @param {string} opts.options - raw <option> HTML, built by the caller (the existing pattern)
 * @param {boolean} [opts.required]
 * @param {'default'|'modal'|'light'} [opts.variant='default']
 * @param {string} [opts.className]
 * @param {string} [opts.style]
 * @param {Record<string, any>} [opts.attrs]
 * @returns {string}
 */
export function glassSelect(opts) {
    const {
        id, name, options, required, variant = 'default',
        className, style, attrs,
    } = opts;
    const cls = `${VARIANT_CLASS[variant]}${className ? ' ' + className : ''}`;
    const baseAttrs = {
        id,
        name,
        required,
        class: cls,
        style,
    };
    return `<select${_attrsToString(baseAttrs)}${_attrsToString(attrs)}>${options}</select>`;
}
