import {
  generateFiles,
  logger,
  OverwriteStrategy,
  readNxJson,
  updateNxJson,
  type NxJsonConfiguration,
  type Tree,
} from '@nx/devkit';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

import type { AgentsContextSyncGeneratorSchema } from './schema';

const DEFAULT_ADR_DIRECTORY = 'docs/adr/td';

/** Where non-default choices are remembered, so a migration can repeat them. */
const COLLECTION = '@tactical-ddd/nx';
const GENERATOR = 'agents-context-sync';

/**
 * Guide files recognized as an existing architecture guide, in priority order.
 * `AGENTS.md` is what this generator writes; `CLAUDE.md` is accepted because
 * workspaces that predate the tool-neutral name renamed it, and creating a
 * second guide beside it would give agents two sources of truth.
 */
const GUIDE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md'] as const;

const DEFAULT_GUIDE = GUIDE_CANDIDATES[0];

const POINTER_START = '<!-- tactical-ddd:adr-index:start -->';
const POINTER_END = '<!-- tactical-ddd:adr-index:end -->';

/**
 * Candidate locations of the ADR sources shipped with this package, relative to
 * the compiled/source location of this generator:
 *
 *   built  `<pkg>/generators/agents-context-sync` → `<pkg>/adr`
 *   source `packages/nx/src/generators/agents-context-sync` → `packages/nx/adr`
 *
 * Deliberately not resolved through `require.resolve('@tactical-ddd/nx')`: in
 * this plugin's own repository that finds the *installed* copy, which lags the
 * working tree, so unit tests would assert against stale records.
 */
const ADR_SOURCE_CANDIDATES = ['../../adr', '../../../adr'] as const;

/**
 * Owns everything this plugin writes for AI agents: the architecture guide, the
 * architecture decision records behind it, and the pointer that ties the two
 * together.
 *
 * The records are copied into the repository rather than linked into
 * `node_modules`, because that is what makes them findable: agent search tools
 * honour `.gitignore`, and `node_modules` is absent from a fresh clone, missing
 * entirely under Yarn PnP, and laid out differently by pnpm.
 *
 * The two artifacts have deliberately different ownership. The **guide** belongs
 * to the workspace — it is written once and never overwritten, because projects
 * extend it with their own rules. The **records** belong to the plugin: each copy
 * carries the plugin version and a digest of its source,
 * `{@link AgentsContextSyncGeneratorSchema.adrDirectory}` is owned wholesale, and
 * `check` mode turns that into a CI guard.
 *
 * Note this generator does *not* call `formatFiles`: the record bodies are copied
 * verbatim from the package, and reformatting them here would only add churn to
 * files nobody edits. They are already formatted in the library repository.
 */
export async function agentsContextSyncGenerator(
  tree: Tree,
  options: AgentsContextSyncGeneratorSchema = {},
): Promise<void> {
  const source = resolveAdrSource();
  const version = readPluginVersion(source);
  const directory = options.adrDirectory ?? DEFAULT_ADR_DIRECTORY;

  const records = readdirSync(source)
    .filter((file) => file.endsWith('.md'))
    .sort();

  if (records.length === 0) {
    throw new Error(
      `[tactical-ddd] no decision records found in ${source}. The plugin build is incomplete.`,
    );
  }

  const expected = new Map(
    records.map((file) => [
      join(directory, file),
      stampedRecord(readFileSync(join(source, file), 'utf-8'), file, version),
    ]),
  );

  const stale = existingRecords(tree, directory).filter(
    (path) => !expected.has(path),
  );

  if (options.check) {
    reportDrift(tree, expected, stale, directory, options);
    return;
  }

  for (const [path, content] of expected) {
    tree.write(path, content);
  }

  for (const path of stale) {
    tree.delete(path);
  }

  const guide = ensureGuide(tree, options);

  writePointer(tree, guide, directory);
  rememberChoices(tree, directory, guide);

  logger.info(
    `[tactical-ddd] synced ${expected.size} decision record(s) into ${directory} and pointed ${guide} at them (v${version}).`,
  );
}

