/**
 * Build both halves of the plugin.
 *
 * The Host half is plain ESM that Node imports directly, so the deployment's own
 * `@deepseek-ai/*` packages resolve at runtime and stay external.
 *
 * The browser half is not an importable module: the page's module table loads it
 * as `window.__ModuleLoader__.load({ id, factory })`, where `factory(require)`
 * hands the package its dependencies (React among them) from the host's module
 * table. Bundling cannot produce that wrapper on its own, so the build emits the
 * bundle as the factory body and writes the wrapper around it.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** The workspace root: scripts/ sits one level below it. */
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const packageName = pkg.name;
const outDir = join(root, 'lib');

/** Harness packages the deployment provides, never bundled. */
const HARNESS_EXTERNAL = ['@deepseek-ai/*', 'zod', 'schemastery'];

/** Build the Host half as ESM. */
const buildHost = async () => {
    await build({
        entryPoints: [join(root, 'src/host/index.ts')],
        outfile: join(outDir, 'index.js'),
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node22',
        external: HARNESS_EXTERNAL,
        sourcemap: false,
        legalComments: 'none',
        logLevel: 'warning',
    });
};

/** Global the IIFE assigns its exports to; the wrapper reads the plugin from it. */
const CLIENT_GLOBAL = '__promptPolishBundle';

/**
 * Build the browser half and wrap it in the module-table registration call.
 *
 * React is external: the module table seeds it, so the plugin must neither ship
 * a second copy nor depend on a particular React version.
 */
const buildClient = async () => {
    const result = await build({
        entryPoints: [join(root, 'src/client/index.ts')],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        globalName: CLIENT_GLOBAL,
        external: ['react'],
        // The stylesheet is bundled as a string and injected as one <style> tag
        // at activation, so the source stays a real .css file.
        loader: { '.css': 'text' },
        sourcemap: false,
        legalComments: 'none',
        logLevel: 'warning',
    });

    const chunk = result.outputFiles?.[0];
    if (chunk === undefined) {
        throw new Error('prompt-polish: esbuild produced no client output');
    }
    const body = chunk.text;

    // The IIFE assigns its exports to the global instead of writing module.exports,
    // so the factory reads the plugin from there after React arrives.
    const wrapped = `window.__ModuleLoader__.load({
  id: ${JSON.stringify(packageName)},
  factory: (require) => {
${indent(body, '    ')}
    var React = require('react')
    return ${CLIENT_GLOBAL}.createClientPlugin(React)
  },
})
`;
    writeFileSync(join(outDir, 'client.js'), wrapped, 'utf8');
};

/**
 * Indent a block so it reads as part of the generated wrapper.
 * @param text - block to indent.
 * @param prefix - indentation to add to every non-empty line.
 * @returns the indented block.
 */
const indent = (text, prefix) => {
    return text
        .split('\n')
        .map(line => (line === '' ? line : prefix + line))
        .join('\n');
};

/**
 * Emit the Plugin Manager icon from Lucide's own artwork for the same glyph the
 * toolbar button uses, so the two never drift apart.
 */
const buildIcon = async () => {
    const { Sparkles } = await import('lucide');
    const body = Sparkles.map(([tag, attrs]) => {
        const attributes = Object.entries(attrs)
            .map(([key, value]) => `${key}="${String(value)}"`)
            .join(' ');
        return `  <${tag} ${attributes} />`;
    }).join('\n');

    // A neutral stroke color, because the Plugin Manager renders this file in an
    // <img> tag where `currentColor` has nothing to inherit from. No background:
    // the glyph alone, like the shipped plugin icons. The toolbar keeps
    // `currentColor` so its icons follow the theme.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#808080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${body}
</svg>
`;
    writeFileSync(join(root, 'icon.svg'), svg, 'utf8');
};

if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
}

await buildHost();
await buildClient();
await buildIcon();
// The Host reads the default instruction from this directory at activation.
// Copy after clearing so prompts removed from the source do not linger in lib/.
rmSync(join(root, 'lib', 'prompts'), { recursive: true, force: true });
cpSync(join(root, 'prompts'), join(root, 'lib', 'prompts'), { recursive: true });

console.log('prompt-polish: built lib/index.js, lib/client.js, icon.svg, lib/prompts/');
