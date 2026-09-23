'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { migrateCache, repair } = require('../scripts/repair-power-topology-cache');
const entry = () => ({ uuid: 'unchanged-uuid', plugin: 'homebridge-myhome-eve', platform: 'LegrandMyHome',
    context: { type: 'MHPowerMeter', address: '52' }, clusters: { powerTopology: { availableEndpoints: [37] },
        electricalPowerMeasurement: { activePower: 32000 }, electricalEnergyMeasurement: { cumulativeEnergyImported: { energy: 9000000 } } } });
test('migration is scoped, preserves measurements/identity, does not mutate input and is idempotent', () => {
    const original = [entry(), { ...entry(), plugin: 'another-plugin' }];
    const before = structuredClone(original);
    const result = migrateCache(original);
    assert.deepEqual(original, before);
    assert.equal(result.changed.length, 1);
    delete before[0].clusters.powerTopology;
    assert.deepEqual(result.entries, before);
    assert.equal(migrateCache(result.entries).changed.length, 0);
    const unsupported = entry(); unsupported.clusters.powerTopology.activeEndpoints = [37];
    assert.throws(() => migrateCache([unsupported]), /Unrecognized/);
});
test('offline repair defaults to preview, requires stopped bridge, backs up exact bytes and preserves file mode', () => {
    const dir = fs.mkdtempSync(join(tmpdir(), 'myhome-repair-'));
    try {
        const file = join(dir, 'accessories.json');
        const original = JSON.stringify([entry()]);
        fs.writeFileSync(file, original, { mode: 0o640 });
        const mode = fs.statSync(file).mode;
        assert.equal(repair(file).applied, false);
        assert.equal(fs.readFileSync(file, 'utf8'), original);
        assert.throws(() => repair(file, true), /Stop/);
        const result = repair(file, true, true);
        assert.equal(result.applied, true);
        assert.equal(fs.readFileSync(result.backup, 'utf8'), original);
        assert.equal(fs.statSync(file).mode, mode);
        assert.equal(repair(file, true, true).applied, false);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
