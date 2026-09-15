const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {EventEmitter} = require('node:events');
function setup() {
  const sockets = [], timers = new Map(); let id = 0;
  class Socket extends EventEmitter {
    constructor() { super(); this.writes = []; this.destroyed = false; }
    write(data) { assert.equal(this.destroyed, false); this.writes.push(data); }
    destroy() { if (!this.destroyed) { this.destroyed = true; this.emit('close'); } }
    data(s) { this.emit('data', Buffer.from(s)); }
  }
  const sandbox = { module: {exports:{}}, require(name) {
    if (name === 'net') return {connect() { const s = new Socket(); sockets.push(s); return s; }};
    if (name === 'debug') return () => () => {};
    if (name === 'sprintf-js') return {sprintf: require('node:util').format};
    if (name === 'sha1' || name === 'sha256') return () => '';
    return require(name);
  }, setTimeout(fn,ms) {timers.set(++id,{fn,ms}); return id;}, clearTimeout(i) {timers.delete(i);}, setInterval() {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/mhclient.js'),'utf8'), sandbox);
  const values = [];
  const client = new sandbox.module.exports.MyHomeClient('localhost',20000,'12345',{
    onPower(a,v) {values.push(['power',a,v]);}, onEnergyTotal(a,v) {values.push(['energy',a,v]);}
  });
  client.start();
  function tick(ms) { for (const [i,t] of [...timers]) if(t.ms===ms) {timers.delete(i); t.fn();} }
  return {client,sockets,values,timers,tick};
}
test('all split points: handshake and WHO18 readings, no partial values', () => {
  const stream='*#*1##*#*1##*#18*51*113*814##*#18*51*51*42849972##';
  for(let i=1;i<stream.length;i++) {
    const h=setup(); h.sockets[0].data(stream.slice(0,i)); h.sockets[0].data(stream.slice(i));
    assert.deepEqual(h.values,[['power',51,814],['energy',51,42849972]]);
  }
  const h=setup(); h.sockets[0].data('*#*1##*#*1##*#18*51*113*8');
  assert.deepEqual(h.values,[]); h.sockets[0].data('14##'); assert.equal(h.values[0][2],814);
});
test('reconnect discards partial frame; socket error schedules one retry', () => {
  const h=setup(); h.sockets[0].data('*#*1##*#*1##*#18*51*113*8');
  h.sockets[0].emit('error',new Error('disconnect'));
  assert.equal([...h.timers.values()].filter(t=>t.ms===5000).length,1);
  h.tick(5000); assert.equal(h.sockets.length,3);
  h.sockets[2].data('*#*1##*#*1##*#18*51*113*570##');
  assert.deepEqual(h.values,[['power',51,570]]);
});
test('commands wait for authentication and queue drains without skipping', () => {
  const h=setup(); h.client.command.send('*#18*51*113##*#18*52*113##*#18*53*113##');
  h.tick(50); assert.deepEqual(h.sockets[1].writes,[]);
  h.sockets[1].data('*#*1##*#*1##'); h.tick(50); h.tick(50);
  assert.deepEqual(h.sockets[1].writes,['*99*0##','*#18*51*113##','*#18*52*113##','*#18*53*113##']);
});
test('idle timeout closes sockets and schedules reconnect', () => {
  const h=setup(); h.tick(55000);
  assert.ok(h.sockets.every(s=>s.destroyed)); h.tick(5000); assert.equal(h.sockets.length,4);
});
