/**
 * Shared types of the browser half: the React surface, the context face, and the
 * composer projections the components read.
 *
 * The plugin receives React from the page's module table and the client context
 * from Cordis, so both are structural shapes here, never imports.
 *
 * @module @saoutax/dsh-prompt-polish/client/contracts
 */

/** Element factory: the subset of React's `createElement` the plugin needs. */
type ElementFactory = (
    type: string,
    props: Record<string, unknown>,
    ...children: unknown[]
) => unknown;

/** React surface the module table hands to a client factory. */
interface ReactLike {
    createElement: ElementFactory;
    useState: <T>(initial: T | (() => T)) => [T, (next: T | ((previous: T) => T)) => void];
    useEffect: (effect: () => void | (() => void), deps?: readonly unknown[]) => void;
    useRef: <T>(initial: T) => { current: T };
    useCallback: <T extends (...args: never[]) => unknown>(fn: T, deps: readonly unknown[]) => T;
}

/** Snapshot selector hook the slot supplies. */
type SelectorHook<T> = <R>(selector: (value: T) => R) => R;

/** One reference chip as the composer publishes it. */
interface OccurrenceLike {
    readonly source: string;
    readonly ref: string;
    readonly offset: number;
    readonly length: number;
    readonly label: string;
    readonly appearance?: 'session' | 'file' | 'folder';
    readonly clipboardText: string;
    /** Owner-resolution failure flag; preserved so rebuilt chips keep it. */
    readonly invalid?: boolean;
}

/** The claim a leading command chip holds while the draft awaits its arguments. */
interface ClaimLike {
    readonly name: string;
    /** Command spelling plus its argument separator, e.g. `/plan `. */
    readonly token: string;
}

/**
 * Composer projection the controls read.
 *
 * `claimed` means the draft opens with a command chip that is waiting for its
 * arguments (plan mode's `/plan`, a picked slash command): the document is still
 * an editable draft, so it can be polished. `adjudicating` and `submitting` are
 * the phases where a real submission is in flight and the draft must not change.
 */
interface InputState {
    readonly draft: string;
    readonly phase: 'plain' | 'adjudicating' | 'claimed' | 'submitting';
    /** Present exactly while the draft carries a claimed command chip. */
    readonly claim?: ClaimLike;
    readonly occurrences: readonly OccurrenceLike[];
}

/** Composer draft actions the slot supplies. */
interface InputActionsLike {
    setDraft(text: DraftSnapshotLike): void;
}

/** Editor-independent draft content, structurally equal to the host's type. */
interface DraftSnapshotLike {
    readonly text: string;
    readonly references: readonly {
        readonly source: string;
        readonly ref: string;
        readonly label: string;
        readonly offset: number;
        readonly length: number;
        readonly clipboardText: string;
        readonly invalid?: boolean;
        readonly appearance?: 'session' | 'file' | 'folder';
    }[];
    /** The opening command claim to carry through the replacement. */
    readonly command?: { readonly token: string };
}

/** Props a session-scoped slot passes to its entries. */
interface EntryProps {
    readonly sessionId: string;
    readonly useInput: SelectorHook<InputState>;
    readonly inputActions: InputActionsLike;
}

/** Per-session input facade, resolved through the conversation service. */
interface SessionInputLike {
    notify(level: 'info' | 'error', text: string): void;
}

/** Session-scope Cordis context the conversation service resolves facades by. */
interface ContextLike {
    readonly [key: string]: unknown;
}

/** One reasoning effort a model advertises. */
interface EffortLike {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
}

/** One model in the deployment catalog, with its advertised efforts. */
interface ModelLike {
    readonly id: string;
    readonly name: string;
    readonly description?: string;
    readonly reasoning?: {
        readonly efforts: readonly EffortLike[];
        readonly defaultEffort?: string;
    };
}

/** One provider group in the deployment catalog. */
interface ModelCatalogLike {
    readonly id: string;
    readonly name: string;
    readonly models: readonly ModelLike[];
}

/** Catalog load lifecycle the settings page renders. */
interface CatalogState {
    readonly status: 'ready' | 'error';
    readonly error: string | null;
    readonly groups: readonly ModelCatalogLike[];
}

/** Result envelope the Remote returns. */
interface RemoteAnswer<T> {
    readonly ok: boolean;
    readonly value?: T;
    readonly error?: { readonly code: string; readonly message: string };
}

/** The Remote namespaces this plugin calls. */
interface RemoteLike {
    readonly session: {
        modelCatalog(): Promise<RemoteAnswer<{ readonly groups: readonly ModelCatalogLike[] }>>;
    };
}

/** The values the settings form holds for this plugin's namespace. */
interface PolishSettings {
    readonly provider?: string;
    readonly model?: string;
    readonly reasoningEffort?: string;
    readonly instructions?: string;
    readonly maxInputChars?: number;
    readonly maxOutputTokens?: number;
    readonly temperature?: number;
}

/** One path-addressed settings write. */
interface SettingsPathOpLike {
    readonly op: 'set' | 'unset';
    readonly path: readonly string[];
    readonly value?: unknown;
}

/** Snapshot of one settings namespace, as the configuration page reads it. */
interface ConfigFormSnapshotLike<T> {
    readonly status: 'loading' | 'ready' | 'unavailable';
    readonly value: T | undefined;
    readonly revision: number | undefined;
    readonly writable: boolean;
}

/** One namespace's form: values plus the one write verb the page needs. */
interface ConfigFormLike<T> {
    getSnapshot(): ConfigFormSnapshotLike<T>;
    subscribe(listener: () => void): () => void;
    mutate(ops: readonly SettingsPathOpLike[], expectedRevision?: number): Promise<boolean>;
}

/** Minimal Cordis context surface the browser half relies on. */
interface ClientContext {
    readonly slots: {
        inject(
            key: string,
            callback: () => (() => void) | Iterable<() => void, void, void>,
        ): () => void;
        register(options: Record<string, unknown>, component: unknown): () => void;
    };
    readonly locale: {
        register(ns: string, dicts: Record<string, Record<string, string>>): () => void;
        bind(ns: string): (key: string) => string;
    };
    readonly shortcuts: {
        register(command: Record<string, unknown>): () => void;
    };
    readonly sessions: {
        scope(sessionId: string): ContextLike | undefined;
    };
    readonly conversation: {
        readonly input: {
            for(actx: ContextLike): SessionInputLike;
        };
    };
    readonly remote: RemoteLike;
    readonly configForms: {
        get<T>(entryId: string): ConfigFormLike<T>;
        whileServed(
            namespaces: readonly string[],
            register: (served: ReadonlySet<string>) => () => void,
        ): () => void;
    };
    effect(callback: () => (() => void) | void, label?: string): () => void;
}

/** What the button is currently showing. */
type ButtonPhase = 'idle' | 'busy' | 'undoable';

/** Every named type of the browser half, consolidated into one export block. */
export type {
    ElementFactory,
    ReactLike,
    SelectorHook,
    ButtonPhase,
    OccurrenceLike,
    ClaimLike,
    InputState,
    InputActionsLike,
    DraftSnapshotLike,
    EntryProps,
    SessionInputLike,
    ContextLike,
    ClientContext,
    EffortLike,
    ModelLike,
    ModelCatalogLike,
    CatalogState,
    RemoteAnswer,
    RemoteLike,
    PolishSettings,
    SettingsPathOpLike,
    ConfigFormSnapshotLike,
    ConfigFormLike,
};
