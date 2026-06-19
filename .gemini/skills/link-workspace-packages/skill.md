---
name: link-workspace-packages
description: 'Link workspace packages in monorepos (npm, yarn, pnpm, bun). USE WHEN: (1) you just created or generated new packages and need to wire up their dependencies, (2) user imports from a sibling package and needs to add it as a dependency, (3) you get resolution errors for workspace packages (@tactical-ddd/*) like "cannot find module", "failed to resolve import", "TS2307", or "cannot resolve". DO NOT patch around with tsconfig paths or manual package.json edits - use the package manager''s workspace commands to fix actual linking.'
---

# Link Workspace Packages

Add dependencies between packages in a monorepo. All package managers support workspaces but with different syntax.

## Detect Package Manager

Check whether there's a `packageManager` field in the root-level `package.json`.

Alternatively check lockfile in repo root:

- `pnpm-lock.yaml` → pnpm
- `yarn.lock` → yarn
- `bun.lock` / `bun.lockb` → bun
- `package-lock.json` → npm

## Workflow

1. Identify consumer package (the one importing)
2. Identify provider package(s) (being imported)
3. Add dependency using package manager's workspace syntax
4. Verify symlinks created in consumer's `node_modules/`

---

## pnpm

Uses `workspace:` protocol - symlinks only created when explicitly declared.

```bash
# From consumer directory
pnpm add @tactical-ddd/ui --workspace

# Or with --filter from anywhere
pnpm add @tactical-ddd/ui --filter @tactical-ddd/app --workspace
```

Result in `package.json`:

```json
{ "dependencies": { "@tactical-ddd/ui": "workspace:*" } }
```

---

## yarn (v2+/berry)

Also uses `workspace:` protocol.

```bash
yarn workspace @tactical-ddd/app add @tactical-ddd/ui
```

Result in `package.json`:

```json
{ "dependencies": { "@tactical-ddd/ui": "workspace:^" } }
```

---

## npm

No `workspace:` protocol. npm auto-symlinks workspace packages.

```bash
npm install @tactical-ddd/ui --workspace @tactical-ddd/app
```

Result in `package.json`:

```json
{ "dependencies": { "@tactical-ddd/ui": "*" } }
```

npm resolves to local workspace automatically during install.

---

## bun

Supports `workspace:` protocol (pnpm-compatible).

```bash
cd packages/app && bun add @tactical-ddd/ui
```

Result in `package.json`:

```json
{ "dependencies": { "@tactical-ddd/ui": "workspace:*" } }
```

---

## Examples

**Example 1: pnpm - link ui lib to app**

```bash
pnpm add @tactical-ddd/ui --filter @tactical-ddd/app --workspace
```

**Example 2: npm - link multiple packages**

```bash
npm install @tactical-ddd/data-access @tactical-ddd/ui --workspace @tactical-ddd/dashboard
```

**Example 3: Debug "Cannot find module"**

1. Check if dependency is declared in consumer's `package.json`
2. If not, add it using appropriate command above
3. Run install (`pnpm install`, `npm install`, etc.)

## Notes

- Symlinks appear in `<consumer>/node_modules/@tactical-ddd/<package>`
- **Hoisting differs by manager:**
  - npm/bun: hoist shared deps to root `node_modules`
  - pnpm: no hoisting (strict isolation, prevents phantom deps)
  - yarn berry: uses Plug'n'Play by default (no `node_modules`)
- Root `package.json` should have `"private": true` to prevent accidental publish
