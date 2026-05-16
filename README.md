# Ai-lab-compliter

AI-powered computer-use agent scaffold for automating cloud lab workflows in the browser.

## What it does

- Uses Playwright to control browser interactions (click, type, press keys, navigate, screenshot)
- Uses OpenAI Responses API to decide the next action based on current page state and task goal
- Loops autonomously through steps until completion or a max-step limit

## Setup

```bash
npm install
```

Set environment variables:

```bash
export OPENAI_API_KEY="your_key"
export OPENAI_MODEL="gpt-4.1-mini" # optional
export HEADLESS="false"            # optional
```

## Usage

```bash
npm start -- --goal "Complete the current Google Cloud lab quickly and accurately"
```

Optional CLI flags:

- `--start-url https://console.cloud.google.com/`
- `--max-steps 40`
- `--headless`

## Validation

```bash
npm test
npm run check
```