/**
 * Returns the guide to point at, creating `AGENTS.md` from the template when the
 * workspace has none.
 *
 * `OverwriteStrategy.KeepExisting` is what makes a re-run safe: a guide the
 * workspace has customized is never replaced, only the pointer block inside it is
 * refreshed.
 */
function ensureGuide(
  tree: Tree,
  options: AgentsContextSyncGeneratorSchema,
): string {
  const existing = resolveGuide(tree, options);

  if (existing) {
    return existing;
  }

  if (options.guide) {
    throw new Error(
      `[tactical-ddd] guide '${options.guide}' does not exist. Omit --guide to have AGENTS.md generated, or point it at a file that is already there.`,
    );
  }

  generateFiles(
    tree,
    resolve(__dirname, 'files'),
    '.',
    { prefix: options.prefix ?? '' },
    { overwriteStrategy: OverwriteStrategy.KeepExisting },
  );

  return DEFAULT_GUIDE;
}

/**
 * Records choices that differ from the defaults in `nx.json`, so both a later
 * `nx g` and the version-upgrade migration repeat them. Without this a workspace
 * that synced to a custom directory would get a second copy under the default
 * one the next time the generator runs on its behalf.
 *
 * Only deviations are stored: a workspace on the defaults keeps a clean
 * `nx.json`, and switching back removes the entry.
 */
function rememberChoices(tree: Tree, directory: string, guide: string): void {
  const nxJson = readNxJson(tree);

  if (!nxJson) {
    return;
  }

  const generators = (nxJson.generators ??= {}) as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  const collection = (generators[COLLECTION] ??= {});
  const choices: Record<string, unknown> = { ...collection[GENERATOR] };

  setOrDelete(
    choices,
    'adrDirectory',
    directory,
    directory !== DEFAULT_ADR_DIRECTORY,
  );
  // A guide found by name needs no recording — auto-detection finds it again.
  setOrDelete(
    choices,
    'guide',
    guide,
    !GUIDE_CANDIDATES.includes(guide as (typeof GUIDE_CANDIDATES)[number]),
  );

  if (Object.keys(choices).length > 0) {
    collection[GENERATOR] = choices;
  } else {
    delete collection[GENERATOR];
  }

  updateNxJson(tree, nxJson as NxJsonConfiguration);
}

function setOrDelete(
  target: Record<string, unknown>,
  key: string,
  value: unknown,
  keep: boolean,
): void {
  if (keep) {
    target[key] = value;
  } else {
    delete target[key];
  }
}

/**
 * The choices a previous run recorded, for callers Nx does not inject defaults
 * into — notably the version-upgrade migration.
 */
export function readRecordedChoices(
  tree: Tree,
): Pick<AgentsContextSyncGeneratorSchema, 'adrDirectory' | 'guide'> {
  const recorded = readNxJson(tree)?.generators?.[COLLECTION] as
    | Record<string, Record<string, unknown>>
    | undefined;

  const choices = recorded?.[GENERATOR] ?? {};

  return {
    adrDirectory: choices.adrDirectory as string | undefined,
    guide: choices.guide as string | undefined,
  };
}

/**
 * Prepends the provenance header. The digest is what makes `check` mode survive
 * a workspace whose own formatter rewrites markdown: the body may be reflowed,
 * the header stays byte-identical, and it still identifies which source revision
 * the copy came from.
 */
function stampedRecord(body: string, file: string, version: string): string {
  return [
    `<!-- tactical-ddd:adr v${version} ${digest(body)} — generated, do not edit -->`,
    `<!-- source: @tactical-ddd/nx adr/${file} -->`,
    `<!-- refresh: nx g @tactical-ddd/nx:agents-context-sync -->`,
    '',
    body,
  ].join('\n');
}

function digest(body: string): string {
  return `sha256:${createHash('sha256').update(body).digest('hex').slice(0, 12)}`;
}

/** First line of a stamped copy, or `null` when the file is absent/unstamped. */
function readStamp(tree: Tree, path: string): string | null {
  const content = tree.read(path, 'utf-8');
  const first = content?.split('\n', 1)[0] ?? '';

  return first.startsWith('<!-- tactical-ddd:adr ') ? first : null;
}

