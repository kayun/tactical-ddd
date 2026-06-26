import { type Bundler } from '@nx/devkit';

export interface SharedKernelGeneratorSchema {
  directory: string;
  prefix: string;
  linter?: 'eslint' | 'none';
  unitTestRunner?: 'jest' | 'vitest' | 'none';
  bundler?: Bundler;
}
