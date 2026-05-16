import test from "node:test";
import assert from "node:assert/strict";

import { executeAction, parseAction, parseArgs } from "../src/agent.js";

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

test("executeAction handles all supported action types", async () => {
  const calls = [];
  const page = {
    goto: async (url) => calls.push(["goto", url]),
    locator: (selector) => ({
      first: () => ({
        click: async () => calls.push(["click", selector]),
        fill: async (value) => calls.push(["fill", selector, value]),
      }),
    }),
    keyboard: {
      press: async (key) => calls.push(["press", key]),
    },
    waitForTimeout: async (ms) => calls.push(["wait", ms]),
    screenshot: async ({ path }) => calls.push(["screenshot", path]),
  };

  await executeAction(page, { type: "goto", url: "https://example.com" });
  await executeAction(page, { type: "click", selector: "#run" });
  await executeAction(page, { type: "type", selector: "#cmd", text: "echo ok", pressEnter: true });
  await executeAction(page, { type: "press", key: "Escape" });
  await executeAction(page, { type: "wait", ms: 250 });
  await executeAction(page, { type: "screenshot", path: "artifacts/step.png" });
  const doneMessage = await executeAction(page, { type: "done", summary: "finished" });

  assert.deepEqual(calls, [
    ["goto", "https://example.com"],
    ["click", "#run"],
    ["fill", "#cmd", "echo ok"],
    ["press", "Enter"],
    ["press", "Escape"],
    ["wait", 250],
    ["screenshot", "artifacts/step.png"],
  ]);
  assert.equal(doneMessage, "finished");
});
