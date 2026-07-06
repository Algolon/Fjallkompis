#!/usr/bin/env node
/**
 * Deterministic guard against version drift. Fails (exit 1) unless:
 *
 *  1. package.json "version" is a valid semantic version;
 *  2. package-lock.json root "version" matches package.json;
 *  3. package-lock.json packages[""].version matches package.json;
 *  4. src/constants.ts contains no separately maintained semver literal
 *     (the app version must come from the injected __APP_VERSION__ global);
 *  5. vite.config.ts injects __APP_VERSION__ from the package.json read
 *     (pkg.version), not from a hard-coded literal.
 *
 * Runs via `npm run check:version` and as part of the test and production
 * build gates, so a mismatch fails CI before anything ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

// SemVer 2.0.0 core + optional pre-release/build metadata (no dependency
// needed for this).
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));

// 1. package.json has a valid semantic version.
check(
  typeof pkg.version === 'string' && SEMVER_RE.test(pkg.version),
  `package.json version "${pkg.version}" is not a valid semantic version`,
);

// 2. package-lock.json root version matches.
check(
  lock.version === pkg.version,
  `package-lock.json root version "${lock.version}" ≠ package.json "${pkg.version}" — run: npm version ${pkg.version} --no-git-tag-version --allow-same-version`,
);

// 3. package-lock.json packages[""].version matches.
const lockRootPkg = lock.packages?.[''];
check(
  lockRootPkg?.version === pkg.version,
  `package-lock.json packages[""].version "${lockRootPkg?.version}" ≠ package.json "${pkg.version}"`,
);

// 4. src/constants.ts must not maintain its own semver literal.
const constantsTs = read('src/constants.ts');
const constantsLiteral = constantsTs.match(/\d+\.\d+\.\d+/);
check(
  constantsLiteral === null,
  `src/constants.ts contains a hard-coded version literal ("${constantsLiteral?.[0]}") — the app version must come from the __APP_VERSION__ global injected by vite.config.ts`,
);
check(
  constantsTs.includes('__APP_VERSION__'),
  'src/constants.ts no longer exports the injected __APP_VERSION__ global',
);

// 5. vite.config.ts injects __APP_VERSION__ from the package.json read, so
//    the built app version always equals package.json.
const viteConfig = read('vite.config.ts');
const defineMatch = viteConfig.match(/__APP_VERSION__\s*:\s*([^,\n]+)/);
check(
  defineMatch !== null,
  'vite.config.ts does not define the __APP_VERSION__ build-time constant',
);
if (defineMatch) {
  check(
    /pkg\.version/.test(defineMatch[1]) && !/\d+\.\d+\.\d+/.test(defineMatch[1]),
    `vite.config.ts defines __APP_VERSION__ as ${defineMatch[1].trim()} — it must be JSON.stringify(pkg.version), never a literal`,
  );
  check(
    /import\s+pkg\s+from\s+'\.\/package\.json'/.test(viteConfig),
    'vite.config.ts does not import pkg from ./package.json',
  );
}

if (failures.length > 0) {
  console.error('Version consistency check FAILED:');
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`✓ version consistency OK — app version ${pkg.version} (package.json is the single source of truth)`);
