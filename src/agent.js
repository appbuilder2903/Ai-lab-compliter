import "dotenv/config";
import { chromium } from "playwright";
import OpenAI from "openai";

const SYSTEM_PROMPT = `You are a browser computer-use agent that autonomously completes cloud lab tasks.
You can only respond with strict JSON.
Choose exactly one action each turn.
Available actions:
- goto: { "type":"goto", "url":"https://..." }
- click: { "type":"click", "selector":"css-selector" }
- type: { "type":"type", "selector":"css-selector", "text":"...", "pressEnter":false }
- press: { "type":"press", "key":"Enter" }
- wait: { "type":"wait", "ms":1000 }
- screenshot: { "type":"screenshot", "path":"artifacts/step.png" }
- done: { "type":"done", "summary":"..." }
Rules:
- If the page is not at the correct place, use goto.
- Use robust selectors when possible.
- Do not ask for user input unless blocked by login/2FA/captcha.
- Prefer short, deterministic steps.
- If task appears complete, return done.`;

const ACTION_TYPES = new Set([
  "goto",
  "click",
  "type",
  "press",
  "wait",
  "screenshot",
  "done",
]);

export function parseArgs(argv) {
  const parsed = {
    goal: process.env.AGENT_GOAL ?? "",
    startUrl: process.env.START_URL ?? "https://console.cloud.google.com/",
    maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 30),
    headless: String(process.env.HEADLESS ?? "false") === "true",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--goal") parsed.goal = argv[i + 1] ?? parsed.goal;
    if (token === "--start-url") parsed.startUrl = argv[i + 1] ?? parsed.startUrl;
    if (token === "--max-steps") parsed.maxSteps = Number(argv[i + 1] ?? parsed.maxSteps);
    if (token === "--headless") parsed.headless = true;
  }

  return parsed;
}

export function parseAction(payloadText) {
  const parsed = JSON.parse(payloadText);
  if (!parsed || typeof parsed !== "object" || !ACTION_TYPES.has(parsed.type)) {
    throw new Error("Model returned an invalid action payload.");
  }
  return parsed;
}

function truncate(text, maxLen = 7000) {
  if (!text) return "";
  return text.length > maxLen ? `${text.slice(0, maxLen)}\n...[truncated]` : text;
}

async function getPageState(page) {
  const state = await page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const controls = Array.from(document.querySelectorAll("button, a, input, textarea, [role='button']"))
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        name: el.getAttribute("name") || undefined,
        role: el.getAttribute("role") || undefined,
        aria: el.getAttribute("aria-label") || undefined,
        text: (el.textContent || "").trim().slice(0, 120) || undefined,
      }));

    return {
      title: document.title,
      text,
      controls,
    };
  });

  return {
    url: page.url(),
    title: state.title,
    text: truncate(state.text),
    controls: state.controls,
  };
}

async function askModelForAction(client, goal, step, pageState, history) {
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            goal,
            step,
            pageState,
            history: history.slice(-8),
          },
          null,
          2,
        ),
      },
    ],
  });

  const outputText = response.output_text?.trim();
  if (!outputText) {
    throw new Error("Model returned an empty response.");
  }
  return parseAction(outputText);
}

async function executeAction(page, action) {
  switch (action.type) {
    case "goto":
      await page.goto(action.url, { waitUntil: "domcontentloaded", timeout: 90_000 });
      return `Navigated to ${action.url}`;
    case "click":
      await page.locator(action.selector).first().click({ timeout: 30_000 });
      return `Clicked ${action.selector}`;
    case "type":
      await page.locator(action.selector).first().fill(action.text ?? "", { timeout: 30_000 });
      if (action.pressEnter) {
        await page.keyboard.press("Enter");
      }
      return `Typed into ${action.selector}`;
    case "press":
      await page.keyboard.press(action.key ?? "Enter");
      return `Pressed ${action.key ?? "Enter"}`;
    case "wait":
      await page.waitForTimeout(Number(action.ms ?? 1000));
      return `Waited ${Number(action.ms ?? 1000)}ms`;
    case "screenshot":
      await page.screenshot({ path: action.path ?? "artifacts/latest.png", fullPage: true });
      return `Saved screenshot ${action.path ?? "artifacts/latest.png"}`;
    case "done":
      return action.summary ?? "Task completed.";
    default:
      throw new Error(`Unsupported action type: ${action.type}`);
  }
}

export async function runAgent(options) {
  if (!options.goal) {
    throw new Error("Missing goal. Provide --goal or AGENT_GOAL.");
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const browser = await chromium.launch({ headless: options.headless });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  const history = [];

  try {
    await page.goto(options.startUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });

    for (let step = 1; step <= options.maxSteps; step += 1) {
      const pageState = await getPageState(page);
      const action = await askModelForAction(client, options.goal, step, pageState, history);
      const result = await executeAction(page, action);

      history.push({
        step,
        action,
        result,
      });

      // eslint-disable-next-line no-console
      console.log(`[step ${step}]`, action, "-", result);

      if (action.type === "done") {
        return { success: true, summary: result, steps: history };
      }
    }

    return {
      success: false,
      summary: `Max steps (${options.maxSteps}) reached before completion.`,
      steps: history,
    };
  } finally {
    await context.close();
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs(process.argv.slice(2));
  runAgent(options)
    .then((result) => {
      // eslint-disable-next-line no-console
      console.log(result.success ? "SUCCESS:" : "INCOMPLETE:", result.summary);
      if (!result.success) process.exitCode = 1;
    })
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error("Agent failed:", error.message);
      process.exitCode = 1;
    });
}
