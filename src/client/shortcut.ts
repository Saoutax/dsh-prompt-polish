/**
 * The keyboard binding of the polish action.
 *
 * The binding resolves the target session from the keyboard event's DOM
 * context - the same `[data-conversation-session]` attribute the host's own
 * Escape shortcut reads - and then drives that session's mounted button. The
 * shortcut therefore follows the focused conversation, never a race between
 * parallel composers.
 *
 * @module @saoutax/dsh-prompt-polish/client/shortcut
 */

import type { ClientContext } from './contracts.js';

/** DOM context the shortcut service passes to `resolve`. */
interface ShortcutContext {
    readonly target: Element | null;
}

/** Keyboard code of the default binding. */
const SHORTCUT_CODE = 'Period';

/** DOM attribute the host stamps on the conversation of the focused session. */
const SESSION_ATTRIBUTE = 'data-conversation-session';

/**
 * Read the focused conversation's session id from the shortcut's DOM context.
 * @param target - the event target the shortcut service supplies.
 * @returns the session id, or `undefined` outside a conversation.
 */
const sessionOf = (target: Element | null): string | undefined => {
    if (target === null) {
        return undefined;
    }
    const occurrence = target.closest(`[${SESSION_ATTRIBUTE}]`);
    return occurrence === null
        ? undefined
        : (occurrence.getAttribute(SESSION_ATTRIBUTE) ?? undefined);
};

/**
 * Register the shortcut on the client context.
 * @param ctx - the client plugin context.
 * @param t - the plugin's translate function.
 * @param currentRun - reads the live action of one session's mounted button.
 * @returns the registration disposer.
 */
export const registerShortcut = (
    ctx: ClientContext,
    t: (key: string) => string,
    currentRun: (sessionId: string) => (() => void) | undefined,
): (() => void) => {
    return ctx.shortcuts.register({
        id: 'promptPolish.run',
        label: () => t('action.polish'),
        aliases: ['polish prompt', 'rewrite prompt'],
        defaults: {
            'web:macos': { code: SHORTCUT_CODE, modifiers: ['primary', 'shift'] },
            'web:windows': { code: SHORTCUT_CODE, modifiers: ['primary', 'shift'] },
            'web:linux': { code: SHORTCUT_CODE, modifiers: ['primary', 'shift'] },
        },
        regions: ['page', 'editable'],
        modals: [],
        resolve: (context: ShortcutContext) => {
            const sessionId = sessionOf(context.target);
            if (sessionId === undefined) {
                return { status: 'blocked', reason: t('notice.unavailable') };
            }
            const run = currentRun(sessionId);
            if (run === undefined) {
                return { status: 'blocked', reason: t('notice.unavailable') };
            }
            return { status: 'handled', run };
        },
    });
};
