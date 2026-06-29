import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { Tree, updateJson } from '@nx/devkit';

import {
  REACT_VERSION,
  reactRuntimeDependencies,
  workspaceHasReactRuntime,
} from './react-runtime';

describe('react-runtime', () => {
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

  describe('workspaceHasReactRuntime', () => {
    it('is false when neither react nor react-dom is declared', () => {
      expect(workspaceHasReactRuntime(tree)).toBe(false);
    });

    it('is true when react is a dependency', () => {
      seed({ react: '19.0.0' });
      expect(workspaceHasReactRuntime(tree)).toBe(true);
    });

    it('is true when react-dom is a dependency', () => {
      seed({ 'react-dom': '^19.0.0' });
      expect(workspaceHasReactRuntime(tree)).toBe(true);
    });

    it('is true when react is only a devDependency', () => {
      seed({}, { react: '19.0.0' });
      expect(workspaceHasReactRuntime(tree)).toBe(true);
    });
  });

  describe('reactRuntimeDependencies', () => {
    it('adds both halves at the same specifier when the workspace has neither', () => {
      expect(reactRuntimeDependencies(tree)).toEqual({
        react: REACT_VERSION,
        'react-dom': REACT_VERSION,
      });
    });

    it('adds nothing when react is already present — never a skewed react-dom', () => {
      // The exact ERESOLVE scenario: react pinned, react-dom absent.
      seed({ react: '19.2.3' });
      expect(reactRuntimeDependencies(tree)).toEqual({});
    });

    it('adds nothing when react-dom is already present', () => {
      seed({ 'react-dom': '^19.0.0' });
      expect(reactRuntimeDependencies(tree)).toEqual({});
    });
  });
});
