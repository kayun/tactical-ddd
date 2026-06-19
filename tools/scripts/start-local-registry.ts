/**
 * This script starts a local registry for e2e testing purposes.
 * It is meant to be called in jest's globalSetup.
 */

// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="registry.d.ts" />

import { startLocalRegistry } from '@nx/js/plugins/jest/local-registry';
import { releasePublish, releaseVersion } from 'nx/release';
import { rmSync } from 'fs';

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
};
