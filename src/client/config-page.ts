/**
 * The plugin's configuration page, rendered directly on its own Plugins-page
 * detail view (`plugins.bundle.config`, keyed by package name).
 *
 * This plugin ships exactly one bundle row, so a reader never benefits from the
 * extra "open this row's own page" step `plugins.row.config` asks for; the
 * bundle-level slot renders unconditionally on the plugin's detail page
 * instead.
 *
 * Two model controls and the instruction field, all driven by the same two
 * sources of truth the runtime uses:
 *
 * - the model pickers read the deployment catalog the composer's own model
 *   selector reads, so the page can only offer routes that exist;
 * - the instruction field is blank when the packaged Markdown is in effect, and
 *   a non-blank value overrides it - exactly the precedence the Host applies.
 *
 * `plugins.bundle.config` hands its entries no form prop, so this component
 * owns its `ConfigForm` directly: it reads `ctx.configForms.get(ns)` once and
 * subscribes to it like any external store, re-rendering on every accepted
 * Host snapshot. Only the instruction textarea keeps a local draft, because it
 * commits on blur instead of on every keystroke.
 *
 * @module @saoutax/dsh-prompt-polish/client/config-page
 */

import { effortsOf, modelsOf } from './catalog.js';
import type {
    CatalogState,
    ConfigFormLike,
    ConfigFormSnapshotLike,
    EffortLike,
    ModelCatalogLike,
    PolishSettings,
    ReactLike,
} from './contracts.js';

/** Field key of the provider route. */
const FIELD_PROVIDER = 'provider';

/** Field key of the model id. */
const FIELD_MODEL = 'model';

/** Field key of the reasoning effort. */
const FIELD_EFFORT = 'reasoningEffort';

/** Field key of the instruction override. */
const FIELD_INSTRUCTIONS = 'instructions';

/** What the page is doing while a write is in flight. */
type SavePhase = 'idle' | 'saving' | 'failed';

/** The values the Host currently accepts for this namespace. */
interface Accepted {
    readonly provider: string;
    readonly model: string;
    readonly effort: string;
    readonly instructions: string;
}

/**
 * Read the values the Host currently accepts.
 * @param snapshot - the form's current snapshot.
 * @returns the accepted values, with absent fields as empty strings.
 */
const acceptedOf = (snapshot: ConfigFormSnapshotLike<PolishSettings>): Accepted => {
    const value = snapshot.value ?? {};
    return {
        provider: value.provider ?? '',
        model: value.model ?? '',
        effort: value.reasoningEffort ?? '',
        instructions: value.instructions ?? '',
    };
};

/**
 * Build the configuration page component bound to one plugin context.
 * @param React - the React runtime from the module table.
 * @param t - the plugin's translate function.
 * @param form - this plugin's settings form, held for the component's lifetime.
 * @param catalogOf - reads the deployment catalog, loaded once per mount.
 * @returns the component the Plugins page renders for this bundle.
 */
