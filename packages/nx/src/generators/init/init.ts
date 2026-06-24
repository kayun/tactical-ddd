import {
  formatFiles,
  readNxJson,
  updateNxJson,
  type NxJsonConfiguration,
  type Tree,
} from '@nx/devkit';
import type { InitGeneratorSchema } from './schema';

/**
 * Collection name this plugin publishes its generators under. Used as the key
 * in `nx.json`'s `generators` map so defaults apply to every generator we ship.
 */
const COLLECTION = '@tactical-ddd/nx';

/**
 * Generators that accept (and should inherit) the workspace-wide `prefix`.
 * Extend this list as new generators are added — for now only `shared-kernel`
 * consumes the prefix.
 */
const PREFIXED_GENERATORS = ['shared-kernel'] as const;

export async function initGenerator(tree: Tree, options: InitGeneratorSchema) {
  setGeneratorDefaults(tree, options);

  await formatFiles(tree);
}

/**
 * Persists workspace-wide generator defaults into `nx.json` so a value like the
 * organization `prefix` is configured once during `init` and then transparently
 * injected by Nx into every subsequent generator invocation (e.g.
 * `nx g @tactical-ddd/nx:shared-kernel`) without the user re-typing it.
 *
 * Defaults are written under the collection key using Nx's nested shape:
 *
 *   "generators": {
 *     "@tactical-ddd/nx": {
 *       "shared-kernel": { "prefix": "@my-org" }
 *     }
 *   }
 */
function setGeneratorDefaults(tree: Tree, options: InitGeneratorSchema) {
  const nxJson = readNxJson(tree) ?? ({} as NxJsonConfiguration);

  nxJson.generators ??= {};

  const collectionDefaults = ((nxJson.generators as Record<string, unknown>)[
    COLLECTION
  ] ??= {}) as Record<string, Record<string, unknown>>;

  for (const generator of PREFIXED_GENERATORS) {
    collectionDefaults[generator] = {
      ...collectionDefaults[generator],
      prefix: options.prefix,
    };
  }

  updateNxJson(tree, nxJson);
}

export default initGenerator;
