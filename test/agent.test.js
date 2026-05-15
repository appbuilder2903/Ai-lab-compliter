import test from "node:test";
import assert from "node:assert/strict";

import { parseAction, parseArgs } from "../src/agent.js";

test("parseArgs supports CLI overrides", () => {
  const args = parseArgs([
    "--goal",
    "Complete lab",
    "--start-url",
    "https://console.cloud.google.com/",
    "--max-steps",
    "12",
    "--headless",
  ]);

  assert.equal(args.goal, "Complete lab");
  assert.equal(args.startUrl, "https://console.cloud.google.com/");
  assert.equal(args.maxSteps, 12);
  assert.equal(args.headless, true);
});

test("parseAction validates action type", () => {
  const action = parseAction('{"type":"click","selector":"button.run"}');
  assert.equal(action.type, "click");
  assert.equal(action.selector, "button.run");
});

test("parseAction rejects unknown action type", () => {
  assert.throws(
    () => parseAction('{"type":"unknown"}'),
    /invalid action payload/i,
  );
});
