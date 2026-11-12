/**
 * The composer toolbar button.
 *
 * One compact control with three states: idle (polish), busy (working), and
 * undoable (revert the replacement). It reads the composer projection through
 * the slot's selector hook and writes through `inputActions.setDraft`, which
 * accepts a full draft snapshot and therefore keeps reference chips and a
 * leading command claim alive.
 *
 * A claimed draft (plan mode's `/plan`, a picked slash command) is an ordinary
 * editable draft whose prose follows the command token, so it polishes like any
 * other: only the prose is sent, and the claim rides along untouched.
 *
 * State ownership: the undo snapshot, the expiry timer, and the transient
 * notice live in this component. The renderer remounts a session-scoped entry
 * on every session switch, and the session-id effect below also resets the
 * state defensively, so neither undo nor an error can leak across sessions.
 *
 * Notices are deliberately plugin-owned: the Host composer's notice store
 * keeps its last error after the toast dismisses, and the composer replays that
 * notice on every remount. A local toast renders through a portal, dismisses
 * itself, and disappears with the component, so switching sessions never
 * repeats a stale error.
 *
 * @module @saoutax/dsh-prompt-polish/client/button
 */

import { canPolish, proseOf, rebuildDraft } from '../draft.js';
import { renderIcon } from '../icons.js';
import type { PolishError, PolishResult } from '../shared.js';
import { callPolish } from './bridge.js';
import type {
    ButtonPhase,
    ClaimLike,
    DraftSnapshotLike,
    EntryProps,
    InputState,
    OccurrenceLike,
    ReactDomLike,
    ReactLike,
} from './contracts.js';

/** The pre-polish composer document, kept for the undo window. */
interface UndoState {
    readonly draft: DraftSnapshotLike;
}

/** The composer facts one draft snapshot is composed from. */
interface SnapshotSource {
    readonly draft: string;
    readonly occurrences: readonly OccurrenceLike[];
    readonly claim: ClaimLike | undefined;
}

/** One transient message shown by this plugin instead of the Host notice store. */
interface NoticeState {
    readonly level: 'info' | 'error';
    readonly text: string;
}

/** How long an error notice stays visible before dismissing itself. */
const ERROR_NOTICE_MS = 6000;

/** How long an informational notice stays visible before dismissing itself. */
const INFO_NOTICE_MS = 4000;

/** Compose the draft snapshot the composer currently holds. */
const snapshotOf = (source: SnapshotSource): DraftSnapshotLike => {
    return {
        text: source.draft,
        references: source.occurrences.map(occurrence => ({
            source: occurrence.source,
            ref: occurrence.ref,
            label: occurrence.label,
            offset: occurrence.offset,
            length: occurrence.length,
            clipboardText: occurrence.clipboardText,
            ...(occurrence.invalid === undefined ? {} : { invalid: occurrence.invalid }),
            ...(occurrence.appearance === undefined ? {} : { appearance: occurrence.appearance }),
        })),
        ...(source.claim === undefined ? {} : { command: { token: source.claim.token } }),
    };
};

/** Phases where a real submission is in flight and the draft must stay put. */
const isSubmitting = (phase: InputState['phase']): boolean => {
    return phase === 'adjudicating' || phase === 'submitting';
};

/**
 * Turn one failed result into the sentence the button shows.
 *
 * Transport codes are never user-facing prose: the route returns compact codes
 * such as `http-404`, so they are translated here. A Session-resolution failure
 * gets its own actionable sentence.
 *
 * @param t - the plugin's translate function.
 * @param result - the failed polish result.
 * @returns localized failure text.
 */
const failureText = (t: (key: string) => string, result: PolishError): string => {
    if (result.reason === 'no-session') {
        return t('error.no-session');
    }
    if (
        result.message.startsWith('http-') ||
        result.message === 'non-JSON' ||
        result.message === 'unexpected-answer'
    ) {
        return `${t('error.transport')} (${result.message})`;
    }
    return result.message;
};

/**
 * Build the button component bound to one plugin context.
 * @param React - the React runtime from the module table.
 * @param ReactDOM - the ReactDOM runtime used for the transient notice portal.
 * @param t - the plugin's translate function.
 * @param undoWindowMs - how long the undo state stays available.
 * @returns the component plus the runner the shortcut drives.
 */
