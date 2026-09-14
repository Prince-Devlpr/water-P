const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const app = require('../src/app');

test('Server & Health Route', async (t) => {
  let server;
  let port;

  await t.test('boots express application and listens on random port', async () => {
    await new Promise((resolve) => {
      server = http.createServer(app).listen(0, () => {
        port = server.address().port;
        resolve();
      });
    });
    assert.ok(port > 0);
  });

  await t.test('GET /health returns 200 or 503 structured status', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const data = await res.json();

    assert.ok(data.status === 'ok' || data.status === 'degraded');
    assert.ok(data.timestamp);
    assert.ok(data.services);
    assert.strictEqual(typeof data.services.database, 'string');
    assert.strictEqual(typeof data.services.mqtt, 'string');
  });

  await t.test('GET /api/nonexistent returns 404', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/nonexistent`);
    assert.strictEqual(res.status, 404);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  // Cleanup server, mqtt, and prisma connections
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const { mqttClient } = require('../src/config/mqtt');
  const { prisma } = require('../src/config/database');
  mqttClient.end(true);
  await prisma.$disconnect();
});
