import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { readNxJson, updateNxJson, type Tree } from '@nx/devkit';

import syncAgentsContext from './sync-agents-context';
import agentsContextSyncGenerator from '../../generators/agents-context-sync/agents-context-sync';

const TARGET = 'docs/adr/td';

let tree: Tree;

beforeEach(() => {
  tree = createTreeWithEmptyWorkspace();
});

describe('0-2-0-sync-agents-context', () => {
  describe('a workspace that already has an agent context', () => {
    beforeEach(async () => {
      await agentsContextSyncGenerator(tree);
    });

    it('replaces a record left over from an older plugin version', async () => {
      const [first] = tree.children(TARGET);
      const stale = (tree.read(`${TARGET}/${first}`, 'utf-8') ?? '').replace(
        /v[\d.]+(-\w+)? sha256:[0-9a-f]+/,
        'v0.0.1 sha256:000000000000',
      );
      tree.write(`${TARGET}/${first}`, stale);

      await syncAgentsContext(tree);

      expect(tree.read(`${TARGET}/${first}`, 'utf-8')).not.toContain(
        'sha256:000000000000',
      );
    });

    it('restores a pointer someone removed from the guide', async () => {
      tree.write('AGENTS.md', '# Guide\n\nNo pointer here.\n');

      await syncAgentsContext(tree);

      const guide = tree.read('AGENTS.md', 'utf-8') ?? '';

      expect(guide).toContain('## Architecture decisions');
      expect(guide).toContain('No pointer here.');
    });

    it('drops a record the plugin no longer ships', async () => {
      tree.write(`${TARGET}/TD-9999-withdrawn.md`, 'stale');

      await syncAgentsContext(tree);

      expect(tree.exists(`${TARGET}/TD-9999-withdrawn.md`)).toBe(false);
    });
  });

  describe('a workspace with a custom target directory', () => {
    beforeEach(async () => {
      await agentsContextSyncGenerator(tree, {
        adrDirectory: 'docs/decisions',
      });
    });

    it('records the choice so it can be repeated', () => {
      expect(readNxJson(tree)?.generators).toMatchObject({
        '@tactical-ddd/nx': {
          'agents-context-sync': { adrDirectory: 'docs/decisions' },
        },
      });
    });

    it('refreshes that directory instead of creating the default one', async () => {
      await syncAgentsContext(tree);

      expect(tree.exists(TARGET)).toBe(false);
      expect(tree.children('docs/decisions').length).toBeGreaterThan(1);
    });
  });

  describe('a workspace with no agent context', () => {
    it('is left untouched', async () => {
      await syncAgentsContext(tree);

      expect(tree.exists(TARGET)).toBe(false);
      expect(tree.exists('AGENTS.md')).toBe(false);
    });

    it('is still recognized by a recorded custom guide', async () => {
      tree.write('docs/AGENT_RULES.md', '# Rules\n');
      const nxJson = readNxJson(tree) ?? {};
      nxJson.generators = {
        '@tactical-ddd/nx': {
          'agents-context-sync': { guide: 'docs/AGENT_RULES.md' },
        },
      };
      updateNxJson(tree, nxJson);

      await syncAgentsContext(tree);

      expect(tree.read('docs/AGENT_RULES.md', 'utf-8')).toContain(
        '## Architecture decisions',
      );
      expect(tree.exists('AGENTS.md')).toBe(false);
    });
  });
});
