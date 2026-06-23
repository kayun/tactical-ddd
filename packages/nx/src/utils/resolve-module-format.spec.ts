import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { type Tree, writeJson } from '@nx/devkit';

import { resolveLibraryModuleFormat } from './resolve-module-format';
import { ModuleFormat } from '../types';

describe('resolveLibraryModuleFormat', () => {
  let tree: Tree;
  const root = 'libs/shared/contracts';

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  describe('1. package.json "type" (most direct signal)', () => {
    it.each([
      ['module', ModuleFormat.EsModule],
      ['commonjs', ModuleFormat.CommonJs],
    ] as const)('maps "type": "%s" to %s', (type, expected) => {
      writeJson(tree, `${root}/package.json`, { name: 'lib', type });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(expected);
    });

    it('wins over a conflicting tsconfig module option', () => {
      writeJson(tree, `${root}/package.json`, { name: 'lib', type: 'module' });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        compilerOptions: { module: 'commonjs' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.EsModule,
      );
    });

    it('falls through when "type" is absent', () => {
      writeJson(tree, `${root}/package.json`, { name: 'lib' });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        compilerOptions: { module: 'commonjs' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.CommonJs,
      );
    });

    it('falls through on an unrecognized "type" value', () => {
      writeJson(tree, `${root}/package.json`, { name: 'lib', type: 'weird' });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        compilerOptions: { module: 'esnext' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.EsModule,
      );
    });
  });

  describe('2. tsconfig.lib.json "module"', () => {
    it.each([
      ['commonjs', ModuleFormat.CommonJs],
      ['esnext', ModuleFormat.EsModule],
      ['nodenext', ModuleFormat.EsModule],
      ['node16', ModuleFormat.EsModule],
      ['node18', ModuleFormat.EsModule],
      ['es2015', ModuleFormat.EsModule],
      ['es2022', ModuleFormat.EsModule],
      ['preserve', ModuleFormat.EsModule],
      ['umd', ModuleFormat.CommonJs],
      ['amd', ModuleFormat.CommonJs],
      ['system', ModuleFormat.CommonJs],
    ] as const)('maps module "%s" to %s', (module, expected) => {
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        compilerOptions: { module },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(expected);
    });

    it.each([
      ['NodeNext', ModuleFormat.EsModule],
      ['ESNext', ModuleFormat.EsModule],
      ['CommonJS', ModuleFormat.CommonJs],
    ] as const)('is case-insensitive for module "%s"', (module, expected) => {
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        compilerOptions: { module },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(expected);
    });

    it('ignores a non-string module option and falls back to extends', () => {
      writeJson(tree, 'tsconfig.base.json', {
        compilerOptions: { module: 'commonjs' },
      });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        extends: '../../../tsconfig.base.json',
        compilerOptions: { module: null },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.CommonJs,
      );
    });

    it('honors the last entry of an array of extends', () => {
      writeJson(tree, 'tsconfig.cjs.json', {
        compilerOptions: { module: 'commonjs' },
      });
      writeJson(tree, 'tsconfig.esm.json', {
        compilerOptions: { module: 'esnext' },
      });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        extends: ['../../../tsconfig.cjs.json', '../../../tsconfig.esm.json'],
        compilerOptions: { rootDir: 'src' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.EsModule,
      );
    });

    it('does not hang on a circular extends chain', () => {
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        extends: './tsconfig.other.json',
        compilerOptions: { rootDir: 'src' },
      });
      writeJson(tree, `${root}/tsconfig.other.json`, {
        extends: './tsconfig.lib.json',
        compilerOptions: { outDir: 'dist' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(ModuleFormat.Unknown);
    });

    it('follows the extends chain to an inherited module option', () => {
      writeJson(tree, 'tsconfig.base.json', {
        compilerOptions: { module: 'nodenext' },
      });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        extends: '../../../tsconfig.base.json',
        compilerOptions: { rootDir: 'src' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.EsModule,
      );
    });

    it('prefers a local module option over the inherited one', () => {
      writeJson(tree, 'tsconfig.base.json', {
        compilerOptions: { module: 'nodenext' },
      });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        extends: '../../../tsconfig.base.json',
        compilerOptions: { module: 'commonjs' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.CommonJs,
      );
    });
  });

  describe('3. build target executor', () => {
    it.each([
      ['esm', ModuleFormat.EsModule],
      ['cjs', ModuleFormat.CommonJs],
    ] as const)(
      'reads format "%s" from a project.json build target',
      (format, expected) => {
        writeJson(tree, `${root}/project.json`, {
          name: 'lib',
          targets: {
            build: {
              executor: '@nx/esbuild:esbuild',
              options: { format: [format] },
            },
          },
        });

        expect(resolveLibraryModuleFormat(tree, root)).toBe(expected);
      },
    );

    it('reads the build target from package.json nx.targets', () => {
      writeJson(tree, `${root}/package.json`, {
        name: 'lib',
        nx: { targets: { build: { options: { format: ['esm'] } } } },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.EsModule,
      );
    });

    it('accepts a single format string, not just an array', () => {
      writeJson(tree, `${root}/project.json`, {
        name: 'lib',
        targets: { build: { options: { format: 'cjs' } } },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.CommonJs,
      );
    });

    it('prefers esm when a target emits both esm and cjs', () => {
      writeJson(tree, `${root}/project.json`, {
        name: 'lib',
        targets: { build: { options: { format: ['cjs', 'esm'] } } },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.EsModule,
      );
    });

    it('falls through when the build target carries no format', () => {
      writeJson(tree, `${root}/project.json`, {
        name: 'lib',
        targets: { build: { executor: '@nx/js:tsc', options: {} } },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(ModuleFormat.Unknown);
    });
  });

  describe('priority across signals', () => {
    it('resolves a real generated library to ESM at step 1', () => {
      // Mirrors what `@nx/js` emits: package.json "type": "module" plus a
      // tsconfig.lib.json that inherits `module: nodenext` from the base.
      writeJson(tree, 'tsconfig.base.json', {
        compilerOptions: { module: 'nodenext' },
      });
      writeJson(tree, `${root}/package.json`, { name: 'lib', type: 'module' });
      writeJson(tree, `${root}/tsconfig.lib.json`, {
        extends: '../../../tsconfig.base.json',
        compilerOptions: { rootDir: 'src' },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.EsModule,
      );
    });

    it('uses the build target only when package.json and tsconfig are silent', () => {
      writeJson(tree, `${root}/package.json`, { name: 'lib' });
      writeJson(tree, `${root}/project.json`, {
        name: 'lib',
        targets: { build: { options: { format: ['cjs'] } } },
      });

      expect(resolveLibraryModuleFormat(tree, root)).toBe(
        ModuleFormat.CommonJs,
      );
    });
  });

  it('returns Unknown when no signal is present', () => {
    expect(resolveLibraryModuleFormat(tree, root)).toBe(ModuleFormat.Unknown);
  });
});
