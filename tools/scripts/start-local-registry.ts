/**
 * This script starts a local registry for e2e testing purposes.
 * It is meant to be called in jest's globalSetup.
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="registry.d.ts" />

import { startLocalRegistry } from '@nx/js/plugins/jest/local-registry';
import { releasePublish, releaseVersion } from 'nx/release';
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

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

export default async () => {
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
  try {
    await releaseVersion({
      specifier: '0.0.0-e2e',
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
  }
};
