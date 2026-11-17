const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'htdocs/luci-static/resources/view/pulse/index.js'), 'utf8');
const boundary = 'return view.extend({';
assert.equal(source.split(boundary).length, 2, 'LuCI view boundary changed');
const helperNames = [
 'defaultDevice', 'visibleDeviceNames', 'deviceNetworks', 'deviceAddresses',
 'loadTraffic', 'prefs', 'visualTraffic', 'smoothPath', 'trafficScale', 'trafficPeak'
];

function fixture() {
 const devices = {
  eth0: {}, eth1: {}, eth2: {}, macvlan0: { parent: 'eth1' }, macvlan1: { parent: 'eth1' },
  'br-lan': { ports: ['eth0', 'eth2'] }, lo: {}, veth123: {}
 };
 const interfaces = [
  { interface: 'wan2', device: 'macvlan1', l3_device: 'macvlan1',
   'ipv4-address': [{ address: '198.51.100.2' }], 'dns-server': ['9.9.9.9'] },
  { interface: 'WAN', device: 'macvlan0', l3_device: 'macvlan0',
   'ipv4-address': [{ address: '192.0.2.1' }], 'dns-server': ['1.1.1.1', '9.9.9.9'] },
  { interface: 'lan', device: 'br-lan' }
 ];
 return [devices, interfaces, {}, {}, '', 'nameserver 127.0.0.1\n', [], {}, null, []];
}

function harness(data = fixture(), saved = new Map()) {
 const requests = [];
 const localStorage = {
  getItem: key => saved.get(key) ?? null,
  setItem: (key, value) => saved.set(key, value),
  removeItem: key => saved.delete(key)
 };
 const rpc = { declare: spec => async device => {
  if (spec.object === 'pulse') {
   requests.push(device);
   return { device, samples: [{ t: 1000, up: 100, down: 200 }] };
  }
  return {
   getNetworkDevices: data[0], dump: data[1], info: data[2], board: data[3],
   getMountPoints: [], getBuiltinEthernetPorts: [{ device: 'eth0' }]
  }[spec.method];
 } };
 const dependencies = {
  rpc,
  fs: { exec: async () => ({ code: 0, stdout: 'absent' }), read: async () => data[5] },
  firewall: { getZones: async () => [] },
  L: { resolveDefault: (promise, fallback) => Promise.resolve(promise).catch(() => fallback) },
  localStorage, _: value => value, view: { extend: value => value }, storage: { discover: () => [] }
 };
 const evaluate = code => new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
 // LuCI 模块不是 CommonJS, 使用真实源码并仅替换平台依赖.
 const helpers = evaluate(source.split(boundary)[0] + '\nreturn {' + helperNames.join(',') + '};');
 const page = evaluate(source);
 // DNS 仍在 update 内, 截取实际显示逻辑, 不在测试中复制实现.
 const dnsStart = source.indexOf(' var networks=deviceNetworks(selected,devices,ifs),related=');
 const dnsEnd = source.indexOf(" updateAddresses('ipv4'", dnsStart);
 assert.ok(dnsStart >= 0 && dnsEnd > dnsStart, 'DNS block changed; update the test adapter');
 const dns = evaluate('return function(selected, devices, ifs, d) {\n' +
  source.split(boundary)[0] + '\n' + source.slice(dnsStart, dnsEnd) +
  '\nreturn {addresses: Array.from(new Set(dns)), label: dnsLabel};\n};');
 return { helpers, page, requests, localStorage, dns: device => dns(device, data[0], data[1], data) };
}

test('all LuCI JavaScript modules compile', () => {
 const visit = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
   const file = path.join(directory, entry.name);
   if (entry.isDirectory()) visit(file);
   else if (file.endsWith('.js')) new Function(fs.readFileSync(file, 'utf8'));
  }
 };
 visit(path.join(root, 'htdocs'));
});

test('tabs keep independent choices while sharing saved preferences', async () => {
 const data = fixture(), saved = new Map([['pulse.device', 'eth0']]);
 const first = harness(data, saved), second = harness(data, saved);
 // 在首个页面请求尚未完成时修改共享偏好, 覆盖初始化时的竞争情况.
 const pending = first.page.load();
 saved.set('pulse.device', 'macvlan1');
 const [a, b] = await Promise.all([pending, second.page.load()]);
 assert.equal(first.page.deviceChoice, 'eth0');
 assert.equal(second.page.deviceChoice, 'macvlan1');
 assert.equal(a[10].device, 'eth0');
 assert.equal(b[10].device, 'macvlan1');
 for (let i = 0; i < 3; i++) {
  assert.equal((await first.helpers.loadTraffic(data, first.page.deviceChoice))[10].device, 'eth0');
  assert.equal((await second.helpers.loadTraffic(data, second.page.deviceChoice))[10].device, 'macvlan1');
 }
});

test('blocked storage does not override manual selection', async () => {
 const data = fixture(), { helpers, localStorage } = harness(data);
 localStorage.getItem = () => { throw new Error('Storage blocked'); };
 assert.equal(helpers.prefs(), '');
 assert.equal((await helpers.loadTraffic(data, 'macvlan1'))[10].device, 'macvlan1');
});

test('automatic, removed and empty device selections fall back safely', async () => {
 const data = fixture(), { helpers } = harness(data);
 for (const choice of ['', 'removed-device']) {
  assert.equal((await helpers.loadTraffic(data, choice))[10].device, 'macvlan0');
 }
 delete data[0].macvlan1;
 assert.equal((await helpers.loadTraffic(data, 'macvlan1'))[10].device, 'macvlan0');
 data[0] = {}; data[1] = [];
 assert.equal((await helpers.loadTraffic(data, 'macvlan1'))[10].device, '');
});

