'use strict';

// Homebridge 2.4.0 / matter.js 0.17.9: feature selection is a server
// specialization, not a writable featureMap or a `topology` attribute.
function applyPowerTopologyExperiment(accessory, meter) {
    const config = meter.config.parent.config;
    if (config.matterPowerTopologyExperiment !== true) return accessory;
    const address = String(meter.address);
    const selected = meter.config.matterPowerTopology ?? 'default';
    if (selected === 'default') return accessory;
    const features = { node: 'NodeTopology', set: 'SetTopology', tree: 'TreeTopology' };
    if (!Object.prototype.hasOwnProperty.call(features, selected)) {
        throw new Error('Invalid matterPowerTopology for ' + meter.name + ': ' + selected);
    }
    const feature = features[selected];

    const server = meter.api.matter.deviceRequirements?.ElectricalSensor?.PowerTopologyServer;
    if (!server || typeof server.with !== 'function') {
        throw new Error('PowerTopology experiment requires Homebridge ElectricalSensor.PowerTopologyServer');
    }
    const Base = server.with(feature);
    class ExperimentPowerTopologyServer extends Base {
        async initialize() {
            // Assigned by matter.js, never the OpenWebNet address and never a
            // number retained from a previous registration/cache entry.
            if (feature === 'SetTopology') {
                this.state.availableEndpoints = [this.endpoint.number];
            }
            await super.initialize();
            meter.log.info('[PowerTopology experiment] ' + JSON.stringify({
                name: meter.name, address, endpoint: this.endpoint.number,
                featureMap: this.state.featureMap,
                availableEndpoints: this.state.availableEndpoints,
                mode: feature,
            }));
        }
    }
    accessory.deviceType = accessory.deviceType.with(ExperimentPowerTopologyServer);
    // Required initial SET attribute; initialize() fills the assigned endpoint.
    // ActiveEndpoints belongs to DynamicPowerFlow, which this test does not use.
    if (feature === 'SetTopology') accessory.clusters.powerTopology = { availableEndpoints: [] };
    return accessory;
}

module.exports = { applyPowerTopologyExperiment };
