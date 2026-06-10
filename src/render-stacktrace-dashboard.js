const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(process.env.STACKTRACE_DATA_DIR || "./data");
const GRAPH_PATH = path.join(DATA_DIR, "processed", "graphs", "edgar-seed.graph.json");
const OUT_DIR = path.join(DATA_DIR, "processed", "graphs");

const DEMO_GRAPH = {
  nodes: [
    { id: "company:nvda", label: "NVIDIA Corporation", ticker: "NVDA", kind: "company" },
    { id: "entity:tsmc", label: "Taiwan Semiconductor", ticker: "TSM", kind: "foundry" },
    { id: "entity:sk-hynix", label: "SK Hynix", kind: "memory_supplier" },
    { id: "entity:asml", label: "ASML", kind: "equipment" },
    { id: "entity:amkor", label: "Amkor Technology", ticker: "AMKR", kind: "packaging" },
    { id: "entity:ase", label: "ASE Technology", kind: "packaging" },
    { id: "entity:ibiden", label: "Ibiden", kind: "substrate" },
    { id: "entity:advantest", label: "Advantest", kind: "testing" },
  ],
  edges: [
    {
      id: "edge:nvda-tsmc",
      source: "company:nvda",
      target: "entity:tsmc",
      type: "foundry",
      confidence: 0.91,
      evidence: [
        {
          sourceSystem: "SEC EDGAR",
          sourceForm: "10-K",
          sourceDate: "2025-02-26",
          quote: "Supplier concentration and foundry capacity are cited as material dependencies.",
        },
      ],
    },
    {
      id: "edge:nvda-sk-hynix",
      source: "company:nvda",
      target: "entity:sk-hynix",
      type: "memory_supplier",
      confidence: 0.83,
      evidence: [
        {
          sourceSystem: "Earnings Call",
          sourceForm: "Transcript",
          sourceDate: "2025-05-28",
          quote: "High-bandwidth memory availability was discussed as a key supply input.",
        },
      ],
    },
    {
      id: "edge:nvda-asml",
      source: "company:nvda",
      target: "entity:asml",
      type: "equipment_dependency",
      confidence: 0.77,
      evidence: [
        {
          sourceSystem: "USPTO",
          sourceForm: "Patent",
          sourceDate: "2025-01-14",
          quote: "Patent dependency signals connect advanced lithography to accelerator supply.",
        },
      ],
    },
    {
      id: "edge:nvda-amkor",
      source: "company:nvda",
      target: "entity:amkor",
      type: "advanced_packaging",
      confidence: 0.74,
      evidence: [
        {
          sourceSystem: "US Customs",
          sourceForm: "Import record",
          sourceDate: "2025-04-09",
          quote: "Packaging equipment import trail indicates capacity expansion.",
        },
      ],
    },
    {
      id: "edge:nvda-ase",
      source: "company:nvda",
      target: "entity:ase",
      type: "packaging",
      confidence: 0.68,
      evidence: [
        {
          sourceSystem: "SEC EDGAR",
          sourceForm: "10-K",
          sourceDate: "2025-03-18",
          quote: "Third-party packaging relationships appear in supplier disclosures.",
        },
      ],
    },
    {
      id: "edge:nvda-ibiden",
      source: "company:nvda",
      target: "entity:ibiden",
      type: "substrate",
      confidence: 0.63,
      evidence: [
        {
          sourceSystem: "Customs",
          sourceForm: "Import record",
          sourceDate: "2025-02-10",
          quote: "Substrate shipments map to accelerator manufacturing corridors.",
        },
      ],
    },
    {
      id: "edge:nvda-advantest",
      source: "company:nvda",
      target: "entity:advantest",
      type: "testing",
      confidence: 0.59,
      evidence: [
        {
          sourceSystem: "Earnings Call",
          sourceForm: "Transcript",
          sourceDate: "2025-04-25",
          quote: "Test equipment demand was referenced alongside AI accelerator volume.",
        },
      ],
    },
  ],
};

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll("</script", "<\\/script");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readGraph() {
  try {
    return JSON.parse(await fs.readFile(GRAPH_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return DEMO_GRAPH;
    throw error;
  }
}

function buildDashboardHtml(graph) {
  const graphJson = escapeScriptJson(graph);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StackTrace Supplier Network</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080b0f;
      --panel: rgba(12, 17, 23, 0.86);
      --panel-soft: rgba(255, 255, 255, 0.035);
      --line: rgba(203, 223, 220, 0.09);
      --line-strong: rgba(203, 223, 220, 0.16);
      --text: #eff5f4;
      --muted: #8ca09d;
      --teal: #77ecdf;
      --green: #79e7b0;
      --amber: #d99a4d;
      --red: #d85d66;
      --radius: 8px;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      min-width: 320px;
      min-height: 100vh;
      overflow: hidden;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 48% 35%, rgba(38, 122, 128, 0.16), transparent 34%),
        linear-gradient(140deg, #080b0f 0%, #121820 52%, #080b0f 100%);
      font-synthesis: none;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }

    button, input { font: inherit; }
    button { border: 0; color: inherit; }

    .app-shell {
      display: grid;
      grid-template-columns: 232px minmax(620px, 1fr) 318px;
      gap: 14px;
      width: 100vw;
      height: 100vh;
      padding: 14px;
    }

    .side-rail,
    .evidence-drawer,
    .graph-stage {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
      backdrop-filter: blur(16px);
    }

    .side-rail {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 18px;
    }

    .brand-lockup {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .brand-mark {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      border: 1px solid rgba(77, 228, 216, 0.24);
      border-radius: var(--radius);
      color: var(--teal);
      background: rgba(26, 62, 65, 0.44);
    }

    .brand-lockup p,
    .graph-toolbar p {
      margin: 0;
      font-weight: 800;
      letter-spacing: 0;
    }

    .brand-lockup span,
    .graph-toolbar span,
    .breadcrumb,
    .section-kicker {
      color: var(--muted);
      font-size: 12px;
    }

    .ticker-search {
      display: flex;
      align-items: center;
      gap: 9px;
      height: 42px;
      margin-top: 24px;
      padding: 0 12px;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius);
      color: var(--teal);
      background: var(--panel-soft);
    }

    .ticker-search input {
      width: 100%;
      min-width: 0;
      border: 0;
      outline: 0;
      color: #f8fffd;
      background: transparent;
      font-weight: 800;
    }

    .nav-list {
      display: grid;
      gap: 7px;
      margin-top: 20px;
    }

    .nav-item,
    .watch-chip,
    .quiet-button,
    .view-toggle button,
    .icon-button,
    .primary-action {
      display: flex;
      align-items: center;
      gap: 9px;
      min-height: 36px;
      border-radius: var(--radius);
      background: transparent;
      color: #aab9b6;
      cursor: pointer;
      transition: border-color 160ms ease, background 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
    }

    .nav-item {
      justify-content: flex-start;
      padding: 0 12px;
    }

    .nav-item.active {
      color: #ecfffb;
      background: rgba(77, 228, 216, 0.11);
      box-shadow: inset 3px 0 0 var(--teal);
    }

    .nav-item:hover,
    .watch-chip:hover,
    .quiet-button:hover,
    .icon-button:hover {
      color: #ecfffb;
      border-color: rgba(77, 228, 216, 0.28);
      background: rgba(77, 228, 216, 0.07);
    }

    .watchlist {
      display: grid;
      gap: 8px;
      margin-top: auto;
    }

    .watch-chip {
      justify-content: space-between;
      padding: 0 12px;
      border: 1px solid var(--line);
    }

    .watch-chip.selected {
      color: #ecfffb;
      border-color: rgba(77, 228, 216, 0.25);
      background: rgba(77, 228, 216, 0.08);
    }

    .workspace {
      display: grid;
      grid-template-rows: auto auto minmax(0, 1fr);
      gap: 14px;
      min-width: 0;
      min-height: 0;
    }

    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      padding: 4px 2px 0;
    }

    h1, h2 {
      margin: 0;
      letter-spacing: 0;
    }

    h1 {
      margin-top: 5px;
      font-size: clamp(24px, 3vw, 34px);
      line-height: 1.05;
    }

    h2 { font-size: 20px; }

    .top-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .quiet-button {
      padding: 0 12px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
    }

    .signal-strip {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
      gap: 10px;
    }

    .signal-item {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      min-height: 44px;
      padding: 0 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel-soft);
      color: #eaf5f3;
    }

    .signal-item span {
      color: #cc9d65;
      font-size: 12px;
      white-space: nowrap;
    }

    .signal-item strong {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
    }

    .graph-stage {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) 92px;
      min-height: 0;
      overflow: hidden;
    }

    .graph-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 18px 10px;
    }

    .view-toggle {
      display: flex;
      gap: 2px;
      padding: 3px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel-soft);
    }

    .view-toggle button {
      min-height: 28px;
      padding: 0 11px;
      font-size: 12px;
    }

    .view-toggle .selected {
      color: #06100f;
      background: var(--teal);
    }

    .view-toggle button:hover {
      color: #effffb;
      background: rgba(77, 228, 216, 0.08);
    }

    .view-toggle button.selected:hover {
      color: #06100f;
      background: var(--teal);
    }

    .graph-canvas {
      position: relative;
      min-height: 0;
      margin: 0 14px;
      overflow: hidden;
      border: 1px solid rgba(203, 223, 220, 0.06);
      border-radius: var(--radius);
      background:
        linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
        radial-gradient(circle at 50% 50%, rgba(83, 196, 188, 0.14), transparent 40%),
        rgba(4, 8, 11, 0.52);
      background-size: 42px 42px, 42px 42px, auto, auto;
    }

    .edge-layer {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }

    .edge {
      stroke: rgba(96, 235, 223, 0.42);
      stroke-linecap: round;
    }

    .edge.strong { stroke-width: 0.74; }
    .edge.medium { stroke-width: 0.46; }
    .edge.light {
      stroke-width: 0.28;
      stroke: rgba(145, 176, 173, 0.24);
    }

    .graph-node {
      position: absolute;
      display: grid;
      place-items: center;
      transform: translate(-50%, -50%);
      padding: 8px;
      border: 1px solid rgba(123, 241, 231, 0.3);
      border-radius: 999px;
      background:
        radial-gradient(circle at 35% 20%, rgba(155, 255, 246, 0.34), transparent 36%),
        rgba(18, 41, 44, 0.92);
      color: #effffb;
      box-shadow: 0 0 0 7px rgba(58, 228, 216, 0.035), 0 18px 40px rgba(0, 0, 0, 0.38);
      transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
      cursor: pointer;
    }

    .graph-node span {
      max-width: 92%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 800;
    }

    .graph-node small {
      color: #a7b9b5;
      font-size: 10px;
    }

    .graph-node.selected {
      border-color: rgba(231, 168, 88, 0.68);
      box-shadow: 0 0 0 9px rgba(217, 154, 77, 0.09), 0 0 34px rgba(119, 236, 223, 0.28), 0 18px 40px rgba(0, 0, 0, 0.38);
      transform: translate(-50%, -50%) scale(1.04);
    }

    .graph-node:hover {
      border-color: rgba(119, 236, 223, 0.78);
      box-shadow: 0 0 0 9px rgba(58, 228, 216, 0.08), 0 18px 40px rgba(0, 0, 0, 0.38);
    }

    .graph-node i {
      position: absolute;
      right: 7%;
      top: 8%;
      width: 9px;
      height: 9px;
      border-radius: 999px;
      background: var(--amber);
    }

    .legend-panel {
      position: absolute;
      left: 14px;
      bottom: 14px;
      display: grid;
      gap: 8px;
      width: min(230px, calc(100% - 28px));
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: rgba(7, 11, 15, 0.76);
      color: #aebfbb;
      font-size: 12px;
    }

    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 8px;
      border-radius: 999px;
    }

    .dot.teal { background: var(--teal); }
    .dot.amber { background: var(--amber); }
    .dot.red { background: var(--red); }

    .flow-lane {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      gap: 16px;
      padding: 14px 18px;
    }

    .flow-title {
      display: flex;
      align-items: center;
      gap: 8px;
      color: #b4c5c1;
      font-size: 13px;
      font-weight: 800;
    }

    .flow-track {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      overflow: hidden;
    }

    .flow-step {
      display: flex;
      align-items: center;
      gap: 10px;
      flex: 0 0 auto;
    }

    .flow-block {
      display: grid;
      place-items: center;
      height: 34px;
      max-width: 116px;
      min-width: 48px;
      border-radius: var(--radius);
      color: #07110f;
      font-size: 12px;
      font-weight: 800;
      transition: box-shadow 160ms ease, transform 160ms ease;
    }

    .flow-step[data-edge-id] {
      cursor: pointer;
    }

    .flow-step.selected .flow-block {
      box-shadow: 0 0 0 3px rgba(217, 154, 77, 0.28), 0 0 24px rgba(119, 236, 223, 0.24);
      transform: translateY(-1px);
    }

    .flow-block.anchor { background: #eff5f4; }
    .flow-block.teal { background: var(--teal); }
    .flow-block.amber { background: var(--amber); }

    .evidence-drawer {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 18px;
    }

    .drawer-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .icon-button {
      justify-content: center;
      width: 36px;
      border: 1px solid var(--line);
      background: var(--panel-soft);
    }

    .confidence-card {
      display: grid;
      gap: 13px;
      margin-top: 22px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: var(--radius);
      background: var(--panel-soft);
    }

    .confidence-card > div:first-child {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }

    .confidence-card span {
      color: #a7b9b5;
      font-size: 12px;
    }

    .confidence-card strong {
      color: var(--teal);
      font-size: 28px;
    }

    .meter {
      height: 7px;
      overflow: hidden;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
    }

    .meter span {
      display: block;
      width: var(--confidence-width, 80%);
      height: 100%;
      background: linear-gradient(90deg, var(--teal), var(--amber));
    }

    .policy-grid {
      display: grid;
      gap: 8px;
      margin-top: 14px;
    }

    .policy-chip {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 34px;
      padding: 0 10px;
      border-radius: var(--radius);
      font-size: 12px;
      font-weight: 800;
    }

    .policy-chip.amber {
      color: #ffd9a6;
      background: rgba(217, 154, 77, 0.12);
    }

    .policy-chip.green {
      color: #b7f6d1;
      background: rgba(80, 181, 121, 0.12);
    }

    .policy-chip.muted {
      color: #c5cfcc;
      background: rgba(255, 255, 255, 0.045);
    }

    .source-list {
      display: grid;
      gap: 9px;
      margin-top: 18px;
    }

    .source-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 11px;
      min-height: 58px;
      padding: 10px;
      border: 1px solid rgba(203, 223, 220, 0.07);
      border-radius: var(--radius);
      background: rgba(255, 255, 255, 0.028);
    }

    .source-row strong,
    .source-row span {
      display: block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .source-row strong { font-size: 13px; }

    .source-row span {
      color: #91a5a1;
      font-size: 12px;
    }

    .source-row em {
      color: var(--green);
      font-size: 11px;
      font-style: normal;
    }

    .compact-signal {
      margin-top: auto;
      padding: 14px 0;
      border-top: 1px solid var(--line);
    }

    .signal-heading {
      display: flex;
      align-items: center;
      gap: 8px;
      color: var(--amber);
      font-size: 12px;
      font-weight: 800;
    }

    .compact-signal p {
      margin: 9px 0 0;
      color: #c3cfcc;
      font-size: 13px;
      line-height: 1.45;
    }

    .primary-action {
      justify-content: center;
      width: 100%;
      margin-top: 10px;
      color: #07110f;
      background: var(--teal);
      font-weight: 800;
    }

    @media (max-width: 1050px) {
      body { overflow: auto; }
      .app-shell {
        grid-template-columns: 88px minmax(0, 1fr);
        height: auto;
        min-height: 100vh;
      }
      .brand-lockup div:last-child,
      .nav-item span,
      .watchlist,
      .ticker-search input,
      .evidence-drawer { display: none; }
      .side-rail { align-items: center; padding: 14px; }
      .ticker-search {
        width: 44px;
        justify-content: center;
        padding: 0;
      }
      .nav-item {
        justify-content: center;
        width: 44px;
        padding: 0;
      }
    }

    @media (max-width: 760px) {
      .app-shell {
        grid-template-columns: 1fr;
        padding: 10px;
      }
      .side-rail { display: none; }
      .top-bar, .signal-strip, .flow-lane { grid-template-columns: 1fr; }
      .top-bar {
        align-items: flex-start;
        flex-direction: column;
      }
      .graph-stage {
        min-height: 720px;
        grid-template-rows: auto 1fr auto;
      }
      .flow-lane { align-items: start; }
      .flow-track { flex-wrap: wrap; }
    }
  </style>
</head>
<body>
  <main class="app-shell">
    <aside class="side-rail" aria-label="Workspace navigation">
      <div class="brand-lockup">
        <div class="brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M6 3v6m0 0a3 3 0 1 0 0 6m0-6h7a5 5 0 0 1 5 5v7m0 0-3-3m3 3 3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div>
          <p>StackTrace</p>
          <span>Supply chain alpha</span>
        </div>
      </div>

      <label class="ticker-search">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="m20 20-3.6-3.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <input id="ticker-input" value="NVDA" aria-label="Ticker search">
      </label>

      <nav class="nav-list">
        <button class="nav-item active" data-select-group="nav"><span aria-hidden="true">#</span><span>Network</span></button>
        <button class="nav-item" data-select-group="nav"><span aria-hidden="true">$</span><span>Signals</span></button>
        <button class="nav-item" data-select-group="nav"><span aria-hidden="true">!</span><span>Alerts</span></button>
        <button class="nav-item" data-select-group="nav"><span aria-hidden="true">+</span><span>Policy</span></button>
      </nav>

      <section class="watchlist">
        <div class="section-kicker">Watchlist</div>
        <button class="watch-chip selected" data-select-group="watchlist">NVDA</button>
        <button class="watch-chip" data-select-group="watchlist">AMD</button>
        <button class="watch-chip" data-select-group="watchlist">AAPL</button>
        <button class="watch-chip" data-select-group="watchlist">TSLA</button>
      </section>
    </aside>

    <section class="workspace">
      <header class="top-bar">
        <div>
          <div class="breadcrumb">Supplier Network / Semiconductors</div>
          <h1 id="page-title">NVDA upstream exposure map</h1>
        </div>
        <div class="top-actions">
          <button class="quiet-button">Tier 1-3</button>
          <button class="quiet-button">Live policy flags</button>
        </div>
      </header>

      <div class="signal-strip">
        <div class="signal-item">
          <span>Coattail Signal</span>
          <strong>Advanced packaging capacity tightening</strong>
        </div>
        <div class="signal-item">
          <span>Policy Alert</span>
          <strong>Tariff watch on packaging route</strong>
        </div>
      </div>

      <section class="graph-stage" aria-label="Supplier graph">
        <div class="graph-toolbar">
          <div>
            <p>Supplier Network</p>
            <span>Node Size: Exposure</span>
          </div>
          <div class="view-toggle" aria-label="View mode">
            <button class="selected" data-select-group="view">Network</button>
            <button data-select-group="view">Flow</button>
          </div>
        </div>

        <div class="graph-canvas" id="graph-canvas">
          <svg class="edge-layer" id="edge-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
          <div class="legend-panel">
            <div><span class="dot teal"></span>Verified relationship</div>
            <div><span class="dot amber"></span>Tariff watch</div>
            <div><span class="dot red"></span>Restricted risk</div>
          </div>
        </div>

        <div class="flow-lane">
          <div class="flow-title">
            <span aria-hidden="true">=</span>
            <span>Relationship Flow</span>
          </div>
          <div class="flow-track" id="flow-track"></div>
        </div>
      </section>
    </section>

    <aside class="evidence-drawer" aria-label="Selected relationship evidence">
      <div class="drawer-header">
        <div>
          <div class="section-kicker">Selected Evidence</div>
          <h2 id="selected-name">Select a node</h2>
        </div>
        <button class="icon-button" aria-label="Evidence options">v</button>
      </div>

      <div class="confidence-card">
        <div>
          <span>Confidence</span>
          <strong id="confidence-value">--</strong>
        </div>
        <div class="meter" id="confidence-meter"><span></span></div>
      </div>

      <div class="policy-grid">
        <div class="policy-chip amber">Tariff Watch</div>
        <div class="policy-chip green">OFAC Clear</div>
        <div class="policy-chip muted">Export Clear</div>
      </div>

      <section class="source-list" id="source-list"></section>

      <section class="compact-signal">
        <div class="signal-heading">
          <span aria-hidden="true">*</span>
          <span>Coattail Signal</span>
        </div>
        <p id="signal-copy">Click a supplier node or relationship path to inspect source-backed evidence.</p>
      </section>

      <button class="primary-action">Track relationship</button>
    </aside>
  </main>

  <script id="graph-data" type="application/json">${graphJson}</script>
  <script>
    const graph = JSON.parse(document.getElementById("graph-data").textContent);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const edgeLayer = document.getElementById("edge-layer");
    const graphCanvas = document.getElementById("graph-canvas");
    const selectedName = document.getElementById("selected-name");
    const confidenceValue = document.getElementById("confidence-value");
    const confidenceMeter = document.getElementById("confidence-meter");
    const sourceList = document.getElementById("source-list");
    const signalCopy = document.getElementById("signal-copy");
    const flowTrack = document.getElementById("flow-track");
    const pageTitle = document.getElementById("page-title");
    let selectedEdgeId = "";

    const preferredPositions = [
      { x: 48, y: 48, size: 92 },
      { x: 31, y: 31, size: 70 },
      { x: 66, y: 30, size: 58 },
      { x: 26, y: 66, size: 48 },
      { x: 73, y: 61, size: 45 },
      { x: 49, y: 73, size: 39 },
      { x: 19, y: 45, size: 38 },
      { x: 81, y: 42, size: 34 },
      { x: 58, y: 17, size: 30 },
      { x: 38, y: 82, size: 31 },
    ];

    function sourceNode() {
      return graph.nodes.find((node) => node.kind === "company" || node.ticker === "NVDA") || graph.nodes[0];
    }

    function label(node) {
      if (!node) return "Unknown";
      return node.ticker || node.label.replace(/(Corporation|Company|Limited|Technology|Inc\\.?|Co\\.? Ltd\\.?)/g, "").trim();
    }

    function confidence(edge) {
      return Math.round((edge?.confidence || 0.72) * 100);
    }

    function riskFor(index, edge) {
      if (String(edge?.type || "").includes("packaging") || index === 3) return "watch";
      return "clear";
    }

    function weightFor(index, edge) {
      if (confidence(edge) >= 85) return "strong";
      if (confidence(edge) >= 70) return "medium";
      return "light";
    }

    function renderGraph() {
      const anchor = sourceNode();
      const graphNodes = [anchor, ...graph.edges.filter((edge) => edge.source === anchor.id).map((edge) => nodesById.get(edge.target)).filter(Boolean)];
      const positioned = graphNodes.slice(0, preferredPositions.length).map((node, index) => ({
        ...node,
        edge: graph.edges.find((item) => item.target === node.id),
        ...preferredPositions[index],
      }));

      pageTitle.textContent = (anchor.ticker || label(anchor)) + " upstream exposure map";
      edgeLayer.textContent = "";
      document.querySelectorAll(".graph-node").forEach((node) => node.remove());

      positioned.slice(1).forEach((node, index) => {
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", positioned[0].x);
        line.setAttribute("y1", positioned[0].y);
        line.setAttribute("x2", node.x);
        line.setAttribute("y2", node.y);
        line.setAttribute("class", "edge " + weightFor(index, node.edge));
        edgeLayer.appendChild(line);
      });

      positioned.forEach((node, index) => {
        const button = document.createElement("button");
        button.className = "graph-node" + (index === 1 || index === 3 ? " selected" : "");
        button.style.left = node.x + "%";
        button.style.top = node.y + "%";
        button.style.width = node.size + "px";
        button.style.height = node.size + "px";
        button.setAttribute("aria-label", label(node));
        if (node.edge) button.dataset.edgeId = node.edge.id;
        button.innerHTML = "<span>" + escapeHtml(label(node)) + "</span><small>" + (index === 0 ? "Anchor" : "Tier " + Math.min(index, 3)) + "</small>" + (riskFor(index, node.edge) === "watch" ? "<i></i>" : "");
        if (node.edge) button.addEventListener("click", () => renderEvidence(node.edge));
        graphCanvas.appendChild(button);
      });

      renderFlow(positioned);
      renderEvidence(positioned.find((node) => node.edge)?.edge || graph.edges[0]);
    }

    function renderFlow(positioned) {
      const steps = positioned.slice(0, 5);
      flowTrack.innerHTML = steps.map((node, index) => {
        const tone = index === 0 ? "anchor" : index === 3 ? "amber" : "teal";
        const width = Math.max(48, Math.min(116, node.size + 18));
        const arrow = index < steps.length - 1 ? '<span aria-hidden="true">-&gt;</span>' : "";
        const edgeId = node.edge?.id || "";
        return '<div class="flow-step" ' + (edgeId ? 'data-edge-id="' + escapeHtml(edgeId) + '"' : "") + '><div class="flow-block ' + tone + '" style="width:' + width + 'px">' + escapeHtml(label(node)) + '</div>' + arrow + '</div>';
      }).join("");
      document.querySelectorAll(".flow-step[data-edge-id]").forEach((step) => {
        step.addEventListener("click", () => {
          const edge = graph.edges.find((item) => item.id === step.dataset.edgeId);
          if (edge) renderEvidence(edge);
        });
      });
    }

    function renderEvidence(edge) {
      if (!edge) return;
      selectedEdgeId = edge.id;
      const target = nodesById.get(edge.target);
      const score = confidence(edge);
      const evidence = edge.evidence?.[0] || {};
      selectedName.textContent = label(target);
      confidenceValue.textContent = score;
      confidenceMeter.style.setProperty("--confidence-width", score + "%");
      sourceList.innerHTML = [
        {
          label: [evidence.sourceSystem, evidence.sourceForm].filter(Boolean).join(" / ") || "Primary Source",
          detail: evidence.quote || "Source-backed relationship evidence.",
          status: "Verified",
        },
        {
          label: "Policy Flags",
          detail: "Tariff, OFAC, and export-control overlays ready for live data.",
          status: "Clear",
        },
      ].map((row) => (
        '<article class="source-row"><div><strong>' + escapeHtml(row.label) + '</strong><span>' + escapeHtml(row.detail) + '</span></div><em>' + escapeHtml(row.status) + '</em></article>'
      )).join("");
      signalCopy.textContent = label(target) + " is part of the selected upstream path. Relationship strength is based on evidence count, citation quality, and source recency.";
      updateRelationshipSelection();
    }

    function updateRelationshipSelection() {
      document.querySelectorAll(".graph-node[data-edge-id]").forEach((node) => {
        node.classList.toggle("selected", node.dataset.edgeId === selectedEdgeId);
      });
      document.querySelectorAll(".flow-step[data-edge-id]").forEach((step) => {
        step.classList.toggle("selected", step.dataset.edgeId === selectedEdgeId);
      });
    }

    function wireSelectionGroups() {
      document.querySelectorAll("[data-select-group]").forEach((button) => {
        button.addEventListener("click", () => {
          document.querySelectorAll('[data-select-group="' + button.dataset.selectGroup + '"]').forEach((item) => {
            item.classList.toggle("active", item === button);
            item.classList.toggle("selected", item === button);
          });
        });
      });
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    wireSelectionGroups();
    renderGraph();
  </script>
</body>
</html>`;
}

async function main() {
  const graph = await readGraph();
  await fs.mkdir(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, "edgar-seed.graph.html");
  await fs.writeFile(htmlPath, buildDashboardHtml(graph));
  console.log(`Wrote ${htmlPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
