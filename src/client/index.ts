/**
 * Browser half of the prompt-polish plugin.
 *
 * This entry wires the modules beside it: the button into the composer toolbar,
 * the keyboard binding, and the configuration page into the Plugins page. The
 * Host call lives in `bridge.ts`, the model catalog in `catalog.ts`, and the
 * dictionaries in `locale.ts`. Notices go through the composer's own channel,
 * so there is no bespoke banner surface here.
 *
 * @module @saoutax/dsh-prompt-polish/client
 */

import { DEFAULT_UNDO_WINDOW_MS } from '../shared.js';
import { PolishButton } from './button.js';
import { loadCatalog } from './catalog.js';
import { ConfigPage } from './config-page.js';
import type { ClientContext, PolishSettings, ReactLike } from './contracts.js';
import { DICTS, LOCALE_NS } from './locale.js';
import { registerShortcut } from './shortcut.js';
import { registerStyles } from './styles.js';
// The stylesheet travels as a string: esbuild's text loader inlines it at build
// time, and registerStyles injects it as one <style> tag.
import stylesCss from './styles.css';

/** Slot the button occupies: compact controls before the submit action. */
const BUTTON_SLOT = 'conversation.input.right';

/** Cell key of this plugin inside the slot. */
const BUTTON_ID = 'prompt-polish';

/** Order places the button after the credits cell (order 4) and before submit. */
const CELL_ORDER = 10;

/**
 * Slot the configuration page occupies on the Plugins page.
 *
 * `plugins.bundle.config` renders on the plugin's own detail page, unlike
 * `plugins.row.config` which asks the reader to first open one bundle row's
 * page. This plugin ships exactly one row, so that extra step would be a
 * pointless submenu; the bundle-level slot puts the form directly where a
 * reader already is.
 */
const CONFIG_SLOT = 'plugins.bundle.config';

/**
 * Settings namespace of this plugin.
 *
 * This is the Loader entry id from `cordis.patch.yml`, not the package name:
 * the settings domain keys every namespace by the row id, independent of which
 * Plugins-page slot renders its form.
 */
const SETTINGS_NS = 'prompt-polish';

/** Bundle-configuration cell key the Plugins page dispatches: the package name. */
const CONFIG_KEY = '@saoutax/dsh-prompt-polish';

/**
 * Register the button, the shortcut, the configuration page, the dictionaries,
 * and the stylesheet.
 * @param ctx - the client plugin context.
 * @param React - the React runtime from the module table.
 * @param undoWindowMs - how long the undo state stays available.
 */
const registerUi = (ctx: ClientContext, React: ReactLike, undoWindowMs: number): void => {
    const t = ctx.locale.bind(LOCALE_NS);

    registerStyles(ctx, stylesCss);
    ctx.effect(() => ctx.locale.register(LOCALE_NS, DICTS), 'prompt-polish: dictionaries');

    const { Button, currentRun } = PolishButton(ctx, React, t, undoWindowMs);

    ctx.slots.inject(BUTTON_SLOT, () =>
        ctx.slots.register({ name: BUTTON_SLOT, id: BUTTON_ID, order: CELL_ORDER }, Button),
    );

    ctx.effect(() => registerShortcut(ctx, t, currentRun), 'prompt-polish: shortcut');

    // The configuration cell only exists while the Host serves this plugin's
    // settings namespace; `whileServed` keeps the registration tied to that.
    // `plugins.bundle.config` hands its entries no form prop, so the page owns
    // its `ConfigForm` directly from `ctx.configForms`.
    const form = ctx.configForms.get<PolishSettings>(SETTINGS_NS);
    const { Page } = ConfigPage(React, t, form, () => loadCatalog(ctx));
    ctx.effect(
        () =>
            ctx.configForms.whileServed([SETTINGS_NS], () =>
                ctx.slots.inject(CONFIG_SLOT, () =>
                    ctx.slots.register({ name: CONFIG_SLOT, key: CONFIG_KEY }, Page),
                ),
            ),
        'prompt-polish: configuration page',
    );
};

/**
 * Build the plugin object the Client module factory returns.
 * @param React - React runtime supplied by the host module table.
 * @param undoWindowMs - how long the undo state stays available.
 * @returns the Cordis client plugin.
 */
export const createClientPlugin = (
    React: ReactLike,
    undoWindowMs: number = DEFAULT_UNDO_WINDOW_MS,
): {
    name: string;
    inject: string[];
    apply: (ctx: ClientContext) => void;
} => {
    return {
        name: 'prompt-polish-client',
        inject: [
            'slots',
            'locale',
            'shortcuts',
            'sessions',
            'conversation',
            'remote',
            'remote.session',
            'configForms',
        ],
        apply: ctx => {
            registerUi(ctx, React, undoWindowMs);
        },
    };
};
