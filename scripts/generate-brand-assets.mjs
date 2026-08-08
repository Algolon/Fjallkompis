#!/usr/bin/env node
/**
 * Derive every Fjallkompis icon — PWA and Android — from the one approved
 * master, per assets/brand/brand.contract.mjs.
 *
 *     node scripts/generate-brand-assets.mjs            # report drift, write nothing
 *     node scripts/generate-brand-assets.mjs --write    # regenerate the assets
 *
 * The default is READ-ONLY on purpose: this script is also the reference
 * implementation the branding tests compare against, and a generator that
 * rewrites the tree just by being run is a generator that hides drift instead
 * of reporting it.
 *
 * `deriveAsset` is exported because tests/branding-parity.test.mjs re-derives
 * each asset and compares pixels. Keeping one implementation means the fence
 * cannot quietly disagree with the generator about what the contract says.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import {
  canvas,
  circleClip,
  compositeOver,
  decodePng,
  encodePng,
  isFullyOpaque,
  markSpanOf,
  meanAbsDiff,
  resize,
} from './lib/png.mjs';
import { DEFAULT_TOLERANCE, DERIVED, MASTER, MASTER_COPIES } from '../assets/brand/brand.contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p));

/**
 * Render one contract entry from the master.
 *
 * The master's mark does not fill its canvas (it spans ~0.94 of it), so a
 * requested `markSpan` is converted to a canvas scale by dividing through the
 * master's own span. That keeps the contract written in the units a reviewer
 * can verify — "the mark spans 80% of the icon" — while the arithmetic stays
 * here.
 *
 * @param {{width:number,height:number,data:Uint8Array}} master
 * @param {object} spec a DERIVED entry
 */
export function deriveAsset(master, spec) {
  const masterSpan = markSpanOf(master);
  const inner = Math.round((spec.size * spec.markSpan) / masterSpan);
  const offset = Math.round((spec.size - inner) / 2);
  // A negative offset is legal and intended: markSpan 1.0 scales the mark past
  // the canvas so it bleeds to the edge (the favicon), and compositeOver clips.
  let out = compositeOver(canvas(spec.size, spec.plate), resize(master, inner, inner), offset, offset);
  if (spec.round) out = circleClip(out);
  return out;
}

function main() {
  const write = process.argv.includes('--write');
  const master = decodePng(read(MASTER));
  if (master.width !== 512 || master.height !== 512) {
    throw new Error(`${MASTER} must be 512x512 (got ${master.width}x${master.height})`);
  }

  const changed = [];
  const problems = [];

  // The byte-identical copies first — these are a file copy, not a render.
  const masterBytes = read(MASTER);
  for (const copy of MASTER_COPIES) {
    let current = null;
    try {
      current = read(copy.path);
    } catch {
      /* missing counts as changed */
    }
    if (current && current.equals(masterBytes)) continue;
    changed.push(`${copy.path} (byte copy of the master)`);
    if (write) writeFileSync(join(ROOT, copy.path), masterBytes);
  }

  for (const spec of DERIVED) {
    const reference = deriveAsset(master, spec);

    if (spec.opaque && !isFullyOpaque(reference)) {
      problems.push(`${spec.path}: contract says opaque, but the derivation is not`);
    }

    let current = null;
    try {
      current = decodePng(read(spec.path));
    } catch {
      /* missing or unreadable counts as changed */
    }

    const tolerance = spec.tolerance ?? DEFAULT_TOLERANCE;
    if (current && current.width === spec.size && current.height === spec.size) {
      const diff = meanAbsDiff(current, reference);
      if (diff <= tolerance) continue;
      changed.push(`${spec.path} (MAE ${diff.toFixed(2)} > ${tolerance})`);
    } else {
      changed.push(`${spec.path} (${current ? `${current.width}x${current.height}, expected ${spec.size}` : 'missing'})`);
    }

    if (write) writeFileSync(join(ROOT, spec.path), encodePng(reference));
  }

  for (const p of problems) console.error(`  contract error: ${p}`);
  if (problems.length) process.exit(1);

  if (!changed.length) {
    console.log(`Branding: ${MASTER_COPIES.length + DERIVED.length} assets all match the contract.`);
    return;
  }
  console.log(write ? 'Branding: regenerated' : 'Branding: OUT OF DATE');
  for (const c of changed) console.log(`  ${write ? 'wrote' : 'drifted'}: ${c}`);
  if (!write) {
    console.log('\nRun `npm run generate:brand` to bring them back in line with the master.');
    process.exit(1);
  }
}

// Only run when invoked directly, so tests can import deriveAsset cheaply.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
