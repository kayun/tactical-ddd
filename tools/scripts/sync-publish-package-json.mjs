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
  // Nx/Angular DevKit collection entry points. Without these the published
  // package exposes no generators/executors to consumers.
  'generators',
  'executors',
  'schematics',
  'builders',
  'dependencies',
  'peerDependencies',
  'peerDependenciesMeta',
  'optionalDependencies',
];

// The build (`@nx/js:swc` with `stripLeadingPaths: true`) drops the leading
// `src/` segment from every emitted path: `src/generators/x` -> `generators/x`.
// Collection manifests (generators.json / executors.json) are copied verbatim,
// so their `factory`/`schema`/`implementation` paths still point at `./src/...`
// and resolve to nothing in the published package. Apply the same strip here.
function stripSrc(relPath) {
  if (typeof relPath !== 'string') return relPath;
  return relPath.replace(/^(\.\/)?src\//, './');
}

// Rewrite a single collection manifest (e.g. generators.json) from the source
// layout into the built layout and write it next to the publish package.json.
function syncManifest(projectRoot, outputDir, manifestRef) {
  // Manifests are referenced relative to the package root (e.g. "./generators.json").
  const sourcePath = resolve(projectRoot, manifestRef);
  if (!existsSync(sourcePath)) {
    throw new Error(
      `Manifest "${manifestRef}" referenced in package.json not found at ${sourcePath}`,
    );
  }

  const manifest = JSON.parse(readFileSync(sourcePath, 'utf8'));

  for (const collection of ['generators', 'schematics', 'executors', 'builders']) {
    const entries = manifest[collection];
    if (!entries) continue;
    for (const entry of Object.values(entries)) {
      entry.factory &&= stripSrc(entry.factory);
      entry.schema &&= stripSrc(entry.schema);
      entry.implementation &&= stripSrc(entry.implementation);
    }
  }

  const outputPath = join(outputDir, manifestRef);
  writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Synced collection manifest -> ${outputPath}`);
}

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

  // Rewrite each referenced collection manifest into the built layout.
  for (const field of ['generators', 'schematics', 'executors', 'builders']) {
    if (typeof publishPkg[field] === 'string') {
      syncManifest(projectRoot, outputDir, publishPkg[field]);
    }
  }
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
