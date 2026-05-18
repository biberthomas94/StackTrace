# StackTrace MVP Automation

This workspace contains the first automation spine for the StackTrace MVP.

## What Works Now

- Resolve public-company tickers to SEC CIKs.
- Pull SEC submissions JSON.
- Pull SEC company facts JSON.
- Download recent 10-K, 10-Q, and 8-K primary documents.
- Convert filing HTML into rough text.
- Generate a source-linked company report JSON.
- Prepare keyword snippets for local-model relationship extraction.

## Setup

Copy `.env.example` to `.env` or set the variables in your shell:

```powershell
$env:SEC_USER_AGENT="StackTrace MVP your-email@example.com"
$env:STACKTRACE_DATA_DIR="./data"
```

The SEC asks automated clients to declare a User-Agent and stay within fair-access limits.

## Pull Company Reports

```powershell
npm.cmd run sec:report -- NVDA TSLA AAPL --limit 1 --forms 10-K
```

Outputs are written under:

```text
data/raw/sec/
data/processed/sec/
data/processed/reports/
```

## Run Local Model Extraction

Start your local OpenAI-compatible model server, then set:

```powershell
$env:LLM_BASE_URL="http://127.0.0.1:1234/v1"
$env:LLM_MODEL="your-local-model-name"
$env:LLM_API_KEY="not-needed"
```

Then run:

```powershell
npm.cmd run extract:candidates -- NVDA
```

Candidate relationship output is written to:

```text
data/processed/candidates/
```

## Where Computer Use Fits

Use browser/computer use for sources that do not have clean APIs, such as logged-in data-provider portals, export buttons, trial dashboards, or manual validation screens.

Use direct API/code automation for EDGAR and other structured public feeds. It is more reliable, cheaper, and easier to rerun.

## Review Relationship Edges

Generate the graph files:

```powershell
npm.cmd run graph:seed
npm.cmd run graph:render
```

Start the local review server:

```powershell
npm.cmd run graph:serve
```

Then open:

```text
http://localhost:4173
```

Review decisions are saved to:

```text
data/processed/reviews/relationship-reviews.json
```
