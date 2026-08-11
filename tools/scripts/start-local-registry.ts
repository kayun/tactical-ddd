/**
 * This script starts a local registry for e2e testing purposes.
 * It is meant to be called in jest's globalSetup.
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="registry.d.ts" />

import { startLocalRegistry } from '@nx/js/plugins/jest/local-registry';
import { releasePublish, releaseVersion } from 'nx/release';
import { execSync } from 'child_process';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

/** Port the local verdaccio registry listens on (Nx default). */
const REGISTRY_PORT = 4873;

/**
 * Frees the local registry port if an orphaned verdaccio is still holding it.
 *
 * A previous e2e run that was killed from the IDE (so jest's globalTeardown
 * never ran) leaves verdaccio listening on {@link REGISTRY_PORT}. The next run
 * then can't bind the port and hangs until the jest timeout. Reclaim it up
 * front so the run starts cleanly. No-op when the port is free.
 */
function freeRegistryPort(): void {
  let pids: string;
  try {
    pids = execSync(`lsof -nP -iTCP:${REGISTRY_PORT} -sTCP:LISTEN -t`, {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    // lsof exits non-zero when nothing is listening — the happy path.
    return;
  }

  if (!pids) return;

  console.warn(
    `Local registry port ${REGISTRY_PORT} is busy (orphaned verdaccio from a previous run?). Killing PID(s): ${pids.replace(/\n/g, ', ')}`,
  );
  for (const pid of pids.split('\n')) {
    try {
      process.kill(Number(pid));
    } catch {
      // Process already gone — ignore.
    }
  }
}

/**
 * Captures the current contents of every packages/&#42;/package.json so they can
 * be restored after the e2e release. `releaseVersion` writes the e2e specifier
 * (0.0.0-e2e) into the source manifests (via `manifestRootsToUpdate`), which we
 * do not want left behind in the committed sources — only the published
 * artifacts under dist should carry the e2e version.
 */
function snapshotPackageManifests(): Map<string, string> {
  const packagesDir = join(process.cwd(), 'packages');
  const snapshots = new Map<string, string>();
  for (const name of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, name, 'package.json');
    if (existsSync(manifestPath)) {
      snapshots.set(manifestPath, readFileSync(manifestPath, 'utf-8'));
    }
  }
  return snapshots;
}

function restorePackageManifests(snapshots: Map<string, string>): void {
  snapshots.forEach((content, manifestPath) => {
    writeFileSync(manifestPath, content);
  });
}

/** Version every package in this workspace is released under for an e2e run. */
const E2E_VERSION = '0.0.0-e2e';

/** Manifest sections that may reference another package from this workspace. */
const DEPENDENCY_TYPES = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
] as const;

/**
 * Points every cross-package `@tactical-ddd/*` reference at {@link E2E_VERSION}
 * before versioning runs.
 *
 * Nx's `preserveMatchingDependencyRanges` (on by default since v23) refuses to
 * version a package whose dependents declare a *range* the new version falls
 * outside of — and no `^0.1.x` range can ever contain `0.0.0-e2e`, so the e2e
 * release aborts as soon as one package declares another as a peer. An exact
 * version is not a range (`semver.valid` matches it, so Nx's `isValidRange`
 * returns false), which both takes the check out of the picture and leaves the
 * published peers pointing at the e2e build that is actually in the local
 * registry rather than a version published nowhere.
 *
 * Called after {@link snapshotPackageManifests}, so the restore in the `finally`
 * block below puts the real ranges back and nothing leaks into the sources.
 */
function pointLocalDependenciesAtE2eVersion(): void {
  const packagesDir = join(process.cwd(), 'packages');

  for (const name of readdirSync(packagesDir)) {
    const manifestPath = join(packagesDir, name, 'package.json');
    if (!existsSync(manifestPath)) {
      continue;
    }

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    let rewritten = false;

    for (const depType of DEPENDENCY_TYPES) {
      const deps = manifest[depType] as Record<string, string> | undefined;
      if (!deps) {
        continue;
      }

      for (const dep of Object.keys(deps)) {
        if (dep.startsWith('@tactical-ddd/') && deps[dep] !== E2E_VERSION) {
          deps[dep] = E2E_VERSION;
          rewritten = true;
        }
      }
    }

    if (rewritten) {
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    }
  }
}

const NPMRC_PATH = join(process.cwd(), '.npmrc');

/**
 * Pins the `@tactical-ddd` scope to the local registry for the duration of the
 * e2e publish and returns the original `.npmrc` content (or `null` if there was
 * none) so it can be restored afterwards.
 *
 * The committed `.npmrc` points `@tactical-ddd:registry` at the public npm
 * registry for real releases; that scoped override beats the default registry
 * set by `startLocalRegistry`, so without this the e2e publish would push to
 * npmjs.org instead of the local verdaccio.
 */
function overrideScopedRegistry(registry: string): string | null {
  const original = existsSync(NPMRC_PATH)
    ? readFileSync(NPMRC_PATH, 'utf-8')
    : null;

  const lines = (original ?? '')
    .split('\n')
    .filter((line) => !/^\s*@tactical-ddd:registry=/.test(line));
  lines.push(`@tactical-ddd:registry=${registry}`);

  writeFileSync(NPMRC_PATH, lines.join('\n'));
  return original;
}

function restoreNpmrc(original: string | null): void {
  if (original === null) {
    rmSync(NPMRC_PATH, { force: true });
  } else {
    writeFileSync(NPMRC_PATH, original);
  }
}

export default async () => {
  // Reclaim the port from an orphaned registry (e.g. an IDE-killed run) so we
  // don't hang waiting to bind it.
  freeRegistryPort();

  // local registry target to run
  const localRegistryTarget = '@tactical-ddd/source:local-registry';
  // storage folder for the local registry
  const registryDir = './tmp/local-registry';

  global.stopLocalRegistry = await (async () => {
    const destroy = await startLocalRegistry({
      localRegistryTarget,
      storage: `${registryDir}/storage`,
      verbose: false,
      clearStorage: true,
    });

    return () => {
      destroy();
      rmSync(registryDir, {
        recursive: true,
        force: true,
      });
    };
  })();

  // The e2e version bump must not be persisted to the source manifests, so we
  // snapshot them and restore them once publishing is done. The package is
  // published from dist, which keeps the e2e version.
  const manifestSnapshots = snapshotPackageManifests();
  // Peers/deps between our own packages are declared as `^0.1.x` ranges, which
  // the e2e version can never satisfy — rewrite them before versioning.
  pointLocalDependenciesAtE2eVersion();
  // Redirect the scoped registry to the local one for the publish (see above).
  const localRegistry =
    process.env.npm_config_registry ?? `http://localhost:${REGISTRY_PORT}`;
  const originalNpmrc = overrideScopedRegistry(localRegistry);
  try {
    await releaseVersion({
      specifier: E2E_VERSION,
      stageChanges: false,
      gitCommit: false,
      gitTag: false,
      firstRelease: true,
      versionActionsOptionsOverrides: {
        skipLockFileUpdate: true,
      },
    });
    await releasePublish({
      tag: 'e2e',
      firstRelease: true,
    });
  } finally {
    restorePackageManifests(manifestSnapshots);
    restoreNpmrc(originalNpmrc);
  }
};
