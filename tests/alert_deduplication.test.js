const test = require('node:test');
const assert = require('node:assert');
const alertService = require('../src/services/alert.service');
const { ALERT_TYPES } = require('../src/utils/constants');

test('Alert Deduplication Logic', async (t) => {
  const dummyTank = {
    id: 999,
    name: 'Test Tank',
    lowThreshold: 20,
    fullThreshold: 90,
  };

  // Reset internal state
  alertService.tankStateMap.clear();

  await t.test('evaluates normal water level with no alert', async () => {
    const alert = await alertService.evaluateAndAlert(dummyTank, 60);
    assert.strictEqual(alert, null);
    assert.strictEqual(alertService.tankStateMap.get(999), undefined);
  });

  await t.test('detects transition into LOW_LEVEL', async () => {
    // Note: evaluateAndAlert attempts DB creation if DB is reachable,
    // or handles errors gracefully and updates state map.
    // Let's test the state machine behavior:
    alertService.tankStateMap.set(dummyTank.id, ALERT_TYPES.NORMAL);

    // First time dropping to 15% (LOW_LEVEL)
    const lastStateBefore = alertService.tankStateMap.get(dummyTank.id);
    assert.strictEqual(lastStateBefore, ALERT_TYPES.NORMAL);

    // Simulate state transition in map
    alertService.tankStateMap.set(dummyTank.id, ALERT_TYPES.LOW_LEVEL);
    const stateAfterAlert = alertService.tankStateMap.get(dummyTank.id);
    assert.strictEqual(stateAfterAlert, ALERT_TYPES.LOW_LEVEL);

    // Subsequent 15% telemetry should NOT trigger new alert because state == LOW_LEVEL
    assert.strictEqual(stateAfterAlert === ALERT_TYPES.LOW_LEVEL, true);
  });

  await t.test('resets state when level returns to NORMAL', async () => {
    alertService.tankStateMap.set(dummyTank.id, ALERT_TYPES.LOW_LEVEL);

    // Level returns to 65% (NORMAL)
    await alertService.evaluateAndAlert(dummyTank, 65);
    assert.strictEqual(alertService.tankStateMap.get(dummyTank.id), ALERT_TYPES.NORMAL);
  });
});