export const PolishButton = (
    React: ReactLike,
    ReactDOM: ReactDomLike | undefined,
    t: (key: string) => string,
    undoWindowMs: number,
) => {
    const createElement = React.createElement;

    /** Runs of mounted buttons per Session; effects keep this in step. */
    const runs = new Map<string, () => void>();

    /**
     * Read the run of one Session's mounted button.
     * @param sessionId - Session to look up.
     * @returns the current action, or `undefined` when no composer is mounted.
     */
    const currentRun = (sessionId: string): (() => void) | undefined => runs.get(sessionId);

    /** The component React renders into the slot cell. */
    const Button = (props: EntryProps): unknown => {
        const { sessionId, useInput, inputActions } = props;
        const draft = useInput(state => state.draft);
        const phase = useInput(state => state.phase);
        const claim = useInput(state => state.claim);
        const occurrences = useInput(state => state.occurrences);

        const [uiPhase, setUiPhase] = React.useState<ButtonPhase>('idle');
        const [notice, setNotice] = React.useState<NoticeState | undefined>(undefined);
        const undoRef = React.useRef<UndoState | undefined>(undefined);
        const expiryRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
        const noticeTimerRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
        const busyRef = React.useRef(false);
        // Guards every async continuation below: once this flips to false, a
        // still-settling request's `.then`/`.catch`/`.finally` must not touch
        // React state or `inputActions` on a component that already unmounted.
        const aliveRef = React.useRef(true);
        // Owns the in-flight request's cancellation. A fresh request aborts
        // whatever the previous one was still waiting on, and unmounting aborts
        // the last one instead of leaving it to settle unobserved.
        const controllerRef = React.useRef<AbortController | undefined>(undefined);
        // Session the in-flight request belongs to, so a session switch can
        // discard its result without touching a request started for the new one.
        const controllerSessionRef = React.useRef<string | undefined>(undefined);
        // Lets a settling request re-read the composer's current facts instead
        // of the stale snapshot closed over when it was sent.
        const latestRef = React.useRef<SnapshotSource>({ draft, occurrences, claim });
        latestRef.current = { draft, occurrences, claim };
        // Current Session identity; the request guard compares against it.
        const sessionRef = React.useRef(sessionId);
        sessionRef.current = sessionId;

        /** Clear the transient notice and its dismissal timer. */
        const dismissNotice = React.useCallback(() => {
            if (noticeTimerRef.current !== undefined) {
                clearTimeout(noticeTimerRef.current);
                noticeTimerRef.current = undefined;
            }
            setNotice(undefined);
        }, []);

        /** Show one transient notice; a newer notice replaces the previous one. */
        const showNotice = React.useCallback((level: 'info' | 'error', text: string) => {
            if (noticeTimerRef.current !== undefined) {
                clearTimeout(noticeTimerRef.current);
            }
            setNotice({ level, text });
            noticeTimerRef.current = setTimeout(
                () => {
                    noticeTimerRef.current = undefined;
                    setNotice(undefined);
                },
                level === 'error' ? ERROR_NOTICE_MS : INFO_NOTICE_MS,
            );
        }, []);

        // A switching session remounts this entry; clear anything the previous
        // Session left behind and abort a request that belonged to it. The
        // controller-identity check keeps a request started for the new Session
        // (before this effect runs) intact.
        React.useEffect(() => {
            if (controllerSessionRef.current !== sessionId) {
                controllerRef.current?.abort();
                controllerRef.current = undefined;
                controllerSessionRef.current = undefined;
                busyRef.current = false;
                setUiPhase('idle');
            }
            if (expiryRef.current !== undefined) {
                clearTimeout(expiryRef.current);
                expiryRef.current = undefined;
            }
            undoRef.current = undefined;
            dismissNotice();
        }, [sessionId, dismissNotice]);

        // Unmounting closes the undo window, the transient notice, and the
        // in-flight request: no timer or pending promise outlives the composer
        // it was serving.
        React.useEffect(
            () => () => {
                aliveRef.current = false;
                if (expiryRef.current !== undefined) {
                    clearTimeout(expiryRef.current);
                }
                if (noticeTimerRef.current !== undefined) {
                    clearTimeout(noticeTimerRef.current);
                }
                controllerRef.current?.abort();
            },
            [],
        );

        // A claimed draft is polishable: its command chip is the document's
        // claim, not a pending submission. Only a real in-flight submit locks
        // the draft, which is the same rule the host's composer editor follows.
        const submitting = isSubmitting(phase);
        const before = snapshotOf({ draft, occurrences, claim });
        const canUndo = uiPhase === 'undoable' && undoRef.current !== undefined;
        const polishable = canPolish(before);
        const disabled = uiPhase === 'busy' || submitting || (!canUndo && !polishable);

        const run = React.useCallback(() => {
            if (busyRef.current) {
                return;
            }

            if (canUndo) {
                const saved = undoRef.current;
                undoRef.current = undefined;
                if (expiryRef.current !== undefined) {
                    clearTimeout(expiryRef.current);
                    expiryRef.current = undefined;
                }
                setUiPhase('idle');
                if (saved !== undefined) {
                    inputActions.setDraft(saved.draft);
                }
                return;
            }

            if (submitting) {
                showNotice('info', t('notice.busy'));
                return;
            }

            const target = snapshotOf({ draft, occurrences, claim });
            if (!canPolish(target)) {
                showNotice('info', t('notice.empty'));
                return;
            }

            busyRef.current = true;
            setUiPhase('busy');

            // A fresh request replaces whatever the previous one was still
            // waiting on; unmounting (see the cleanup effect above) aborts
            // this one the same way.
            controllerRef.current?.abort();
            const controller = new AbortController();
            controllerRef.current = controller;
            const requestSession = sessionId;
            controllerSessionRef.current = requestSession;

            // Only the prose travels: the leading command token stays in the
            // draft and is not something the model should rewrite.
            void callPolish(controller.signal, requestSession, proseOf(target))
                .then((result: PolishResult) => {
                    if (
                        !aliveRef.current ||
                        sessionRef.current !== requestSession ||
                        controllerRef.current !== controller
                    ) {
                        return;
                    }
                    if (!result.ok) {
                        setUiPhase('idle');
                        showNotice('error', `${t('error.prefix')}: ${failureText(t, result)}`);
                        return;
                    }

                    // The composer may have moved on while the request was in
                    // flight. Rebuilding against the stale `target` snapshot
                    // would silently overwrite whatever the author typed since
                    // the request was sent, so the result is applied only when
                    // the draft text is still the one that was sent.
                    const latest = snapshotOf(latestRef.current);
                    if (latest.text !== target.text) {
                        setUiPhase('idle');
                        showNotice('info', t('notice.changed'));
                        return;
                    }

                    const rebuilt = rebuildDraft(target, result.text);
                    if (rebuilt === undefined || rebuilt.text === target.text) {
                        // The rewrite matches the draft: nothing to apply, nothing to say.
                        setUiPhase('idle');
                        return;
                    }
                    undoRef.current = { draft: target };
                    inputActions.setDraft(rebuilt);
                    setUiPhase('undoable');
                    // The window closes itself: the icon reverts without any
                    // interaction, so a stale undo affordance never lingers.
                    if (expiryRef.current !== undefined) {
                        clearTimeout(expiryRef.current);
                    }
                    expiryRef.current = setTimeout(() => {
                        expiryRef.current = undefined;
                        undoRef.current = undefined;
                        setUiPhase(current => (current === 'undoable' ? 'idle' : current));
                    }, undoWindowMs);
                })
                .catch((error: unknown) => {
                    if (
                        !aliveRef.current ||
                        sessionRef.current !== requestSession ||
                        controllerRef.current !== controller
                    ) {
                        return;
                    }
                    setUiPhase('idle');
                    showNotice(
                        'error',
                        `${t('error.prefix')}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                })
                .finally(() => {
                    if (controllerRef.current === controller) {
                        controllerRef.current = undefined;
                        controllerSessionRef.current = undefined;
                        busyRef.current = false;
                    }
                });
        }, [
            canUndo,
            submitting,
            draft,
            claim,
            occurrences,
            sessionId,
            inputActions,
            t,
            showNotice,
        ]);

        // The registry update lives in an effect, never in render.
        React.useEffect(() => {
            runs.set(sessionId, run);
            return () => {
                if (runs.get(sessionId) === run) {
                    runs.delete(sessionId);
                }
            };
        }, [run, sessionId]);

        const iconName = canUndo ? 'undo' : uiPhase === 'busy' ? 'busy' : 'polish';
        const label = canUndo
            ? t('action.undo')
            : uiPhase === 'busy'
              ? t('action.busy')
              : t('action.polish');
        const aria = canUndo ? t('action.aria.undo') : t('action.aria.polish');

        const toast =
            notice === undefined
                ? null
                : createElement(
                      'div',
                      {
                          className: 'pp-toast',
                          'data-level': notice.level,
                          role: notice.level === 'error' ? 'alert' : 'status',
                          'aria-live': notice.level === 'error' ? 'assertive' : 'polite',
                          'aria-atomic': 'true',
                      },
                      notice.text,
                  );
        // Portals keep the toast out of the composer's containment/overflow
        // context. The inline fallback is only for a page without ReactDOM.
        const noticeView =
            toast === null
                ? null
                : ReactDOM === undefined || typeof document === 'undefined'
                  ? toast
                  : ReactDOM.createPortal(toast, document.body);

        // No polishable prose and nothing to undo or report: the seat stays
        // empty instead of showing a button that could only ever explain itself.
        const button =
            uiPhase !== 'busy' && !canUndo && !polishable
                ? null
                : createElement(
                      'button',
                      {
                          type: 'button',
                          className: 'pp-button',
                          'data-phase': uiPhase,
                          title: label,
                          'aria-label': aria,
                          'aria-busy': uiPhase === 'busy',
                          disabled,
                          onClick: run,
                      },
                      renderIcon(createElement, iconName, 16),
                  );

        if (button === null) {
            return noticeView;
        }
        return noticeView === null
            ? button
            : createElement('span', { className: 'pp-cell' }, button, noticeView);
    };

    return { Button, currentRun };
};
