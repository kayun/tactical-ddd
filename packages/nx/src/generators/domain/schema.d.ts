import type { Bundler } from '@nx/devkit';

export interface DomainGeneratorSchema {
  directory: string;
  name: string;
  layers: string[];
  prefix: string;
  preset?: 'none' | 'react' | 'react-native';
  linter: 'eslint' | 'none';
  unitTestRunner?: 'jest' | 'vitest' | 'none';
  bundler?: Bundler;
}
