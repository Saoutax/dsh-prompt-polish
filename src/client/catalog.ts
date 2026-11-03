/**
 * The deployment's model catalog, as the settings page needs it.
 *
 * The catalog comes from the Host through `remote.session.modelCatalog()`, the
 * same call the composer's own model selector uses, so the page offers exactly
 * the routes that selector offers - including each model's advertised reasoning
 * efforts. Reading it here rather than rebuilding it from `llm` keeps the two
 * lists from disagreeing, and it works before any Session exists because the
 * catalog is deployment-global.
 *
 * @module @saoutax/dsh-prompt-polish/client/catalog
 */

import type {
    CatalogState,
    EffortLike,
    ModelCatalogLike,
    ModelLike,
    RemoteLike,
} from './contracts.js';

/** Where the catalog is read from. */
interface CatalogSource {
    readonly remote: RemoteLike;
}

/**
 * Load the deployment's model catalog.
 * @param source - the client context's remote face.
 * @returns the catalog, or a failure the page renders instead of a picker.
 */
const loadCatalog = async (source: CatalogSource): Promise<CatalogState> => {
    try {
        const answer = await source.remote.session.modelCatalog();
        if (!answer.ok) {
            return {
                status: 'error',
                error: `${answer.error?.code ?? 'unknown'}: ${answer.error?.message ?? 'no detail'}`,
                groups: [],
            };
        }
        return { status: 'ready', error: null, groups: answer.value?.groups ?? [] };
    } catch (error) {
        return {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
            groups: [],
        };
    }
};

/**
 * The models one provider group advertises.
 * @param groups - every provider group in the catalog.
 * @param provider - provider route to select.
 * @returns that provider's models, or an empty list when it advertises none.
 */
const modelsOf = (groups: readonly ModelCatalogLike[], provider: string): ModelLike[] => {
    return groups.find(group => group.id === provider)?.models.slice() ?? [];
};

/**
 * The reasoning efforts one model advertises.
 *
 * An empty answer is meaningful: the model does not take an effort, so the page
 * offers no choice rather than sending one the model would reject.
 * @param groups - every provider group in the catalog.
 * @param provider - provider route that owns the model.
 * @param model - model id to inspect.
 * @returns the advertised efforts, empty when the model advertises none.
 */
const effortsOf = (
    groups: readonly ModelCatalogLike[],
    provider: string,
    model: string,
): readonly EffortLike[] => {
    return modelsOf(groups, provider).find(entry => entry.id === model)?.reasoning?.efforts ?? [];
};

/** Read the deployment catalog; the models of one provider; the efforts of one model. */
export { loadCatalog, modelsOf, effortsOf };
