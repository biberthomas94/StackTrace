const fs = require("node:fs/promises");
const path = require("node:path");

const SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data";
const SEC_DATA = "https://data.sec.gov";
const SEC_WWW = "https://www.sec.gov";
const DEFAULT_FORMS = new Set(["10-K", "10-Q", "8-K"]);

function env(name, fallback) {
  return process.env[name] || fallback;
}

const DATA_DIR = path.resolve(env("STACKTRACE_DATA_DIR", "./data"));
const USER_AGENT = env("SEC_USER_AGENT", "StackTrace MVP founder@example.com");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, value);
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function secFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Encoding": "gzip, deflate",
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`SEC request failed ${response.status} ${response.statusText}: ${url}`);
  }

  await sleep(125);
  return response;
}

function cik10(cik) {
  return String(cik).padStart(10, "0");
}

function cikPlain(cik) {
  return String(Number(cik));
}

function accessionCompact(accessionNumber) {
  return accessionNumber.replaceAll("-", "");
}

function sanitizeFileName(value) {
  return String(value).replace(/[^a-z0-9._-]+/gi, "_");
}

async function loadTickerMap() {
  const cachePath = path.join(DATA_DIR, "raw", "sec", "company_tickers.json");
  const cached = await readJsonIfExists(cachePath);
  if (cached) return cached;

  const response = await secFetch(`${SEC_WWW}/files/company_tickers.json`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  await writeJson(cachePath, payload);
  return payload;
}

async function resolveTicker(ticker) {
  const normalized = ticker.toUpperCase();
  const tickerMap = await loadTickerMap();
  const row = Object.values(tickerMap).find((entry) => entry.ticker.toUpperCase() === normalized);
  if (!row) throw new Error(`Ticker not found in SEC ticker map: ${ticker}`);
  return {
    ticker: normalized,
    cik: cik10(row.cik_str),
    cik_plain: cikPlain(row.cik_str),
    title: row.title,
  };
}

async function fetchSubmissions(company) {
  const rawPath = path.join(DATA_DIR, "raw", "sec", company.ticker, "submissions.json");
  const response = await secFetch(`${SEC_DATA}/submissions/CIK${company.cik}.json`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  await writeJson(rawPath, payload);
  return payload;
}

async function fetchCompanyFacts(company) {
  const rawPath = path.join(DATA_DIR, "raw", "sec", company.ticker, "companyfacts.json");
  const response = await secFetch(`${SEC_DATA}/api/xbrl/companyfacts/CIK${company.cik}.json`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json();
  await writeJson(rawPath, payload);
  return payload;
}

function recentFilings(submissions, forms, limit) {
  const recent = submissions.filings?.recent || {};
  const rows = [];
  const count = recent.accessionNumber?.length || 0;

  for (let index = 0; index < count; index += 1) {
    const form = recent.form[index];
    if (!forms.has(form)) continue;
    rows.push({
      accessionNumber: recent.accessionNumber[index],
      filingDate: recent.filingDate[index],
      reportDate: recent.reportDate[index],
      acceptanceDateTime: recent.acceptanceDateTime[index],
      act: recent.act[index],
      form,
      fileNumber: recent.fileNumber[index],
      filmNumber: recent.filmNumber[index],
      primaryDocument: recent.primaryDocument[index],
      primaryDocDescription: recent.primaryDocDescription[index],
    });
    if (rows.length >= limit) break;
  }

  return rows;
}

function filingUrl(company, filing) {
  return `${SEC_ARCHIVES}/${company.cik_plain}/${accessionCompact(filing.accessionNumber)}/${filing.primaryDocument}`;
}

async function downloadFiling(company, filing) {
  const url = filingUrl(company, filing);
  const extension = path.extname(filing.primaryDocument) || ".html";
  const base = `${filing.filingDate}_${filing.form}_${accessionCompact(filing.accessionNumber)}${extension}`;
  const rawPath = path.join(DATA_DIR, "raw", "sec", company.ticker, "filings", sanitizeFileName(base));
  const response = await secFetch(url);
  const text = await response.text();
  await writeText(rawPath, text);
  return { ...filing, url, rawPath, textLength: text.length };
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<\/(p|div|section|article|tr|table|h[1-6]|li)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#160;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function keywordSnippets(text, keywords, maxSnippets = 20) {
  const snippets = [];
  const lower = text.toLowerCase();

  for (const keyword of keywords) {
    let start = 0;
    const needle = keyword.toLowerCase();
    while (snippets.length < maxSnippets) {
      const index = lower.indexOf(needle, start);
      if (index === -1) break;
      const from = Math.max(0, index - 350);
      const to = Math.min(text.length, index + needle.length + 350);
      snippets.push({
        keyword,
        snippet: text.slice(from, to).replace(/\s+/g, " ").trim(),
      });
      start = index + needle.length;
    }
    if (snippets.length >= maxSnippets) break;
  }

  return snippets;
}

function summarizeFacts(companyFacts) {
  const dei = companyFacts.facts?.dei || {};
  const usGaap = companyFacts.facts?.["us-gaap"] || {};
  const concepts = ["EntityCommonStockSharesOutstanding", "Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "CostOfRevenue"];

  return concepts
    .filter((concept) => dei[concept] || usGaap[concept])
    .map((concept) => {
      const source = dei[concept] || usGaap[concept];
      const units = source.units || {};
      const firstUnit = Object.keys(units)[0];
      const values = firstUnit ? units[firstUnit] : [];
      const latest = [...values]
        .filter((row) => row.val !== undefined)
        .sort((a, b) => String(b.filed || "").localeCompare(String(a.filed || "")))[0];
      return {
        concept,
        label: source.label,
        description: source.description,
        unit: firstUnit,
        latest: latest
          ? {
              value: latest.val,
              filed: latest.filed,
              form: latest.form,
              frame: latest.frame,
              fy: latest.fy,
              fp: latest.fp,
            }
          : null,
      };
    });
}

async function buildCompanyReport(ticker, options) {
  const company = await resolveTicker(ticker);
  const submissions = await fetchSubmissions(company);
  const facts = await fetchCompanyFacts(company);
  const filings = recentFilings(submissions, options.forms, options.limit);
  const downloaded = [];

  for (const filing of filings) {
    downloaded.push(await downloadFiling(company, filing));
  }

  const processedFilings = [];
  for (const filing of downloaded) {
    const raw = await fs.readFile(filing.rawPath, "utf8");
    const text = htmlToText(raw);
    const textPath = filing.rawPath.replace(path.join(DATA_DIR, "raw"), path.join(DATA_DIR, "processed")).replace(/\.[^.]+$/, ".txt");
    await writeText(textPath, text);
    processedFilings.push({
      ...filing,
      textPath,
      snippets: keywordSnippets(text, [
        "supplier",
        "suppliers",
        "supply chain",
        "customer",
        "customers",
        "sole source",
        "single source",
        "manufacturing partner",
        "contract manufacturer",
        "tariff",
        "export control",
        "sanction",
      ]),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    company: {
      ticker: company.ticker,
      cik: company.cik,
      name: submissions.name || company.title,
      sic: submissions.sic,
      sicDescription: submissions.sicDescription,
      fiscalYearEnd: submissions.fiscalYearEnd,
      exchanges: submissions.exchanges,
    },
    facts: summarizeFacts(facts),
    filings: processedFilings,
    nextPipelineStep: "Run relationship extraction over processed filing text and store source-cited candidates.",
  };

  const reportPath = path.join(DATA_DIR, "processed", "reports", `${company.ticker}.company-report.json`);
  await writeJson(reportPath, report);
  return { company, reportPath, filings: processedFilings.length };
}

function parseArgs(argv) {
  const [, , command = "report", ...rest] = argv;
  const tickers = [];
  let limit = 6;
  let forms = DEFAULT_FORMS;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--limit") {
      limit = Number(rest[index + 1]);
      index += 1;
    } else if (arg === "--forms") {
      forms = new Set(rest[index + 1].split(",").map((value) => value.trim().toUpperCase()));
      index += 1;
    } else {
      tickers.push(arg);
    }
  }

  return { command, tickers, limit, forms };
}

async function main() {
  const { command, tickers, limit, forms } = parseArgs(process.argv);
  if (!["report", "pull"].includes(command)) {
    throw new Error(`Unknown command "${command}". Use "report" or "pull".`);
  }
  if (tickers.length === 0) {
    throw new Error("Provide at least one ticker, for example: npm run sec:report -- NVDA TSLA AAPL");
  }

  await ensureDir(DATA_DIR);
  const results = [];
  for (const ticker of tickers) {
    results.push(await buildCompanyReport(ticker, { limit, forms }));
  }

  for (const result of results) {
    console.log(`${result.company.ticker}: wrote ${result.reportPath} (${result.filings} filings)`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
