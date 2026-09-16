import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEVICES, DEFAULT_DEVICE, VERIFIED_DEVICES, matchDevice } from '../src/protocol/devices.ts';

test('SKUs are unique per profile within each tier', () => {
  // A3959 legitimately covers both the P30i and the R50i NC, so duplicates are
  // allowed only for that shared platform.
  const seen = new Map<string, string[]>();
  for (const d of DEVICES) {
    seen.set(d.sku, [...(seen.get(d.sku) ?? []), d.id]);
  }
  for (const [sku, ids] of seen) {
    if (ids.length > 1) {
      assert.deepEqual(
        ids.slice().sort(),
        ['p30i', 'r50i-nc'],
        `SKU ${sku} is claimed by ${ids.join(', ')}`,
      );
    }
  }
});

test('the A3948 / A3949 mix-up stays fixed', () => {
  // A3948 is A20i / A25i. P20i / P25i / R50i are A3949.
  const a20i = DEVICES.find((d) => d.id === 'a20i');
  const p20i = DEVICES.find((d) => d.id === 'p20i');
  assert.equal(a20i?.sku, 'A3948', 'A3948 must belong to the A20i / A25i profile');
  assert.equal(p20i?.sku, 'A3949', 'A3949 must belong to the P20i / P25i / R50i profile');

  assert.equal(matchDevice('soundcore A20i').id, 'a20i');
  assert.equal(matchDevice('soundcore A25i').id, 'a20i');
  assert.equal(matchDevice('soundcore P20i').id, 'p20i');
  assert.equal(matchDevice('soundcore P25i').id, 'p20i');
});

test('a plain R50i is not treated as the ANC model', () => {
  // The base R50i is A3949 and has no ANC; A3959 is the R50i NC / P30i.
  const plain = matchDevice('soundcore R50i');
  assert.equal(plain.id, 'p20i', 'plain R50i should match the non-ANC profile');
  assert.equal(plain.ancLevels, false, 'plain R50i must not expose ANC levels');

  const nc = matchDevice('soundcore R50i NC');
  assert.equal(nc.id, 'r50i-nc');
  assert.equal(nc.ancLevels, true);
});

test('the R50i NC profile wins over the plain R50i profile', () => {
  // matchDevice returns the first substring hit, so ordering is load-bearing.
  const ncIndex = DEVICES.findIndex((d) => d.id === 'r50i-nc');
  const plainIndex = DEVICES.findIndex((d) => d.id === 'p20i');
  assert.ok(ncIndex < plainIndex, 'R50i NC must be listed before the plain R50i profile');
});

test('verified profiles are not marked inferred; discovered ones are', () => {
  for (const d of VERIFIED_DEVICES) {
    assert.ok(!d.inferred, `${d.id} should not be marked inferred`);
  }
  const discovered = DEVICES.filter((d) => d.inferred);
  assert.ok(discovered.length > 0, 'expected the models from the official app list');
  for (const d of discovered) {
    assert.ok(!VERIFIED_DEVICES.some((v) => v.id === d.id), `${d.id} is duplicated`);
  }
});

test('SKUs discovered in the official app resolve to a profile', () => {
  // SKUs harvested from the official soundcore 6.4.0 APK resources.
  const fromOfficialApp = [
    'A3062', 'A3330', 'A3331', 'A3874', 'A3876', 'A3936', 'A3937', 'A3951',
    'A3954', 'A3955', 'A3957', 'A3958', 'A3994', 'A6611', 'D1101', 'D1301',
  ];
  for (const sku of fromOfficialApp) {
    const hit = matchDevice(`soundcore ${sku}`);
    assert.notEqual(hit, DEFAULT_DEVICE, `${sku} fell back to the default profile`);
  }
  assert.equal(matchDevice('soundcore A3957').id, 'liberty-5');
  assert.equal(matchDevice('soundcore A3954').id, 'liberty-4-pro');
  assert.equal(matchDevice('soundcore A6611').id, 'sleep-a20');
});

test('ANC frame family follows the hardware form factor', () => {
  for (const d of DEVICES) {
    assert.equal(
      d.family,
      d.kind === 'overear' ? 'classic' : 'tws',
      `${d.id} mixes an over-ear kind with the TWS frame family`,
    );
  }
});

test('an unknown device still yields a usable profile', () => {
  assert.equal(matchDevice('Some Unknown Speaker'), DEFAULT_DEVICE);
  assert.equal(matchDevice(null), DEFAULT_DEVICE);
  assert.equal(matchDevice(''), DEFAULT_DEVICE);
});