test('automatic selection prefers exact WAN, then WAN prefix, then default route', () => {
 const data = fixture(), { helpers: h } = harness(data);
 const names = h.visibleDeviceNames(data[0]);
 assert.ok(!names.includes('lo') && !names.includes('veth123'));
 assert.equal(h.defaultDevice(names, data[1]), 'macvlan0');
 const route = { interface: 'internet', device: 'eth0', route: [{ target: '0.0.0.0', mask: 0 }] };
 assert.equal(h.defaultDevice(names, [route, data[1][0]]), 'macvlan1');
 assert.equal(h.defaultDevice(names, [route]), 'eth0');
 assert.equal(h.defaultDevice(names, [{ interface: 'wan', device: 'eth1', l3_device: 'macvlan0' }]), 'macvlan0');
 assert.equal(h.defaultDevice(names, []), names[0]);
 assert.equal(h.defaultDevice([], []), '');
});

test('macvlan parent aggregates IPs and DNS without leaking into child interfaces', () => {
 const data = fixture(), { helpers: h, dns } = harness(data);
 assert.deepEqual(h.deviceNetworks('eth1', data[0], data[1]), ['wan2', 'WAN']);
 assert.deepEqual(h.deviceAddresses('eth1', data[0], data[1], 4), [
  { address: '198.51.100.2', networks: ['wan2'] }, { address: '192.0.2.1', networks: ['WAN'] }
 ]);
 assert.deepEqual(h.deviceAddresses('macvlan1', data[0], data[1], 4), [
  { address: '198.51.100.2', networks: ['wan2'] }
 ]);
 assert.deepEqual(dns('eth1'), { addresses: ['9.9.9.9', '1.1.1.1'], label: '' });
 assert.deepEqual(dns('macvlan1'), { addresses: ['9.9.9.9'], label: '' });
 assert.deepEqual(dns('eth0'), { addresses: ['127.0.0.1'], label: ' (system resolver)' });
 data[5] = '';
 assert.deepEqual(dns('eth0'), { addresses: [], label: '' });
});

test('bridge membership, DSA isolation and cyclic parent protection', () => {
 const data = fixture(), { helpers: h, dns } = harness(data);
 data[1][2]['dns-server'] = ['192.0.2.53'];
 assert.deepEqual(h.deviceNetworks('eth2', data[0], data[1]), ['lan']);
 assert.deepEqual(dns('eth2'), { addresses: ['192.0.2.53'], label: '' });
 const devices = { eth0: {}, lan1: { parent: 'eth0', devtype: 'dsa' },
  loopA: { parent: 'loopB' }, loopB: { parent: 'loopA' } };
 assert.deepEqual(h.deviceNetworks('eth0', devices, [{ device: 'lan1', interface: 'lan' }]), []);
 assert.deepEqual(h.deviceNetworks('missing', devices, [{ device: 'loopA', interface: 'loop' }]), []);
});

test('visual smoothing preserves raw readings and stays within neighbouring values', () => {
 const { helpers: h } = harness();
 const raw = [100, 900, 300, 0, 800].map((up, i) =>
  Object.freeze({ t: i * 1000, up, down: up / 2, interval: 1 }));
 Object.freeze(raw);
 const before = JSON.stringify(raw), draw = h.visualTraffic(raw);
 assert.equal(JSON.stringify(raw), before);
 assert.notEqual(draw, raw);
 assert.ok(draw.some((s, i) => s.up !== raw[i].up));
 draw.forEach((sample, i) => {
  assert.notEqual(sample, raw[i]);
  assert.equal(sample.t, raw[i].t);
  const neighbours = raw.slice(Math.max(0, i - 1), i + 2);
  for (const key of ['up', 'down']) {
   assert.ok(sample[key] >= Math.min(...neighbours.map(s => s[key])));
   assert.ok(sample[key] <= Math.max(...neighbours.map(s => s[key])));
  }
 });
});

test('missing samples and time gaps never borrow values from another segment', () => {
 const { helpers: h } = harness();
 const sample = (t, value) => ({ t, up: value, down: value, interval: 1 });
 const input = [sample(1000, 100), sample(2000, null), sample(3000, 900), sample(12000, 10)];
 assert.deepEqual(h.visualTraffic(input), input);
 for (const invalid of [NaN, Infinity, -1]) {
  const result = h.visualTraffic([sample(1000, invalid), sample(2000, 300)]);
  assert.equal(result[0].up, null);
  assert.equal(result[1].up, 300);
 }
});

test('empty and zero traffic have valid peaks, scales and SVG paths', () => {
 const { helpers: h } = harness();
 assert.deepEqual(h.visualTraffic([]), []);
 assert.equal(h.trafficPeak([], 'up'), null);
 assert.equal(h.trafficPeak([{ t: 1, up: null }], 'up'), null);
 assert.deepEqual(h.trafficPeak([{ t: 1, up: 0 }], 'up'), { t: 1, key: 'up', value: 0 });
 assert.equal(h.smoothPath([]), '');
 for (const peak of [0, 1, 1024, 4 * 1024 ** 2, 12 * 1024 ** 2, 1e12]) {
  const scale = h.trafficScale(peak);
  assert.ok(Number.isFinite(scale.ceiling) && scale.ceiling >= peak && scale.ceiling > 0);
  assert.ok(Number.isInteger(scale.step) && scale.step >= 1);
 }
 for (const points of [[[0, 0]], [[0, 0], [10, 0]], [[0, 0], [10, 100], [20, 0], [30, 50]]]) {
  assert.ok(!/NaN|Infinity/.test(h.smoothPath(points)));
 }
});
