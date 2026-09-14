const test = require('node:test');
const assert = require('node:assert');
const net = require('net');
const aedes = require('aedes');
const mqtt = require('mqtt');

test('MQTT Broker & Telemetry Round-Trip', async (t) => {
  const TEST_PORT = 18883;
  let brokerInstance;
  let brokerServer;
  let publisherClient;
  let subscriberClient;

  // 1. Start test Aedes broker
  await t.test('starts local MQTT test broker', async () => {
    brokerInstance = aedes();
    brokerServer = net.createServer(brokerInstance.handle);

    await new Promise((resolve) => {
      brokerServer.listen(TEST_PORT, resolve);
    });
    assert.ok(brokerServer.listening);
  });

  // 2. Connect publisher and subscriber
  await t.test('clients connect and subscribe to topics', async () => {
    publisherClient = mqtt.connect(`mqtt://127.0.0.1:${TEST_PORT}`, { clean: true });
    subscriberClient = mqtt.connect(`mqtt://127.0.0.1:${TEST_PORT}`, { clean: true });

    await Promise.all([
      new Promise((resolve) => publisherClient.on('connect', resolve)),
      new Promise((resolve) => subscriberClient.on('connect', resolve)),
    ]);

    assert.strictEqual(publisherClient.connected, true);
    assert.strictEqual(subscriberClient.connected, true);
  });

  // 3. Round-trip telemetry message
  await t.test('publishes and receives telemetry message', async () => {
    const topic = 'smartwater/ESP8266_001/telemetry';
    const testPayload = { distance: 25.4, pump: false };

    await new Promise((resolve) => {
      subscriberClient.subscribe(topic, { qos: 1 }, resolve);
    });

    const receivedMessagePromise = new Promise((resolve) => {
      subscriberClient.on('message', (t, msg) => {
        if (t === topic) {
          resolve(JSON.parse(msg.toString()));
        }
      });
    });

    publisherClient.publish(topic, JSON.stringify(testPayload), { qos: 1 });

    const received = await receivedMessagePromise;
    assert.strictEqual(received.distance, 25.4);
    assert.strictEqual(received.pump, false);
  });

  // 4. Cleanup
  if (publisherClient) publisherClient.end(true);
  if (subscriberClient) subscriberClient.end(true);
  if (brokerServer) {
    await new Promise((resolve) => brokerServer.close(resolve));
  }
  if (brokerInstance) {
    await new Promise((resolve) => brokerInstance.close(resolve));
  }
});
