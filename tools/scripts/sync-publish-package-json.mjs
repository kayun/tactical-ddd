// Builds a minimal, publish-ready package.json inside a library's build output.
//
// Why: the build outputs to the repo root `dist/packages/<lib>`, but the
// `@nx/js:swc` executor does not emit a package.json there in the Nx "TS
// solution" workspace setup. The source package.json also carries workspace-only
// fields (`nx`, dev `exports` conditions, etc.) that should not be published.
// This script copies only the publish-relevant fields into the output dir so the
// folder can be published to npm as-is.
//
// Usage:
//   node tools/scripts/sync-publish-package-json.mjs <projectRoot> [outputDir]
//     projectRoot  e.g. packages/nx        (where the source package.json lives)
//     outputDir    e.g. dist/packages/nx   (defaults to dist/<projectRoot>)
//
//   node tools/scripts/sync-publish-package-json.mjs
//     With no args: syncs every packages/* project that has a built output.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Fields that are meaningful to npm consumers. Everything else (nx config,
// scripts, devDependencies, private, …) is intentionally dropped.
const PUBLISH_FIELDS = [
  'name',
  'version',
  'description',
  'keywords',
  'license',
  'author',
  'contributors',
  'funding',
  'homepage',
  'repository',
  'bugs',
  'type',
  'main',
  'module',
  'types',
  'typings',
  'exports',
  'bin',
  'man',
  'files',
  'sideEffects',
  'engines',
  'os',
  'cpu',
  'publishConfig',
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
];

function syncOne(projectRoot, outputDir) {
  const sourcePath = resolve(projectRoot, 'package.json');
  if (!existsSync(sourcePath)) {
    throw new Error(`No package.json found at ${sourcePath}`);
  }
  if (!existsSync(outputDir)) {
    throw new Error(
      `Output dir "${outputDir}" does not exist — build the project first.`,
    );
  }

  const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
  const publishPkg = {};
  for (const field of PUBLISH_FIELDS) {
    if (source[field] !== undefined) {
      publishPkg[field] = source[field];
    }
  }

  const outputPath = join(outputDir, 'package.json');
  writeFileSync(outputPath, JSON.stringify(publishPkg, null, 2) + '\n');
  console.log(`Synced publish package.json -> ${outputPath}`);
}

const [, , projectRootArg, outputDirArg] = process.argv;

if (projectRootArg) {
  syncOne(projectRootArg, outputDirArg ?? join('dist', projectRootArg));
} else {
  // Auto-discover: sync every built library under packages/*.
  const packagesDir = 'packages';
  for (const name of readdirSync(packagesDir)) {
    const projectRoot = join(packagesDir, name);
    const outputDir = join('dist', packagesDir, name);
    if (
      existsSync(join(projectRoot, 'package.json')) &&
      existsSync(outputDir)
    ) {
      syncOne(projectRoot, outputDir);
    }
  }
}
