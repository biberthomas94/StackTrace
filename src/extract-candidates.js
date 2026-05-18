const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(process.env.STACKTRACE_DATA_DIR || "./data");
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:1234/v1";
const LLM_MODEL = process.env.LLM_MODEL || "";
const LLM_API_KEY = process.env.LLM_API_KEY || "not-needed";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSnippets(report, maxSnippets = 16) {
  const seen = new Set();
  const snippets = [];
  for (const filing of report.filings || []) {
    for (const item of filing.snippets || []) {
      const key = item.snippet.slice(0, 160);
      if (seen.has(key)) continue;
      seen.add(key);
      snippets.push({
        filingDate: filing.filingDate,
        form: filing.form,
        accessionNumber: filing.accessionNumber,
        url: filing.url,
        keyword: item.keyword,
        snippet: item.snippet,
      });
      if (snippets.length >= maxSnippets) return snippets;
    }
  }
  return snippets;
}

function buildUserPrompt(report, snippets) {
  return [
    `Company: ${report.company.name}`,
    `Ticker: ${report.company.ticker}`,
    "",
    "Extract supply-chain relationship candidates from these source snippets.",
    "Each evidence_quote must be copied from the snippet text.",
    "",
    JSON.stringify(snippets, null, 2),
  ].join("\n");
}

function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model response did not contain JSON.");
  return JSON.parse(match[0]);
}

async function callLocalModel(systemPrompt, userPrompt) {
  if (!LLM_MODEL) {
    throw new Error("Set LLM_MODEL to your local model name. Example: $env:LLM_MODEL='qwen2.5-14b-instruct'");
  }

  const response = await fetch(`${LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LLM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Local model request failed ${response.status}: ${body}`);
  }

  const payload = await response.json();
  return extractJson(payload.choices?.[0]?.message?.content || "");
}

async function extractForTicker(ticker) {
  const reportPath = path.join(DATA_DIR, "processed", "reports", `${ticker.toUpperCase()}.company-report.json`);
  const report = await readJson(reportPath);
  const snippets = uniqueSnippets(report);
  const systemPrompt = await fs.readFile(path.resolve("prompts", "relationship-extraction.md"), "utf8");

  if (snippets.length === 0) {
    const empty = {
      generatedAt: new Date().toISOString(),
      ticker: report.company.ticker,
      relationships: [],
      note: "No keyword snippets found in the current report.",
    };
    const outputPath = path.join(DATA_DIR, "processed", "candidates", `${report.company.ticker}.relationship-candidates.json`);
    await writeJson(outputPath, empty);
    return outputPath;
  }

  const modelOutput = await callLocalModel(systemPrompt, buildUserPrompt(report, snippets));
  const output = {
    generatedAt: new Date().toISOString(),
    ticker: report.company.ticker,
    model: LLM_MODEL,
    baseUrl: LLM_BASE_URL,
    sourceReport: reportPath,
    sourceSnippets: snippets,
    relationships: Array.isArray(modelOutput.relationships) ? modelOutput.relationships : [],
  };
  const outputPath = path.join(DATA_DIR, "processed", "candidates", `${report.company.ticker}.relationship-candidates.json`);
  await writeJson(outputPath, output);
  return outputPath;
}

async function main() {
  const tickers = process.argv.slice(2);
  if (tickers.length === 0) {
    throw new Error("Provide at least one ticker, for example: npm run extract:candidates -- NVDA");
  }

  for (const ticker of tickers) {
    const outputPath = await extractForTicker(ticker);
    console.log(`${ticker.toUpperCase()}: wrote ${outputPath}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
