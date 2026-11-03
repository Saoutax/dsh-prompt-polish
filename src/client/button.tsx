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
 * State ownership: the undo snapshot and the expiry timer live in this
 * component. The renderer remounts a session-scoped entry on every session
 * switch, so component state cannot leak across sessions and needs no
 * module-level registry.
 *
 * Failures surface through the composer's own notice channel
 * (`SessionInput.notify`), so they render exactly like the host's composer
 * errors instead of a bespoke banner. The channel is best-effort: a session
 * released before the notice arrives drops it silently.
 *
 * @module @saoutax/dsh-prompt-polish/client/button
 */

import { canPolish, proseOf, rebuildDraft } from '../draft.js';
import { renderIcon } from '../icons.js';
import { callPolish } from './bridge.js';
import type {
    ButtonPhase,
    ClaimLike,
    ClientContext,
    DraftSnapshotLike,
    EntryProps,
    InputState,
    OccurrenceLike,
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
 * Build the button component bound to one plugin context.
 * @param ctx - the client plugin context.
 * @param React - the React runtime from the module table.
 * @param t - the plugin's translate function.
 * @param undoWindowMs - how long the undo state stays available.
 * @returns the component plus the runner the shortcut drives.
 */
export const PolishButton = (
    ctx: ClientContext,
    React: ReactLike,
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

    /**
     * Surface one notice through the composer's own channel.
     *
     * Best-effort by design: a session released before the notice lands drops
     * it, and the composer facade throws on unretained scopes, so the whole
     * delivery is guarded.
     *
     * @param sessionId - Session whose composer shows the notice.
     * @param level - severity tier.
     * @param text - localized notice body.
     */
    const say = (sessionId: string, level: 'info' | 'error', text: string): void => {
        try {
            const actx = ctx.sessions.scope(sessionId);
            if (actx === undefined) {
                return;
            }
            ctx.conversation.input.for(actx).notify(level, text);
        } catch {
            // The session is gone; the notice has nowhere to land.
        }
    };

    /** The component React renders into the slot cell. */
    const Button = (props: EntryProps): unknown => {
        const { sessionId, useInput, inputActions } = props;
        const draft = useInput(state => state.draft);
        const phase = useInput(state => state.phase);
        const claim = useInput(state => state.claim);
        const occurrences = useInput(state => state.occurrences);

        const [uiPhase, setUiPhase] = React.useState<ButtonPhase>('idle');
        const undoRef = React.useRef<UndoState | undefined>(undefined);
        const expiryRef = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
        const busyRef = React.useRef(false);
        // Guards every async continuation below: once this flips to false, a
        // still-settling request's `.then`/`.catch`/`.finally` must not touch
        // React state or `inputActions` on a component that already unmounted.
        const aliveRef = React.useRef(true);
        // Owns the in-flight request's cancellation. A fresh request aborts
        // whatever the previous one was still waiting on, and unmounting aborts
        // the last one instead of leaving it to settle unobserved.
        const controllerRef = React.useRef<AbortController | undefined>(undefined);
        // Lets a settling request re-read the composer's current facts instead
        // of the stale snapshot closed over when it was sent.
        const latestRef = React.useRef<SnapshotSource>({ draft, occurrences, claim });
        latestRef.current = { draft, occurrences, claim };

        // A switching session remounts this entry, so transient state starts
        // clean; no cross-session inheritance is possible or wanted.
        React.useEffect(() => {
            busyRef.current = false;
        }, [sessionId]);

        // Unmounting closes the undo window and the in-flight request: no
        // timer or pending promise outlives the composer it was serving.
        React.useEffect(
            () => () => {
                aliveRef.current = false;
                if (expiryRef.current !== undefined) {
                    clearTimeout(expiryRef.current);
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
                say(sessionId, 'info', t('notice.busy'));
                return;
            }

            const target = snapshotOf({ draft, occurrences, claim });
            if (!canPolish(target)) {
                say(sessionId, 'info', t('notice.empty'));
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

            // Only the prose travels: the leading command token stays in the
            // draft and is not something the model should rewrite.
            void callPolish(controller.signal, sessionId, proseOf(target))
                .then(result => {
                    if (!aliveRef.current) {
                        return;
                    }
                    if (!result.ok) {
                        setUiPhase('idle');
                        say(sessionId, 'error', `${t('error.prefix')}: ${result.message}`);
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
                        say(sessionId, 'info', t('notice.changed'));
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
                    if (!aliveRef.current) {
                        return;
                    }
                    setUiPhase('idle');
                    say(
                        sessionId,
                        'error',
                        `${t('error.prefix')}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                })
                .finally(() => {
                    busyRef.current = false;
                });
        }, [canUndo, submitting, draft, claim, occurrences, sessionId, inputActions, t]);

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

        // No polishable prose and nothing to undo: the seat stays empty instead
        // of showing a button that could only ever explain itself.
        if (uiPhase !== 'busy' && !canUndo && !polishable) {
            return null;
        }

        return createElement(
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
    };

    return { Button, currentRun };
};
