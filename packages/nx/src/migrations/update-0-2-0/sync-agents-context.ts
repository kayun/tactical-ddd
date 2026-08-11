import { formatFiles, logger, type Tree } from '@nx/devkit';

import agentsContextSyncGenerator, {
  readRecordedChoices,
} from '../../generators/agents-context-sync/agents-context-sync';

const GUIDE_CANDIDATES = ['AGENTS.md', 'CLAUDE.md'] as const;
const DEFAULT_ADR_DIRECTORY = 'docs/adr/td';

/**
 * Brings the workspace's agent context up to date with the installed plugin.
 *
 * This is the whole reason the decision records are copies rather than links: a
 * copy can go stale, so the upgrade path has to be part of the upgrade. Running
 * it from `nx migrate` means refreshing them is not a ritual anyone has to
 * remember.
 *
 * Only workspaces that already have an agent context are touched. A migration
 * refreshes what you have; it does not opt you into artifacts you never
 * generated — a workspace that used the domain generator without `init`, or that
 * deliberately removed the guide, is left alone.
 */
export default async function syncAgentsContext(tree: Tree): Promise<void> {
  const recorded = readRecordedChoices(tree);
  const directory = recorded.adrDirectory ?? DEFAULT_ADR_DIRECTORY;

  const hasGuide = [...GUIDE_CANDIDATES, recorded.guide].some(
    (candidate) => candidate && tree.exists(candidate),
  );

  if (!hasGuide && !tree.exists(directory)) {
    logger.info(
      '[tactical-ddd] no agent context in this workspace; skipped. Run "nx g @tactical-ddd/nx:agents-context-sync" to add it.',
    );
    return;
  }

  await agentsContextSyncGenerator(tree, recorded);

  await formatFiles(tree);
}
