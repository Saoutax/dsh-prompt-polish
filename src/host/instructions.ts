/**
 * The default system instruction, loaded from Markdown at activation.
 *
 * The instruction lives in `prompts/polish.md` and nowhere else: it is the single
 * source of truth, editable without touching TypeScript, and the `instructions`
 * config field still overrides it when the user wants a different rewrite style.
 *
 * A compiled-in copy is deliberately not kept as a fallback. The build ships the
 * Markdown beside the bundle, so a missing file means a broken package rather
 * than a variant deployment - and a silent copy would drift from the file instead
 * of matching it. Failing loudly keeps the failure visible at activation instead
 * of degrading into a rewrite that quietly ignores its instructions.
 *
 * @module @saoutax/dsh-prompt-polish/host/instructions
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Directory of the built host entry, which sits at `lib/index.js`. */
const here = dirname(fileURLToPath(import.meta.url));

/**
 * Read the shipped default instruction.
 * @returns the Markdown text, trimmed.
 * @throws when the packaged instruction file is missing or empty, because the
 * rewrite would otherwise run without the rules that define it.
 */
export const loadInstructions = (): string => {
    const path = join(here, 'prompts', 'polish.md');
    let raw: string;
    try {
        raw = readFileSync(path, 'utf8');
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
            `prompt-polish: cannot read the packaged instructions at ${path} (${detail}); reinstall the plugin, or set the "instructions" config field.`,
            { cause: error },
        );
    }
    const text = raw.trim();
    if (text === '') {
        throw new Error(
            `prompt-polish: the packaged instructions at ${path} are empty; fill the file, or set the "instructions" config field.`,
        );
    }
    return text;
};