function existingRecords(tree: Tree, directory: string): string[] {
  if (!tree.exists(directory)) {
    return [];
  }

  return tree
    .children(directory)
    .filter((child) => child.endsWith('.md'))
    .map((child) => join(directory, child));
}

/**
 * Fails with every difference at once, so a CI run reports the whole gap rather
 * than the first file that happens to be sorted first.
 */
function reportDrift(
  tree: Tree,
  expected: Map<string, string>,
  stale: string[],
  directory: string,
  options: AgentsContextSyncGeneratorSchema,
): void {
  const problems: string[] = [];
  const guide = resolveGuide(tree, options);

  if (!guide) {
    problems.push(
      `missing guide: ${options.guide ?? GUIDE_CANDIDATES.join(' or ')}`,
    );
  } else if (!(tree.read(guide, 'utf-8') ?? '').includes(POINTER_START)) {
    problems.push(`missing decision pointer: ${guide}`);
  }

  for (const [path, content] of expected) {
    const actual = readStamp(tree, path);

    if (actual === null) {
      problems.push(`missing or unstamped: ${path}`);
      continue;
    }

    const wanted = content.split('\n', 1)[0];

    if (actual !== wanted) {
      problems.push(`out of date: ${path}`);
    }
  }

  for (const path of stale) {
    problems.push(`no longer shipped: ${path}`);
  }

  if (problems.length > 0) {
    throw new Error(
      [
        `[tactical-ddd] ${directory} is out of sync with @tactical-ddd/nx:`,
        ...problems.map((problem) => `  - ${problem}`),
        'Run: nx g @tactical-ddd/nx:agents-context-sync',
      ].join('\n'),
    );
  }
}

/**
 * Writes the pointer block into the guide, between markers so a re-run replaces
 * it in place and never disturbs the rest of a file the workspace owns and
 * extends. Appended when the markers are absent — guides generated before this
 * generator existed have no place reserved for it.
 */
function writePointer(tree: Tree, guide: string, directory: string): void {
  const current = tree.read(guide, 'utf-8') ?? '';
  const block = pointerBlock(directory);

  const start = current.indexOf(POINTER_START);
  const end = current.indexOf(POINTER_END);

  if (start !== -1 && end > start) {
    tree.write(
      guide,
      current.slice(0, start) + block + current.slice(end + POINTER_END.length),
    );
    return;
  }

  tree.write(guide, `${current.trimEnd()}\n\n---\n\n${block}\n`);
}

/** The guide the workspace already has, or `null` when there is none yet. */
function resolveGuide(
  tree: Tree,
  options: AgentsContextSyncGeneratorSchema,
): string | null {
  if (options.guide) {
    return tree.exists(options.guide) ? options.guide : null;
  }

  return GUIDE_CANDIDATES.find((candidate) => tree.exists(candidate)) ?? null;
}

function pointerBlock(directory: string): string {
  return `${POINTER_START}
## Architecture decisions

The reasoning behind the rules above — the alternatives that were rejected, and
the signals that a rule has been broken — is recorded in
[\`${directory}\`](./${directory}/README.md).

Read the record that covers what you are about to change: what a layer may
import, what a facade exposes, where a shared module lives, or how boundaries are
enforced. Those files are generated from \`@tactical-ddd/nx\` and must not be
edited here; refresh them with \`nx g @tactical-ddd/nx:agents-context-sync\`.

Decisions specific to this product — which database is authoritative, how
sessions are secured, what the sync engine guarantees — belong in \`docs/adr/\`
without the \`TD-\` prefix, and may be revisited without touching the library.
${POINTER_END}`;
}

function resolveAdrSource(): string {
  for (const candidate of ADR_SOURCE_CANDIDATES) {
    const directory = resolve(__dirname, candidate);

    if (existsSync(directory)) {
      return directory;
    }
  }

  throw new Error(
    `[tactical-ddd] cannot locate the decision records shipped with this plugin (looked in ${ADR_SOURCE_CANDIDATES.join(', ')} relative to ${__dirname}).`,
  );
}

/** Read from the manifest next to the records, so both come from one package. */
function readPluginVersion(source: string): string {
  const manifest = resolve(source, '../package.json');

  return JSON.parse(readFileSync(manifest, 'utf-8')).version as string;
}

export default agentsContextSyncGenerator;
