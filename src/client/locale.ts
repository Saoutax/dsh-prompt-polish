/**
 * Client dictionaries loaded from JSON at build time.
 *
 * The browser half imports the JSON directly (esbuild inlines it), so the
 * dictionaries stay editable without touching TypeScript and the bundle carries
 * no file reads.
 *
 * @module @saoutax/dsh-prompt-polish/client/locale
 */

import enJson from '../../locale/en-US.json';
import zhJson from '../../locale/zh-CN.json';

/** Dictionary namespace owned by this plugin. */
const LOCALE_NS = 'promptPolish';

/** One language's strings, typed loosely because JSON imports widen keys. */
type Dict = Record<string, string>;

/** Locale table keyed by the Harness locale id. */
const DICTS: Record<string, Dict> = {
    en: enJson,
    zh: zhJson,
};

/** Dictionary namespace and locale table of this plugin. */
export { LOCALE_NS, DICTS };
