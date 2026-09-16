const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { applyPowerTopologyExperiment } = require('../lib/power-topology-experiment');

test('real Homebridge/Matter: NODE, SET self-reference, all submeters, restart and rollback', {
    skip: !process.env.HOMEBRIDGE_TEST_ROOT,
}, async () => {
    const root = process.env.HOMEBRIDGE_TEST_ROOT;
    const load = path => import(pathToFileURL(join(root, path)).href);
    const { Endpoint, ServerNode, Environment, Filesystem } = await load('node_modules/@matter/main/dist/esm/index.js');
    const { NodeJsFilesystem } = await load('node_modules/@matter/nodejs/dist/esm/index.js');
    const { deviceTypes, deviceRequirements } = await load('dist/matter/types.js');
    const { detectElectricalMeasurementClusters, applyElectricalMeasurementDefaults,
        applyElectricalMeasurementClusters } = await load('dist/matter/serverHelpers.js');
    const storage = await mkdtemp(join(tmpdir(), 'myhome-topology-test-'));
    const environment = new Environment('myhome-topology-test', Environment.default);
    environment.set(Filesystem, new NodeJsFilesystem(storage));
    const logs = [];
    function accessory(address, name, enabled, topology) {
        const a = { UUID: 'meter-' + address, deviceType: deviceTypes.OnOffOutlet,
            clusters: { onOff: { onOff: true }, electricalPowerMeasurement: { activePower: 300000 },
                electricalEnergyMeasurement: { cumulativeEnergyImported: { energy: 1000000 } } } };
        const meter = { address, name, api: { matter: { deviceRequirements } },
            config: { matterPowerTopology: topology, parent: { config: { matterPowerTopologyExperiment: enabled } } },
            log: { info: line => logs.push(line) } };
        applyPowerTopologyExperiment(a, meter);
        const detection = detectElectricalMeasurementClusters(a);
        applyElectricalMeasurementDefaults(a, detection);
        a.deviceType = applyElectricalMeasurementClusters(a.deviceType, a, detection);
        return a;
    }
    try {
        for (const phaseEnabled of [false, true, true, false]) {
            const node = await ServerNode.create({ id: 'topology-test', environment });
            try {
                let caseId = 0;
                for (const [address, name, enabled, expected, selectedTopology] of [
                    ['51', 'Consumo Generale', true, 'nodeTopology', 'node'],
                    ['54', 'Consumo Lavatrice', true, 'setTopology', 'set'],
                    ['55', 'Consumo Frigorifero', true, 'setTopology', 'set'],
                    ['52', 'Consumo Condizionatore', true, 'setTopology', 'set'],
                    ['53', 'Consumo Asciugatrice', true, 'setTopology', 'set'],
                    ['56', 'Consumo Induzione', true, 'setTopology', 'set'],
                    ['58', 'Consumo Forno', true, 'setTopology', 'set'],
                    ['59', 'Consumo Microonde', true, 'setTopology', 'set'],
                    ['510', 'Consumo Lavastoviglie', true, 'setTopology', 'set'],
                    ['51', 'Disabled main', false, 'treeTopology', 'node'],
                    ['54', 'Disabled submeter', false, 'treeTopology', 'set'],
                    ['999', 'Arbitrary main', true, 'nodeTopology', 'node'],
                    ['51', 'Explicit submeter at 51', true, 'setTopology', 'set'],
                    ['1000', 'Explicit tree', true, 'treeTopology', 'tree'],
                    ['51', 'Unconfigured at 51', true, 'treeTopology', undefined],
                ]) {
                    const a = accessory(address, name, enabled && phaseEnabled, selectedTopology);
                    const expectedFeature = phaseEnabled ? expected : 'treeTopology';
                    a.UUID += '-' + caseId++;
                    // Simulate an obsolete value restored by Homebridge's cache.
                    if (expectedFeature === 'setTopology') a.clusters.powerTopology.availableEndpoints = [999];
                    const ep = new Endpoint(a.deviceType, { id: a.UUID, ...a.clusters });
                    await node.add(ep);
                    const topology = ep.state.powerTopology;
                    assert.equal(topology.featureMap[expectedFeature], true);
                    assert.equal(Object.values(topology.featureMap).filter(Boolean).length, 1);
                    if (expectedFeature === 'setTopology') {
                        assert.deepEqual([...topology.availableEndpoints], [ep.number]);
                        assert.notEqual(ep.number, 54);
                        assert.equal(topology.activeEndpoints, undefined);
                    }
                    assert.equal(Number(ep.state.electricalPowerMeasurement.activePower), 300000);
                    assert.equal(Number(ep.state.electricalEnergyMeasurement.cumulativeEnergyImported.energy), 1000000);
                }
            } finally { await node.close(); }
        }
        assert.equal(logs.length, 24);
    } finally { await environment.close(); await rm(storage, { recursive: true, force: true }); }
});
