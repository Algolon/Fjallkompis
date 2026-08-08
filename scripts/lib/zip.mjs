/**
 * A minimal read-only ZIP reader — enough to look inside an AAB or APK.
 *
 * An App Bundle is a ZIP, and the branding question "does the app Play
 * actually ingests carry the Fjällkompis launcher icon?" is answered by
 * reading entries out of it. `unzip` could do that in a workflow, but then the
 * check only exists as shell inside one CI job; as a Node module it runs the
 * same way against a locally built APK, which is where someone debugging a
 * wrong launcher icon will actually want it.
 *
 * Built on node:zlib's inflateRaw. Deliberately limited: stored (0) and
 * deflated (8) entries, no ZIP64, no encryption. Android bundles are well
 * under the 4 GB ZIP64 threshold; anything else throws rather than guessing.
 */

import { inflateRawSync } from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * Index a ZIP's central directory.
 *
 * @param {Buffer} buf the whole archive
 * @returns {Map<string, {offset: number, method: number, compressedSize: number, size: number}>}
 */
export function readZipIndex(buf) {
  // The EOCD sits at the end, after a comment of unknown length, so it is
  // found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i >= buf.length - 22 - 0xffff; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a ZIP archive (no end-of-central-directory record)');

  const count = buf.readUInt16LE(eocd + 10);
  let pos = buf.readUInt32LE(eocd + 16);
  if (pos === 0xffffffff) throw new Error('ZIP64 archives are not supported');

  const index = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(pos) !== CENTRAL_SIGNATURE) throw new Error('corrupt central directory');
    const method = buf.readUInt16LE(pos + 10);
    const compressedSize = buf.readUInt32LE(pos + 20);
    const size = buf.readUInt32LE(pos + 24);
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    const offset = buf.readUInt32LE(pos + 42);
    const name = buf.toString('utf8', pos + 46, pos + 46 + nameLen);
    index.set(name, { offset, method, compressedSize, size });
    pos += 46 + nameLen + extraLen + commentLen;
  }
  return index;
}

/**
 * Read one entry's bytes.
 *
 * The local header repeats the name and extra-field lengths — and its extra
 * field may differ in length from the central directory's, so the data offset
 * must be computed from the LOCAL header, not assumed.
 */
export function readZipEntry(buf, entry) {
  if (buf.readUInt32LE(entry.offset) !== LOCAL_SIGNATURE) throw new Error('corrupt local file header');
  const nameLen = buf.readUInt16LE(entry.offset + 26);
  const extraLen = buf.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(raw);
  if (entry.method === 8) return inflateRawSync(raw);
  throw new Error(`unsupported ZIP compression method ${entry.method}`);
}
