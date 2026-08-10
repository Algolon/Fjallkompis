#!/usr/bin/env node
/**
 * The map-archive half of the deploy pipeline, driven entirely by
 * src/map/mapCatalog.mjs.
 *
 * WHY THIS SCRIPT EXISTS. deploy.yml used to carry its own copy of every
 * archive identity: two release tags, three SHA-256 pins, one size pin and the
 * filenames, spread across four steps. Cutting a new terrain build therefore
 * meant editing a workflow and a source file and hoping they agreed — and the
 * failure mode of getting it half right is a device serving one revision under
 * the label of another. Now the workflow calls these two commands and the
 * catalog is the only thing anyone edits.
 *
 *   node scripts/map-archives.mjs fetch  <dir>   download the optional archives
 *   node scripts/map-archives.mjs verify <dir>   size + SHA-256 against the catalog
 *   node scripts/map-archives.mjs list           print the catalog (for logs)
 *
 * `fetch` shells out to `gh release download`, which is how the archives were
 * always retrieved; it just no longer decides for itself which tag that is.
 * `verify` is run twice in CI — once on what was fetched, once on what the
 * build actually emitted — because "we downloaded the right bytes" and "the
 * right bytes are in the artifact" are different claims.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAP_ASSETS,
  MAP_ASSET_REPO,
  OPTIONAL_MAP_ASSETS,
} from '../src/map/mapCatalog.mjs';

const [, , command, targetDir] = process.argv;

const fail = (message) => {
  console.error(`FATAL: ${message}`);
  process.exit(1);
};

async function sha256(path) {
  const hash = createHash('sha256');
  // Streamed: map archives are multi-megabyte binaries and CI runners are not the place
  // to read that into a Buffer for no reason.
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Every optional archive, grouped by the release tag that carries it. */
function releaseGroups() {
  const groups = new Map();
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    const existing = groups.get(asset.release.tag) ?? [];
    existing.push(asset);
    groups.set(asset.release.tag, existing);
  }
  return groups;
}

function fetchArchives(dir) {
  mkdirSync(dir, { recursive: true });
  const { owner, repo } = MAP_ASSET_REPO;
  for (const [tag, assets] of releaseGroups()) {
    const patterns = assets.flatMap((a) => ['--pattern', a.release.asset]);
    console.log(`Fetching ${assets.map((a) => a.id).join(', ')} from ${tag}…`);
    execFileSync(
      'gh',
      ['release', 'download', tag, '--repo', `${owner}/${repo}`, ...patterns,
        '--dir', dir, '--clobber'],
      { stdio: 'inherit' },
    );
  }
}

async function verifyArchives(dir) {
  let checked = 0;
  for (const id of OPTIONAL_MAP_ASSETS) {
    const asset = MAP_ASSETS[id];
    const path = join(dir, asset.file);
    let size;
    try {
      size = statSync(path).size;
    } catch {
      fail(`${path} is missing — ${asset.id} would be unavailable to every reader`);
    }
    if (size !== asset.revision.bytes) {
      fail(`${path} is ${size} bytes, catalog declares ${asset.revision.bytes}`);
    }
    const digest = await sha256(path);
    if (digest !== asset.revision.sha256) {
      fail(`${path} sha256 ${digest}, catalog declares ${asset.revision.sha256}`);
    }
    console.log(`✓ ${asset.file}  ${size} bytes  ${digest}`);
    checked += 1;
  }
  if (checked !== OPTIONAL_MAP_ASSETS.length) {
    fail('not every optional archive was checked');
  }
  console.log(`✓ ${checked} optional map archives verified against the catalog`);
}

function listArchives() {
  for (const id of Object.keys(MAP_ASSETS)) {
    const a = MAP_ASSETS[id];
    const origin = a.release ? `${a.release.tag}/${a.release.asset}` : 'committed';
    console.log(
      `${a.id.padEnd(10)} ${a.distribution.padEnd(9)} ${String(a.revision.bytes).padStart(9)}  ` +
      `${a.revision.id.padEnd(42)} ${origin}`,
    );
  }
}

switch (command) {
  case 'fetch':
    if (!targetDir) fail('usage: map-archives.mjs fetch <dir>');
    fetchArchives(targetDir);
    break;
  case 'verify':
    if (!targetDir) fail('usage: map-archives.mjs verify <dir>');
    await verifyArchives(targetDir);
    break;
  case 'list':
    listArchives();
    break;
  default:
    fail('usage: map-archives.mjs <fetch|verify|list> [dir]');
}
