import type { Bundler } from '@nx/devkit';

export interface InitGeneratorSchema {
  sharedDirectory: string;
  prefix: string;
  linter?: 'eslint' | 'none';
  unitTestRunner?: 'jest' | 'vitest' | 'none';
  bundler?: Bundler;
  preset?: 'none' | 'react';
}
