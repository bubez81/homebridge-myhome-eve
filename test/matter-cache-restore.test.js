'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { applyPowerTopologyExperiment } = require('../lib/power-topology-experiment');
const { migrateCache } = require('../scripts/repair-power-topology-cache');

test('unmodified Homebridge: real cache restore, nine meters, three restarts and topology rollback', {
    skip: !process.env.HOMEBRIDGE_TEST_ROOT,
}, async () => {
    const root = resolve(process.env.HOMEBRIDGE_TEST_ROOT);
    const load = path => import(pathToFileURL(join(root, path)).href);
    const { Endpoint, ServerNode, Environment, Filesystem, Logger, LogLevel } = await load('node_modules/@matter/main/dist/esm/index.js');
    Logger.defaultLogLevel = LogLevel.ERROR;
    const { NodeJsFilesystem } = await load('node_modules/@matter/nodejs/dist/esm/index.js');
    const { AggregatorEndpoint } = await load('node_modules/@matter/main/dist/esm/endpoints.js');
    const { deviceTypes, deviceRequirements } = await load('dist/matter/types.js');
    const { MatterServer } = await load('dist/matter/server.js');
    const { MatterAccessoryCache } = await load('dist/matter/accessoryCache.js');
    const directory = await mkdtemp(join(tmpdir(), 'myhome-cache-restore-'));
    const environment = new Environment('cache-test', Environment.default);
    environment.set(Filesystem, new NodeJsFilesystem(directory));
    const diagnostics = [];
    function accessory(i, enabled) {
        const a = { UUID: `meter-${i}`, displayName: `Meter ${i}`, deviceType: deviceTypes.OnOffOutlet,
            serialNumber: `meter-${i}`, manufacturer: 'Test', model: 'Meter', context: {},
            _associatedPlugin: 'homebridge-myhome-eve', _associatedPlatform: 'LegrandMyHome',
            clusters: { onOff: { onOff: true }, electricalPowerMeasurement: { activePower: 123000 },
                electricalEnergyMeasurement: { cumulativeEnergyImported: { energy: 4560000 } } },
            handlers: { onOff: { on: async () => {}, off: async () => {} } } };
        return applyPowerTopologyExperiment(a, {
            address: `${51 + i}`, name: a.displayName, api: { matter: { deviceRequirements } },
            config: { matterPowerTopology: i ? 'set' : 'node', parent: { config: { matterPowerTopologyExperiment: enabled } } },
            log: { info: line => diagnostics.push(line) },
        });
    }
    let numbers;
    try {
        // Both changing topology back to defaults and re-enabling it are covered.
        for (const [cycle, enabled] of [true, true, true, true, false, true].entries()) {
            if (cycle === 1) {
                // Reproduce the released 1.1.16 cache; migrate while the bridge is stopped.
                const file = join(directory, 'cache/accessories.json');
                const legacy = JSON.parse(await readFile(file, 'utf8'));
                legacy.forEach((a, i) => {
                    a.context.type = 'MHPowerMeter';
                    if (i) a.clusters.powerTopology = { availableEndpoints: [] };
                });
                const migrated = migrateCache(legacy);
                assert.equal(migrated.changed.length, 8);
                await writeFile(file, JSON.stringify(migrated.entries));
            }
            const node = await ServerNode.create({ id: 'bridge', environment });
            const cache = new MatterAccessoryCache(directory, 'cache');
            try {
                const aggregator = new Endpoint(AggregatorEndpoint, { id: 'aggregator' });
                await node.add(aggregator);
                const server = new MatterServer({ uniqueId: 'AA:BB:CC:DD:EE:FF' });
                Object.assign(server, { serverNode: node, aggregator, accessoryCache: cache });
                if (cycle) {
                    // This is the same callback ServerLifecycle invokes before plugins register.
                    await server.getLifecycleDeps().restoreAccessoriesFromCache();
                    assert.equal(server.accessories.size, 9, 'every cached accessory must restore successfully');
                }
                await server.registerPlatformAccessories('homebridge-myhome-eve', 'LegrandMyHome',
                    Array.from({ length: 9 }, (_, i) => accessory(i, enabled)));
                const entries = [...server.accessories.values()];
                const currentNumbers = entries.map(a => a.endpoint.number);
                if (numbers) assert.deepEqual(currentNumbers, numbers, 'endpoint numbers must not drift');
                numbers = currentNumbers;
                for (const [i, a] of entries.entries()) {
                    const s = a.endpoint.state;
                    assert.equal(s.powerTopology.featureMap[enabled ? i ? 'setTopology' : 'nodeTopology' : 'treeTopology'], true);
                    if (enabled && i) assert.deepEqual([...s.powerTopology.availableEndpoints], [a.endpoint.number]);
                    assert.equal(Number(s.electricalPowerMeasurement.activePower), 123000);
                    assert.equal(Number(s.electricalEnergyMeasurement.cumulativeEnergyImported.energy), 4560000);
                }
                await cache.save(server.accessories);
                const saved = JSON.parse(await readFile(join(directory, 'cache/accessories.json'), 'utf8'));
                assert.equal(saved.length, 9);
                for (const a of saved) assert.equal(a.clusters.powerTopology, undefined);
            } finally { cache.cancelPendingSave(); await node.close(); }
        }
        assert.equal(diagnostics.length, 45);
    } finally { await environment.close(); await rm(directory, { recursive: true, force: true }); }
});
