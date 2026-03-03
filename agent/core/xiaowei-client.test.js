const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'ws') {
    return class FakeWebSocket {
      static OPEN = 1;
      constructor() {
        this.readyState = FakeWebSocket.OPEN;
      }
      on() {}
      send() {}
      close() {}
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const XiaoweiClient = require('./xiaowei-client');
Module._load = originalLoad;

function createConnectedClient() {
  const client = new XiaoweiClient('ws://test');
  client.connected = true;
  client.ws = {
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
  };
  return client;
}

test('send() adds unique requestId and resolves by requestId when responses are out of order', async () => {
  const client = createConnectedClient();

  const p1 = client.adbShell('device-A', 'echo one');
  const p2 = client.adb('device-B', 'connect');

  assert.equal(client.ws.sent.length, 2);
  const req1 = client.ws.sent[0].requestId;
  const req2 = client.ws.sent[1].requestId;

  assert.ok(req1);
  assert.ok(req2);
  assert.notEqual(req1, req2);

  client._handleIncomingMessage({ requestId: req2, action: 'adb', status: 'ok', data: { command: 'connect' } });
  client._handleIncomingMessage({ requestId: req1, action: 'adb_shell', status: 'ok', data: { command: 'echo one' } });

  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(r1.requestId, req1);
  assert.equal(r2.requestId, req2);
});

test('fallback matching without requestId uses action/devices/oldest strategy for concurrent high-frequency APIs', async () => {
  const client = createConnectedClient();

  const pList = client.list();
  const pShell = client.adbShell('SER-1', 'getprop ro.product.model');
  const pAdb = client.adb('SER-2', 'connect');

  client._handleIncomingMessage({ action: 'adb_shell', devices: 'SER-1', status: 'ok', data: { out: 'Pixel' } });
  client._handleIncomingMessage({ action: 'list', status: 'ok', data: [{ serial: 'SER-1', model: 'Pixel' }] });
  client._handleIncomingMessage({ action: 'adb', devices: 'SER-2', status: 'ok', data: { out: 'connected' } });

  const [listResp, shellResp, adbResp] = await Promise.all([pList, pShell, pAdb]);

  assert.equal(shellResp.action, 'adb_shell');
  assert.equal(listResp.action, 'list');
  assert.equal(adbResp.action, 'adb');
  assert.equal(client.lastDevices.length, 1);
  assert.equal(client.lastDevices[0].serial, 'SER-1');
});

test('error response rejects matched pending promise', async () => {
  const client = createConnectedClient();
  const pending = client.adbShell('SER-ERR', 'badcmd');
  const { requestId } = client.ws.sent[0];

  client._handleIncomingMessage({
    requestId,
    action: 'adb_shell',
    status: 'error',
    message: 'command failed',
  });

  await assert.rejects(pending, /command failed/);
});
