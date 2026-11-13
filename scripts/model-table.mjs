#!/usr/bin/env node
/**
 * Print the README "Supported Models" tables from shared/model-catalog.json.
 *
 *   node scripts/model-table.mjs            # print to stdout
 *   node scripts/model-table.mjs --write    # replace the block in README.md
 *
 * The block sits between <!-- models:start --> and <!-- models:end --> in README.md.
 * tests/readme-models.test.js fails when a catalog model is missing from it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { MODELS, TYPE_PILL_LABEL } = await import(path.join(root, 'js/models.js'));
const { resolveCapabilities, getUiCapabilities, isVisibleInPicker } = await import(path.join(root, 'js/model-capabilities.js'));

const ROUTES = [
    { key: 'evolink', title: 'Evolink', note: 'Evolink API key. Images and videos run as async tasks.' },
    { key: 'openrouter', title: 'OpenRouter', note: 'OpenRouter API key. Image models use the OpenRouter Image API, falling back to chat completions.' },
    { key: 'xai', title: 'xAI (direct)', note: 'xAI API key.' },
];

function settingsFor(id) {
    const ui = getUiCapabilities(id);
    const caps = resolveCapabilities(id);
    const parts = [];
    if (ui.aspectRatio) parts.push('aspect ratio');
    if (ui.resolution) parts.push(`resolution ${ui.resolution.options.join('/')}`);
    if (ui.quality) parts.push(`quality ${ui.quality.options.join('/')}`);
    if (ui.exactSize) parts.push('exact pixels');
    if (ui.outputFormat) parts.push(`format ${ui.outputFormat.options.join('/')}`);
    if (ui.background) parts.push(`background ${ui.background.options.join('/')}`);
    if (ui.videoLength) parts.push(`${ui.videoLength.min}–${ui.videoLength.max}s`);
    if (ui.videoQuality) parts.push(ui.videoQuality.options.join('/'));
    if (ui.generateAudio) parts.push('audio');
    if (ui.contentFilter) parts.push('content filter');
    if (ui.webSearch) parts.push('web search');
    for (const option of ui.extraOptions) parts.push(option.label.toLowerCase());
    const input = caps.input || {};
    if (input.video?.required) parts.push(`MP4 input ≤${input.video.maxSeconds}s`);
    if (input.maxImages > 0) {
        const count = input.required && input.maxImages > 1 ? `1–${input.maxImages}` : String(input.maxImages);
        parts.push(`${input.required ? 'needs' : 'up to'} ${count} image${input.maxImages === 1 ? '' : 's'}`);
    }
    return parts.join(', ') || '—';
}

function typeLabel(model) {
    return model.modes.map((mode) => TYPE_PILL_LABEL[mode] || mode).join(' + ');
}

export function buildModelTables() {
    const visible = MODELS.filter((m) => isVisibleInPicker(m.id));
    const lines = [];
    const typeCounts = {};
    for (const m of visible) typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;

    for (const route of ROUTES) {
        const rows = visible.filter((m) => m.apiKey === route.key);
        if (rows.length === 0) continue;
        lines.push(`### ${route.title} (${rows.length})`, '', route.note, '');
        lines.push('| Model | Provider | Type | Settings | Price | ID |', '| --- | --- | --- | --- | --- | --- |');
        for (const m of rows) {
            lines.push(`| ${m.name} | ${m.provider} | ${typeLabel(m)} | ${settingsFor(m.id)} | ${m.costLabel} | \`${m.id}\` |`);
        }
        lines.push('');
    }

    const byType = Object.entries(typeCounts)
        .map(([type, count]) => `${count} ${TYPE_PILL_LABEL[type] || type}`)
        .join(', ');
    lines.push(`**Totals:** ${visible.length} models (${byType}). Prices are the app's estimates; Evolink and OpenRouter report the exact charge after each run.`);
    return lines.join('\n');
}

const START = '<!-- models:start -->';
const END = '<!-- models:end -->';

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const table = buildModelTables();
    if (process.argv.includes('--write')) {
        const readmePath = path.join(root, 'README.md');
        const readme = readFileSync(readmePath, 'utf8');
        const start = readme.indexOf(START);
        const end = readme.indexOf(END);
        if (start === -1 || end === -1) throw new Error('README.md is missing the models:start / models:end markers');
        writeFileSync(readmePath, `${readme.slice(0, start + START.length)}\n${table}\n${readme.slice(end)}`);
        console.log('README.md model tables updated.');
    } else {
        console.log(table);
    }
}
