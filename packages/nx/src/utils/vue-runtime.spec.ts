import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, updateJson } from '@nx/devkit';

import {
  VUE_VERSION,
  vueRuntimeDependencies,
  workspaceHasVueRuntime,
} from './vue-runtime';

describe('vue-runtime', () => {
  let tree: Tree;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  const seed = (
    dependencies: Record<string, string>,
    devDependencies?: Record<string, string>,
  ) =>
    updateJson(tree, 'package.json', (json) => {
      json.dependencies = { ...json.dependencies, ...dependencies };
      if (devDependencies) {
        json.devDependencies = { ...json.devDependencies, ...devDependencies };
      }
      return json;
    });

  describe('workspaceHasVueRuntime', () => {
    it('is false when vue is not declared', () => {
      expect(workspaceHasVueRuntime(tree)).toBe(false);
    });

    it('is true when vue is a dependency', () => {
      seed({ vue: '3.5.13' });
      expect(workspaceHasVueRuntime(tree)).toBe(true);
    });

    it('is true when vue is only a devDependency', () => {
      seed({}, { vue: '3.5.13' });
      expect(workspaceHasVueRuntime(tree)).toBe(true);
    });

    it('is not fooled by another package whose name starts with vue', () => {
      seed({ 'vue-router': '^4.5.0' });
      expect(workspaceHasVueRuntime(tree)).toBe(false);
    });
  });

  describe('vueRuntimeDependencies', () => {
    it('adds vue when the workspace does not manage it', () => {
      expect(vueRuntimeDependencies(tree)).toEqual({ vue: VUE_VERSION });
    });

    it('adds nothing when vue is already present — an existing pin stands', () => {
      seed({ vue: '3.4.0' });
      expect(vueRuntimeDependencies(tree)).toEqual({});
    });

    it('adds nothing when vue is present as a devDependency', () => {
      seed({}, { vue: '3.4.0' });
      expect(vueRuntimeDependencies(tree)).toEqual({});
    });
  });
});