export const ConfigPage = (
    React: ReactLike,
    t: (key: string) => string,
    form: ConfigFormLike<PolishSettings>,
    catalogOf: () => Promise<CatalogState>,
) => {
    const createElement = React.createElement;

    /** One labelled row: label, control, and an optional hint. */
    const field = (label: string, control: unknown, hint?: string): unknown => {
        return createElement(
            'div',
            { className: 'pp-config-field', key: label },
            createElement('label', { className: 'pp-config-label' }, label),
            control,
            hint === undefined ? null : createElement('p', { className: 'pp-config-hint' }, hint),
        );
    };

    /** A native select; the empty value is the "follow the session" choice. */
    const select = (options: {
        readonly id: string;
        readonly value: string;
        readonly choices: readonly { readonly value: string; readonly label: string }[];
        readonly placeholder: string;
        readonly disabled: boolean;
        readonly onChange: (next: string) => void;
    }): unknown => {
        return createElement(
            'select',
            {
                className: 'pp-config-select',
                id: options.id,
                value: options.value,
                disabled: options.disabled,
                onChange: (event: { target: { value: string } }) => {
                    options.onChange(event.target.value);
                },
            },
            createElement('option', { value: '' }, options.placeholder),
            ...options.choices.map(choice =>
                createElement('option', { value: choice.value, key: choice.value }, choice.label),
            ),
        );
    };

    /** The component React renders on the plugin's own detail page. */
    const Page = (props: { readonly view: 'summary' | 'page' }): unknown => {
        const { view } = props;
        const [snapshot, setSnapshot] = React.useState(() => form.getSnapshot());
        const [phase, setPhase] = React.useState<SavePhase>('idle');
        const [catalog, setCatalog] = React.useState<CatalogState>({
            status: 'ready',
            error: null,
            groups: [],
        });
        const [catalogLoading, setCatalogLoading] = React.useState(true);
        const [typing, setTyping] = React.useState<string | undefined>(undefined);
        // Guards the instructions textarea's save-on-blur continuation: once
        // this flips to false, a still-settling save must not touch state on a
        // component that already unmounted.
        const aliveRef = React.useRef(true);

        // The form is an external store: subscribe once, follow every Host
        // acceptance for as long as the page stays mounted.
        React.useEffect(() => {
            setSnapshot(form.getSnapshot());
            return form.subscribe(() => {
                setSnapshot(form.getSnapshot());
            });
        }, [form]);

        React.useEffect(
            () => () => {
                aliveRef.current = false;
            },
            [],
        );

        // The catalog is deployment-global and does not change with the draft,
        // so it is fetched once per mount rather than per render.
        React.useEffect(() => {
            let live = true;
            void catalogOf().then(next => {
                if (!live) {
                    return;
                }
                setCatalog(next);
                setCatalogLoading(false);
            });
            return () => {
                live = false;
            };
        }, [catalogOf]);

        const accepted = acceptedOf(snapshot);

        // The row's one-liner: where the rules come from, so the collapsed card
        // says it without opening the page.
        if (view === 'summary') {
            return accepted.instructions.trim() === ''
                ? t('config.summary.default')
                : t('config.summary.custom');
        }

        if (snapshot.status === 'unavailable') {
            return createElement('p', { className: 'pp-config-hint' }, t('config.unavailable'));
        }

        /**
         * Persist one field, leaving the other edits untouched.
         * @returns whether the write landed, so a caller holding its own draft
         * state (the instructions textarea's `typing`) knows whether it is safe
         * to drop that draft or must keep it for a retry.
         */
        const save = (key: string, value: string): Promise<boolean> => {
            setPhase('saving');
            return form
                .mutate([{ op: 'set', path: [key], value }], snapshot.revision)
                .then(written => {
                    setPhase(written ? 'idle' : 'failed');
                    return written;
                })
                .catch(() => {
                    setPhase('failed');
                    return false;
                });
        };

        const groups: readonly ModelCatalogLike[] = catalog.groups;
        const models = modelsOf(groups, accepted.provider);
        // A stored model that is no longer advertised still appears, so the
        // value stays visible instead of silently reading as "follow the session".
        const modelChoices =
            accepted.model === '' || models.some(entry => entry.id === accepted.model)
                ? models.map(entry => ({ value: entry.id, label: entry.name }))
                : [
                      { value: accepted.model, label: `${accepted.model} (${t('config.stale')})` },
                      ...models.map(entry => ({ value: entry.id, label: entry.name })),
                  ];
        const efforts: readonly EffortLike[] = effortsOf(groups, accepted.provider, accepted.model);
        const busy = phase === 'saving';
        const instructions = typing ?? accepted.instructions;

        const providerControl = select({
            id: 'pp-config-provider',
            value: accepted.provider,
            choices: groups.map(group => ({ value: group.id, label: group.name })),
            placeholder: t('config.provider.follow'),
            disabled: busy || catalogLoading,
            onChange: next => {
                // The model belongs to its provider, so a provider change clears
                // both dependent fields in one write.
                setPhase('saving');
                void form
                    .mutate(
                        [
                            { op: 'set', path: [FIELD_PROVIDER], value: next },
                            { op: 'set', path: [FIELD_MODEL], value: '' },
                            { op: 'set', path: [FIELD_EFFORT], value: '' },
                        ],
                        snapshot.revision,
                    )
                    .then(written => {
                        setPhase(written ? 'idle' : 'failed');
                    })
                    .catch(() => {
                        setPhase('failed');
                    });
            },
        });

        const modelControl = select({
            id: 'pp-config-model',
            value: accepted.model,
            choices: modelChoices,
            placeholder:
                accepted.provider === ''
                    ? t('config.model.pickProvider')
                    : t('config.model.follow'),
            disabled: busy || catalogLoading || accepted.provider === '',
            onChange: next => {
                // A different model advertises a different effort ladder, so the
                // stored effort cannot survive the change.
                setPhase('saving');
                void form
                    .mutate(
                        [
                            { op: 'set', path: [FIELD_MODEL], value: next },
                            { op: 'set', path: [FIELD_EFFORT], value: '' },
                        ],
                        snapshot.revision,
                    )
                    .then(written => {
                        setPhase(written ? 'idle' : 'failed');
                    })
                    .catch(() => {
                        setPhase('failed');
                    });
            },
        });

        // Only the efforts this exact model advertises: sending one it does not
        // accept is rejected by the provider, so the page never offers it.
        const effortControl =
            efforts.length === 0
                ? createElement('p', { className: 'pp-config-hint' }, t('config.effort.none'))
                : select({
                      id: 'pp-config-effort',
                      value: accepted.effort,
                      choices: efforts.map(effort => ({ value: effort.id, label: effort.name })),
                      placeholder: t('config.effort.follow'),
                      disabled: busy,
                      onChange: next => {
                          void save(FIELD_EFFORT, next);
                      },
                  });

        const instructionsControl = createElement('textarea', {
            className: 'pp-config-textarea',
            id: 'pp-config-instructions',
            rows: 6,
            value: instructions,
            placeholder: t('config.instructions.placeholder'),
            disabled: busy,
            onChange: (event: { target: { value: string } }) => {
                setTyping(event.target.value);
            },
            onBlur: () => {
                // Committed on blur so typing does not write on every keystroke.
                if (typing === undefined || typing === accepted.instructions) {
                    setTyping(undefined);
                    return;
                }
                // Dropping the local draft before the write lands would flash the
                // still-stale accepted value back into the textarea, and would
                // discard what the author typed for good if the write then fails.
                // The draft is only cleared once the Host has actually accepted it.
                const committed = typing;
                void save(FIELD_INSTRUCTIONS, committed).then(written => {
                    if (!aliveRef.current || !written) {
                        return;
                    }
                    setTyping(current => (current === committed ? undefined : current));
                });
            },
        });

        return createElement(
            'div',
            { className: 'pp-config' },
            catalog.status === 'error'
                ? createElement(
                      'p',
                      { className: 'pp-config-error' },
                      `${t('config.catalog.failed')}: ${catalog.error ?? ''}`,
                  )
                : null,
            field(t('config.provider.label'), providerControl, t('config.provider.hint')),
            field(t('config.model.label'), modelControl, t('config.model.hint')),
            field(t('config.effort.label'), effortControl, t('config.effort.hint')),
            field(
                t('config.instructions.label'),
                instructionsControl,
                t('config.instructions.hint'),
            ),
            phase === 'failed'
                ? createElement('p', { className: 'pp-config-error' }, t('config.saveFailed'))
                : null,
        );
    };

    return { Page };
};
