const nxPreset = require('@nx/jest/preset').default;

// Coverage reporters live here rather than on the CI command line: the Vue
// package runs on Vitest, whose CLI rejects Jest's `--coverageReporters`, so a
// single `nx run-many -t test --coverage` has to get its reporters from config.
// `lcov` is what Codecov consumes; `text-summary` is the log line.
module.exports = {
  ...nxPreset,
  coverageReporters: ['lcov', 'text-summary'],
};
