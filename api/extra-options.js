/**
 * Catalog-driven extra settings (`ui.extraOptions` in shared/model-catalog.json).
 *
 * Each definition names the request field it fills (`param`, dotted for nested
 * objects such as `model_params.thinking_level`). Values come from the
 * client's `extra_options` object and are checked against the definition, so
 * a client can only send fields the catalog allows, with allowed values.
 * A value equal to the definition's default is left out, letting the
 * provider apply its own default.
 */

const MAX_EXTRA_OPTION_KEYS = 32;

function sanitizeExtraOptions(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [key, value] of Object.entries(raw).slice(0, MAX_EXTRA_OPTION_KEYS)) {
        if (typeof key !== 'string' || key.length > 64) continue;
        if (['string', 'number', 'boolean'].includes(typeof value)) out[key] = value;
    }
    return out;
}

/**
 * @returns {{ value: any }|null} the value to send, or null to leave the field out
 */
function resolveExtraOptionValue(definition, raw) {
    if (definition.type === 'toggle') {
        const enabled = raw === true || raw === 'true'
            ? true
            : raw === false || raw === 'false' ? false : Boolean(definition.default);
        if (enabled === Boolean(definition.default)) return null;
        if (enabled && 'onValue' in definition) return { value: definition.onValue };
        if (!enabled && 'offValue' in definition) return { value: definition.offValue };
        return { value: enabled };
    }

    if (definition.type === 'select') {
        const allowed = (definition.options || []).map((option) => (typeof option === 'object' ? option.value : option));
        if (!allowed.includes(raw) || raw === definition.default) return null;
        return { value: raw };
    }

    if (definition.type === 'number') {
        if (raw === '' || raw === null || raw === undefined) return null;
        const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
        if (!Number.isSafeInteger(parsed)) return null;
        const min = Number.isFinite(definition.min) ? definition.min : Number.MIN_SAFE_INTEGER;
        const max = Number.isFinite(definition.max) ? definition.max : Number.MAX_SAFE_INTEGER;
        if (parsed < min || parsed > max) return null;
        return { value: parsed };
    }

    return null;
}

function setPath(target, path, value) {
    const parts = path.split('.');
    let node = target;
    for (const part of parts.slice(0, -1)) {
        if (!node[part] || typeof node[part] !== 'object' || Array.isArray(node[part])) node[part] = {};
        node = node[part];
    }
    node[parts[parts.length - 1]] = value;
}

/**
 * Write the selected extra options into a provider payload (mutates and returns it).
 * @param {object} payload
 * @param {Array<object>} definitions - resolved `ui.extraOptions`
 * @param {object} values - sanitized client `extra_options`
 */
function applyExtraOptions(payload, definitions, values) {
    if (!Array.isArray(definitions) || definitions.length === 0) return payload;
    const provided = values && typeof values === 'object' ? values : {};
    for (const definition of definitions) {
        if (!definition?.key || !definition?.param) continue;
        const resolved = resolveExtraOptionValue(definition, provided[definition.key]);
        if (resolved) setPath(payload, definition.param, resolved.value);
    }
    return payload;
}

module.exports = {
    applyExtraOptions,
    resolveExtraOptionValue,
    sanitizeExtraOptions,
};
