import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import type { Tree } from '@nx/devkit';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

import { agentsContextSyncGenerator } from './agents-context-sync';

const ADR_SOURCE = resolve(__dirname, '../../../adr');
const TARGET = 'docs/adr/td';

/** Derived from the package, so adding a record does not break these tests. */
const shippedRecords = () =>
  readdirSync(ADR_SOURCE)
    .filter((file) => file.endsWith('.md'))
    .sort();

const pluginVersion = () =>
  JSON.parse(readFileSync(resolve(ADR_SOURCE, '../package.json'), 'utf-8'))
    .version;

let tree: Tree;

beforeEach(() => {
  tree = createTreeWithEmptyWorkspace();
});

describe('agentsContextSyncGenerator', () => {
  it('copies every shipped record into the workspace', async () => {
    await agentsContextSyncGenerator(tree);

    expect(tree.children(TARGET).sort()).toEqual(shippedRecords());
  });

  it('copies the index alongside the records', async () => {
    await agentsContextSyncGenerator(tree);

    expect(tree.exists(`${TARGET}/README.md`)).toBe(true);
  });

  it('stamps each copy with the plugin version and a source digest', async () => {
    await agentsContextSyncGenerator(tree);

    const [first] = shippedRecords();
    const header = tree.read(`${TARGET}/${first}`, 'utf-8')?.split('\n')[0];

    expect(header).toContain(`v${pluginVersion()}`);
    expect(header).toMatch(/sha256:[0-9a-f]{12}/);
    expect(header).toContain('do not edit');
  });

  it('keeps the record body byte-identical to the package source', async () => {
    await agentsContextSyncGenerator(tree);

    const [first] = shippedRecords();
    const body = readFileSync(resolve(ADR_SOURCE, first), 'utf-8');

    expect(tree.read(`${TARGET}/${first}`, 'utf-8')).toContain(body);
  });

  it('honours a custom target directory', async () => {
    await agentsContextSyncGenerator(tree, { adrDirectory: 'docs/decisions' });

    expect(tree.children('docs/decisions').length).toBe(
      shippedRecords().length,
    );
    expect(tree.exists(TARGET)).toBe(false);
  });

  it('is idempotent', async () => {
    await agentsContextSyncGenerator(tree);
    const first = tree.read('AGENTS.md', 'utf-8');

    await agentsContextSyncGenerator(tree);

    expect(tree.read('AGENTS.md', 'utf-8')).toBe(first);
  });

  describe('the guide', () => {
    it('is created when the workspace has none', async () => {
      await agentsContextSyncGenerator(tree);

      expect(tree.read('AGENTS.md', 'utf-8')).toContain(
        '# Architecture Guide for AI Agents',
      );
    });

    it('interpolates the organization prefix into its examples', async () => {
      await agentsContextSyncGenerator(tree, { prefix: '@my-org' });

      expect(tree.read('AGENTS.md', 'utf-8')).toContain('@my-org/auth-core');
    });

    it('uses unprefixed package names when no prefix is given', async () => {
      await agentsContextSyncGenerator(tree);

      const guide = tree.read('AGENTS.md', 'utf-8') ?? '';

      expect(guide).toContain('auth-core');
      expect(guide).not.toContain('@my-org/');
    });

    it('is never replaced once the workspace has customized it', async () => {
      tree.write('AGENTS.md', 'CUSTOM');

      await agentsContextSyncGenerator(tree);

      const guide = tree.read('AGENTS.md', 'utf-8') ?? '';

      expect(guide).toContain('CUSTOM');
      expect(guide).not.toContain('# Architecture Guide for AI Agents');
    });

    it('is not duplicated beside an existing CLAUDE.md', async () => {
      tree.write('CLAUDE.md', '# Guide\n');

      await agentsContextSyncGenerator(tree);

      expect(tree.exists('AGENTS.md')).toBe(false);
      expect(tree.read('CLAUDE.md', 'utf-8')).toContain(
        '## Architecture decisions',
      );
    });

    it('refuses a --guide that does not exist', async () => {
      await expect(
        agentsContextSyncGenerator(tree, { guide: 'docs/MISSING.md' }),
      ).rejects.toThrow("guide 'docs/MISSING.md' does not exist");
    });

    it('points an explicitly named guide at the records', async () => {
      tree.write('docs/AGENT_RULES.md', '# Rules\n');

      await agentsContextSyncGenerator(tree, { guide: 'docs/AGENT_RULES.md' });

      expect(tree.read('docs/AGENT_RULES.md', 'utf-8')).toContain(
        '## Architecture decisions',
      );
      expect(tree.exists('AGENTS.md')).toBe(false);
    });
  });

  it('removes a copy the plugin no longer ships', async () => {
    tree.write(`${TARGET}/TD-9999-withdrawn.md`, 'stale');

    await agentsContextSyncGenerator(tree);

    expect(tree.exists(`${TARGET}/TD-9999-withdrawn.md`)).toBe(false);
  });

  describe('the guide pointer', () => {
    it('appends a block to a guide that has no markers yet', async () => {
      tree.write('AGENTS.md', '# Guide\n\nProject rules.\n');

      await agentsContextSyncGenerator(tree);

      const guide = tree.read('AGENTS.md', 'utf-8') ?? '';

      expect(guide).toContain('## Architecture decisions');
      expect(guide).toContain(`./${TARGET}/README.md`);
      expect(guide).toContain('Project rules.');
    });

    it('replaces the block in place instead of appending a second one', async () => {
      await agentsContextSyncGenerator(tree);
      await agentsContextSyncGenerator(tree);

      const guide = tree.read('AGENTS.md', 'utf-8') ?? '';
      const occurrences = guide.split('## Architecture decisions').length - 1;

      expect(occurrences).toBe(1);
    });

    it('points at the custom directory when one is given', async () => {
      await agentsContextSyncGenerator(tree, {
        adrDirectory: 'docs/decisions',
      });

      expect(tree.read('AGENTS.md', 'utf-8')).toContain(
        './docs/decisions/README.md',
      );
    });

    it('lands in the guide the generator has just created', async () => {
      await agentsContextSyncGenerator(tree);

      expect(tree.read('AGENTS.md', 'utf-8')).toContain(
        '## Architecture decisions',
      );
    });
  });

  describe('check mode', () => {
    it('passes on a workspace that is in sync', async () => {
      await agentsContextSyncGenerator(tree);

      await expect(
        agentsContextSyncGenerator(tree, { check: true }),
      ).resolves.toBeUndefined();
    });

    it('fails when the records were never synced', async () => {
      await expect(
        agentsContextSyncGenerator(tree, { check: true }),
      ).rejects.toThrow('missing or unstamped');
    });

    it('fails when a copy came from another plugin version', async () => {
      await agentsContextSyncGenerator(tree);

      const [first] = shippedRecords();
      const path = `${TARGET}/${first}`;
      const stamped = tree.read(path, 'utf-8') ?? '';

      tree.write(
        path,
        stamped.replace(`v${pluginVersion()}`, 'v0.0.1-ancient'),
      );

      await expect(
        agentsContextSyncGenerator(tree, { check: true }),
      ).rejects.toThrow('out of date');
    });

    it('fails when a record the plugin dropped is still present', async () => {
      await agentsContextSyncGenerator(tree);
      tree.write(`${TARGET}/TD-9999-withdrawn.md`, 'stale');

      await expect(
        agentsContextSyncGenerator(tree, { check: true }),
      ).rejects.toThrow('no longer shipped');
    });

    it('fails when the workspace has no guide', async () => {
      await expect(
        agentsContextSyncGenerator(tree, { check: true }),
      ).rejects.toThrow('missing guide');
    });

    it('fails when someone removed the pointer from the guide', async () => {
      await agentsContextSyncGenerator(tree);
      tree.write('AGENTS.md', '# Guide without a pointer\n');

      await expect(
        agentsContextSyncGenerator(tree, { check: true }),
      ).rejects.toThrow('missing decision pointer');
    });

    it('changes nothing while reporting', async () => {
      await expect(
        agentsContextSyncGenerator(tree, { check: true }),
      ).rejects.toThrow();

      expect(tree.exists(TARGET)).toBe(false);
      expect(tree.exists('AGENTS.md')).toBe(false);
    });
  });
});
