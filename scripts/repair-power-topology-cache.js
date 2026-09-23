#!/usr/bin/env node
'use strict';

// Offline migration for the cache written by homebridge-myhome-eve <= 1.1.16.
// Never run automatically on install: Homebridge must not be writing this file.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function migrateCache(entries) {
    if (!Array.isArray(entries)) throw new Error('Expected a Homebridge Matter accessories.json array');
    const migrated = structuredClone(entries);
    const changed = [];
    for (const a of migrated) {
        if (a?.plugin !== 'homebridge-myhome-eve' || a.platform !== 'LegrandMyHome'
            || a.context?.type !== 'MHPowerMeter') continue;
        const topology = a.clusters?.powerTopology;
        if (!topology || !Object.hasOwn(topology, 'availableEndpoints')) continue;
        // The released experiment only ever wrote this one attribute. Refuse
        // unknown shapes rather than discard a future topology configuration.
        if (Object.keys(topology).some(key => key !== 'availableEndpoints')
                || !Array.isArray(topology.availableEndpoints)
                || !topology.availableEndpoints.every(n => Number.isInteger(n) && n >= 0 && n <= 65534)) {
            throw new Error(`Unrecognized PowerTopology cache for ${a.uuid}; no files changed`);
        }
        delete a.clusters.powerTopology;
        changed.push({ uuid: a.uuid, name: a.displayName });
    }
    return { entries: migrated, changed };
}

function repair(file, apply = false, bridgeStopped = false) {
    if (path.basename(file) !== 'accessories.json') throw new Error('Select the Matter accessories.json file explicitly');
    const stat = fs.lstatSync(file);
    if (!stat.isFile()) throw new Error('Cache must be a regular file, not a symlink');
    const original = fs.readFileSync(file, 'utf8');
    const result = migrateCache(JSON.parse(original));
    if (!apply || !result.changed.length) return { changed: result.changed, applied: false };
    if (!bridgeStopped) throw new Error('Stop the affected Homebridge bridge, then add --bridge-stopped');
    const backup = `${file}.myhome-topology-${randomUUID()}.bak`;
    const temporary = `${file}.myhome-${randomUUID()}.tmp`;
    fs.writeFileSync(backup, original, { flag: 'wx', mode: stat.mode & 0o777 });
    try {
        fs.writeFileSync(temporary, JSON.stringify(result.entries, null, 2) + '\n', { flag: 'wx', mode: stat.mode & 0o777 });
        const tempStat = fs.statSync(temporary);
        if (tempStat.uid !== stat.uid || tempStat.gid !== stat.gid) fs.chownSync(temporary, stat.uid, stat.gid);
        fs.chmodSync(temporary, stat.mode & 0o777);
        if (fs.readFileSync(file, 'utf8') !== original) throw new Error('Cache changed during migration; stop Homebridge before retrying');
        fs.renameSync(temporary, file);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    return { changed: result.changed, applied: true, backup };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2);
        const files = args.filter(arg => !arg.startsWith('--'));
        if (files.length !== 1 || args.some(arg => arg.startsWith('--') && !['--apply', '--bridge-stopped'].includes(arg))) {
            throw new Error('Usage: node repair-power-topology-cache.js /path/to/matter/BRIDGE/accessories.json [--apply --bridge-stopped]');
        }
        console.log(JSON.stringify(repair(path.resolve(files[0]), args.includes('--apply'), args.includes('--bridge-stopped')), null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
module.exports = { migrateCache, repair };
