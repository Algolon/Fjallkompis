import test from 'node:test';
import assert from 'node:assert/strict';
import {
  linkedTravelAttachmentIds,
  linkedTravelDocuments,
} from '../src/wallet/todayQuickAccess.mjs';

const doc = (id) => ({ id, title: id });

test('Today ticket links come only from the shown day’s Travel items', () => {
  const day = {
    travelItems: [
      { kind: 'transport', attachmentIds: ['flight', 'shared'] },
      { kind: 'stay', attachmentIds: ['booking'] },
      { kind: 'transport', attachmentIds: ['shared', 'bus'] },
    ],
  };
  assert.deepEqual(linkedTravelAttachmentIds(day), ['flight', 'shared', 'bus']);
});

test('ticket links ignore malformed values and preserve first-link order', () => {
  const day = {
    travelItems: [
      { kind: 'transport', attachmentIds: ['', null, 'a', 'a', 12, 'b'] },
      { kind: 'transport' },
    ],
  };
  assert.deepEqual(linkedTravelAttachmentIds(day), ['a', 'b']);
  assert.deepEqual(linkedTravelAttachmentIds(null), []);
});

test('linked ticket documents omit missing metadata without reordering', () => {
  const day = {
    travelItems: [{ kind: 'transport', attachmentIds: ['second', 'missing', 'first'] }],
  };
  assert.deepEqual(
    linkedTravelDocuments(day, [doc('first'), doc('second')]).map((d) => d.id),
    ['second', 'first'],
  );
});
