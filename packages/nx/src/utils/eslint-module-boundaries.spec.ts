import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, readJson, writeJson } from '@nx/devkit';

import {
  applyDepConstraints,
  MODULE_BOUNDARIES_RULE,
  type DepConstraint,
} from './eslint-module-boundaries';

const SHARED: DepConstraint = {
  sourceTag: 'scope:shared',
  onlyDependOnLibsWithTags: ['scope:shared'],
};
const DOMAIN: DepConstraint = {
  sourceTag: 'scope:domain',
  onlyDependOnLibsWithTags: ['scope:domain', 'scope:shared'],
};

describe('applyDepConstraints', () => {
  let tree: Tree;
  const originalFlatConfig = process.env.ESLINT_USE_FLAT_CONFIG;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  afterEach(() => {
    // `@nx/eslint`'s utils pick the flat vs legacy code path from this env var;
    // each suite pins it, so restore it between tests.
    if (originalFlatConfig === undefined) {
      delete process.env.ESLINT_USE_FLAT_CONFIG;
    } else {
      process.env.ESLINT_USE_FLAT_CONFIG = originalFlatConfig;
    }
  });

  // Reads the boundary rule's options object from a legacy `.eslintrc.json`.
  const readRuleOptions = (): Record<string, unknown> => {
    const overrides = readJson(tree, '.eslintrc.json').overrides as Array<{
      rules?: Record<string, unknown>;
    }>;
    const override = overrides.find((o) => o.rules?.[MODULE_BOUNDARIES_RULE]);
    return (
      override?.rules?.[MODULE_BOUNDARIES_RULE] as [string, object]
    )[1] as Record<string, unknown>;
  };
  const readConstraints = (): DepConstraint[] =>
    readRuleOptions().depConstraints as DepConstraint[];

  const seedLegacyConfig = (rule: unknown) =>
    writeJson(tree, '.eslintrc.json', {
      root: true,
      overrides: [
        { files: ['*.ts'], rules: { [MODULE_BOUNDARIES_RULE]: rule } },
      ],
    });

  describe('when no ESLint config is present', () => {
    it('returns false and warns rather than throwing', () => {
      const warn = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);

      expect(applyDepConstraints(tree, [SHARED])).toBe(false);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('No supported ESLint config'),
      );

      warn.mockRestore();
    });
  });

  // Pin the legacy (`.eslintrc.json`) code path so the rule can be read back as
  // JSON and asserted on exactly, independent of the host ESLint version.
  describe('legacy .eslintrc.json — existing empty rule', () => {
    beforeEach(() => {
      process.env.ESLINT_USE_FLAT_CONFIG = 'false';
      seedLegacyConfig([
        'error',
        { enforceBuildableLibDependency: true, depConstraints: [] },
      ]);
    });

    it('returns true and populates the empty depConstraints', () => {
      expect(applyDepConstraints(tree, [SHARED, DOMAIN])).toBe(true);
      expect(readConstraints()).toEqual([SHARED, DOMAIN]);
    });

    it('preserves the existing rule options', () => {
      applyDepConstraints(tree, [SHARED]);

      expect(readRuleOptions().enforceBuildableLibDependency).toBe(true);
    });

    it('merges by sourceTag — replacing a same-tag constraint, appending new ones', () => {
      applyDepConstraints(tree, [SHARED]);

      const sharedUpdated: DepConstraint = {
        sourceTag: 'scope:shared',
        onlyDependOnLibsWithTags: ['scope:shared', 'type:contracts'],
      };
      applyDepConstraints(tree, [sharedUpdated, DOMAIN]);

      const constraints = readConstraints();
      expect(constraints).toContainEqual(sharedUpdated);
      expect(constraints).toContainEqual(DOMAIN);
      // The same sourceTag is replaced in place, never duplicated.
      expect(
        constraints.filter((c) => c.sourceTag === 'scope:shared'),
      ).toHaveLength(1);
    });

    it('is idempotent — re-applying the same constraints does not duplicate', () => {
      applyDepConstraints(tree, [SHARED, DOMAIN]);
      applyDepConstraints(tree, [SHARED, DOMAIN]);

      expect(readConstraints()).toEqual([SHARED, DOMAIN]);
    });
  });

  describe('legacy .eslintrc.json — rule stored as a bare severity string', () => {
    beforeEach(() => {
      process.env.ESLINT_USE_FLAT_CONFIG = 'false';
      seedLegacyConfig('error');
    });

    it('rebuilds the rule with baseline options instead of dropping them', () => {
      applyDepConstraints(tree, [SHARED]);

      const options = readRuleOptions();
      expect(options.enforceBuildableLibDependency).toBe(true);
      expect(options.allow).toBeDefined();
      expect(options.depConstraints).toEqual([SHARED]);
    });
  });

  describe('flat config without a boundary rule yet', () => {
    beforeEach(() => {
      process.env.ESLINT_USE_FLAT_CONFIG = 'true';
    });

    it('appends an override carrying the rule, baseline options and constraints', () => {
      tree.write('eslint.config.mjs', 'export default [];\n');

      expect(applyDepConstraints(tree, [SHARED])).toBe(true);

      const config = tree.read('eslint.config.mjs', 'utf-8') ?? '';
      expect(config).toContain(MODULE_BOUNDARIES_RULE);
      expect(config).toContain('onlyDependOnLibsWithTags');
      expect(config).toContain('enforceBuildableLibDependency');
      expect(config).toContain('scope:shared');
    });
  });
});
