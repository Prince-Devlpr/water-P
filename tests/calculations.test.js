const test = require('node:test');
const assert = require('node:assert');
const {
  calculateWaterLevelPercent,
  calculateWaterVolumeLiters,
  determineWaterLevelStatus,
} = require('../src/utils/calculations');
const { ALERT_TYPES, ALERT_SEVERITY } = require('../src/utils/constants');

test('Water Level Calculations', async (t) => {
  await t.test('calculates correct level percentage when tank is half full', () => {
    // Tank depth = 100cm, distance = 50cm -> level = 50%
    const percent = calculateWaterLevelPercent(50, 100);
    assert.strictEqual(percent, 50);
  });

  await t.test('calculates correct level percentage when distance is 25cm', () => {
    // Tank depth = 100cm, distance = 25cm -> level = 75%
    const percent = calculateWaterLevelPercent(25, 100);
    assert.strictEqual(percent, 75);
  });

  await t.test('clamps water level to 0 when distance exceeds depth', () => {
    const percent = calculateWaterLevelPercent(120, 100);
    assert.strictEqual(percent, 0);
  });

  await t.test('clamps water level to 100 when distance is negative or zero', () => {
    const percent = calculateWaterLevelPercent(0, 100);
    assert.strictEqual(percent, 100);
  });

  await t.test('calculates volume in liters correctly', () => {
    // 75% of 1000L = 750L
    const liters = calculateWaterVolumeLiters(75, 1000);
    assert.strictEqual(liters, 750);
  });

  await t.test('evaluates CRITICAL_LOW alert when level <= 10%', () => {
    const status = determineWaterLevelStatus(8, 20, 90);
    assert.strictEqual(status.type, ALERT_TYPES.CRITICAL_LOW);
    assert.strictEqual(status.severity, ALERT_SEVERITY.CRITICAL);
  });

  await t.test('evaluates LOW_LEVEL alert when level <= 30%', () => {
    const status = determineWaterLevelStatus(25, 30, 90);
    assert.strictEqual(status.type, ALERT_TYPES.LOW_LEVEL);
    assert.strictEqual(status.severity, ALERT_SEVERITY.WARNING);
  });

  await t.test('evaluates NORMAL when level is between 30% and 90%', () => {
    const status = determineWaterLevelStatus(55, 30, 90);
    assert.strictEqual(status.type, ALERT_TYPES.NORMAL);
  });

  await t.test('evaluates TANK_FULL when level >= 90%', () => {
    const status = determineWaterLevelStatus(92, 20, 90);
    assert.strictEqual(status.type, ALERT_TYPES.TANK_FULL);
  });
});
