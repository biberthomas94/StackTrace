const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(process.env.STACKTRACE_DATA_DIR || "./data");
const GRAPH_PATH = path.join(DATA_DIR, "processed", "graphs", "edgar-seed.graph.json");
const OUT_DIR = path.join(DATA_DIR, "processed", "graphs");

function escapeScriptJson(value) {
  return JSON.stringify(value).replaceAll("</script", "<\\/script");
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
      --bg: #061018;
      --panel: rgba(17, 27, 37, 0.86);
      --panel-strong: rgba(22, 34, 46, 0.94);
      --line: rgba(148, 163, 184, 0.16);
      --line-strong: rgba(148, 163, 184, 0.28);
      --text: #f8fafc;
      --muted: #98a8b7;
      --cyan: #2fe5e0;
      --blue: #4f9cf9;
      --green: #3ee86b;
      --amber: #f59e0b;
      --orange: #fb923c;
      --danger: #ef4444;
      --card-radius: 8px;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 48% 34%, rgba(47, 229, 224, 0.08), transparent 34%),
        linear-gradient(135deg, #07141f 0%, #050b11 52%, #07121a 100%);
    }

    button, input, textarea { font: inherit; }
    .app {
      display: grid;
      grid-template-columns: 260px minmax(720px, 1fr) 330px;
      grid-template-rows: 76px minmax(0, 1fr);
      min-height: 100vh;
    }

    .sidebar {
      grid-row: 1 / span 2;
      padding: 18px 16px;
      border-right: 1px solid var(--line);
      background: rgba(3, 10, 16, 0.72);
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 20px;
      font-size: 23px;
      font-weight: 800;
      letter-spacing: 0;
    }

    .logo {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
    }

    .search {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 52px;
      padding: 0 14px;
      border: 1px solid var(--line-strong);
      border-radius: var(--card-radius);
      background: rgba(9, 17, 25, 0.78);
      margin-bottom: 16px;
    }

    .search input {
      width: 100%;
      border: 0;
      outline: 0;
      color: var(--text);
      background: transparent;
      font-size: 15px;
    }

    .side-card, .panel, .evidence-panel, .signal-card {
      border: 1px solid var(--line);
      border-radius: var(--card-radius);
      background: var(--panel);
      box-shadow: 0 18px 60px rgba(0, 0, 0, 0.18);
    }

    .side-card { margin-bottom: 14px; overflow: hidden; }
    .side-header, .policy-row, .watch-row, .alert-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .side-header {
      padding: 14px 14px 10px;
      font-weight: 700;
      font-size: 14px;
    }
    .watch-row {
      padding: 10px 14px;
      color: #d7dee7;
      font-size: 13px;
    }
    .watch-row.active { background: rgba(96, 165, 250, 0.08); }
    .watch-row span:first-child { width: 45px; font-weight: 700; color: #f8fafc; }
    .watch-row span:nth-child(2) { flex: 1; color: #a8b3c0; font-size: 12px; }
    .star { color: #93c5fd; }
    .alert-row {
      padding: 11px 14px;
      border-top: 1px solid var(--line);
      font-size: 12px;
    }
    .alert-title { display: flex; align-items: center; gap: 8px; color: #e5e7eb; font-size: 13px; }
    .alert-sub { margin: 4px 0 0 20px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 176px; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .dot.orange { background: var(--orange); box-shadow: 0 0 18px rgba(251, 146, 60, 0.5); }
    .dot.amber { background: var(--amber); }
    .dot.cyan { background: var(--cyan); }
    .policy-row {
      margin: 8px 12px;
      padding: 11px 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: #d8e1ea;
      font-size: 13px;
      background: rgba(255, 255, 255, 0.02);
    }
    .policy-count { color: var(--amber); font-weight: 800; }
    .review-summary {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      padding: 0 12px 12px;
    }
    .review-stat {
      min-width: 0;
      padding: 10px 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.025);
      text-align: center;
    }
    .review-stat strong { display: block; color: #f8fafc; font-size: 18px; line-height: 1; }
    .review-stat span { display: block; margin-top: 5px; color: var(--muted); font-size: 11px; }
    .review-stat.approved strong { color: var(--green); }
    .review-stat.rejected strong { color: var(--danger); }
    .review-stat.candidate strong { color: var(--amber); }
    .side-footer { position: fixed; left: 28px; bottom: 34px; display: grid; gap: 22px; color: #d7dee7; }
    .footer-link { display: flex; align-items: center; gap: 12px; font-size: 14px; }

    .topbar {
      grid-column: 2 / span 2;
      display: grid;
      grid-template-columns: 1fr 1fr 140px;
      gap: 8px;
      align-items: center;
      padding: 8px 16px 6px;
    }
    .signal-card {
      height: 62px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 16px;
      background: rgba(12, 29, 37, 0.74);
    }
    .signal-card.policy { background: rgba(34, 25, 15, 0.78); border-color: rgba(245, 158, 11, 0.28); }
    .signal-title { font-size: 14px; font-weight: 800; color: #9ff8f4; }
    .signal-card.policy .signal-title { color: #fbbf24; }
    .signal-sub { color: #c9d2dc; font-size: 12px; margin-top: 4px; }
    .top-icons { display: flex; justify-content: flex-end; align-items: center; gap: 22px; color: #cbd5e1; }
    .avatar { width: 38px; height: 38px; border: 1px solid var(--line-strong); border-radius: 50%; display: grid; place-items: center; }

    .main {
      grid-column: 2;
      grid-row: 2;
      padding: 0 14px 30px 16px;
      min-width: 0;
    }
    .panel {
      min-height: calc(100vh - 108px);
      padding: 20px 22px;
      background: linear-gradient(180deg, rgba(18, 30, 42, 0.88), rgba(11, 19, 28, 0.92));
    }
    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .panel-title { font-size: 18px; font-weight: 750; }
    .hint { color: #c4ced8; font-size: 13px; }
    .network-wrap {
      position: relative;
      min-height: 560px;
      border-bottom: 1px solid var(--line);
    }
    .graph-svg { width: 100%; height: 560px; }
    .edge-hit { cursor: pointer; }
    .edge-hit:hover .edge-line, .edge-hit.active .edge-line { stroke-width: 5; opacity: 1; }
    .supplier-node { cursor: pointer; }
    .supplier-node:hover circle, .supplier-node.active circle { stroke-width: 3; filter: drop-shadow(0 0 12px rgba(47,229,224,0.45)); }
    .tool-stack {
      position: absolute;
      left: 0;
      bottom: 12px;
      display: grid;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      overflow: hidden;
      background: rgba(8, 15, 23, 0.72);
    }
    .tool-stack button { width: 36px; height: 34px; border: 0; border-bottom: 1px solid var(--line); color: #dce6ef; background: transparent; cursor: default; }
    .flow-title { margin: 20px 0 12px; font-size: 16px; font-weight: 750; }
    .flow {
      display: grid;
      grid-template-columns: 150px 1fr 1fr 1fr;
      gap: 22px;
      align-items: center;
    }
    .flow-brand { display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 800; }
    .flow-col-title { color: #d7dee7; font-size: 13px; text-align: center; margin-bottom: 10px; }
    .flow-list { display: grid; gap: 8px; }
    .flow-pill {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 11px;
      min-height: 32px;
      border: 1px solid var(--line-strong);
      border-radius: 5px;
      background: linear-gradient(180deg, rgba(34, 46, 58, 0.86), rgba(21, 30, 40, 0.92));
      color: #dce7ee;
      font-size: 13px;
    }
    .flow-pill.hot { border-color: rgba(47, 229, 224, 0.65); background: rgba(20, 89, 92, 0.42); }
    .flow-pill span:last-child { color: #b7c2cc; }
    .review-table-wrap {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid var(--line);
      overflow-x: auto;
    }
    .review-table-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 12px;
    }
    .review-table-title { font-size: 16px; font-weight: 750; }
    .review-filters { display: flex; flex-wrap: wrap; gap: 7px; }
    .review-filters button {
      min-width: 82px;
      height: 32px;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      color: #d8e1ea;
      background: rgba(255,255,255,0.03);
      cursor: pointer;
      font-size: 12px;
      font-weight: 750;
    }
    .review-filters button.active { border-color: var(--cyan); color: #a6fffb; background: rgba(47,229,224,0.12); }
    .review-table {
      width: 100%;
      min-width: 860px;
      border-collapse: collapse;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: var(--card-radius);
      font-size: 13px;
    }
    .review-table th,
    .review-table td {
      padding: 10px 11px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
    }
    .review-table th {
      color: #cbd5e1;
      background: rgba(255,255,255,0.035);
      font-size: 12px;
      font-weight: 800;
      user-select: none;
    }
    .review-table th[data-sort] { cursor: pointer; }
    .review-table tbody tr { background: rgba(255,255,255,0.015); cursor: pointer; }
    .review-table tbody tr:hover,
    .review-table tbody tr.active { background: rgba(47,229,224,0.075); }
    .status-pill {
      display: inline-flex;
      align-items: center;
      min-width: 76px;
      justify-content: center;
      padding: 4px 8px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      text-transform: capitalize;
    }
    .status-pill.approved { color: #86efac; border-color: rgba(62,232,107,0.35); background: rgba(62,232,107,0.08); }
    .status-pill.candidate { color: #fbbf24; border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.08); }
    .status-pill.rejected { color: #fca5a5; border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.08); }
    .source-cell { color: #aebac6; font-size: 12px; line-height: 1.35; }
    .quote-cell { max-width: 320px; color: #c7d0da; line-height: 1.35; }

    .evidence-panel {
      grid-column: 3;
      grid-row: 2;
      margin: 0 16px 30px 0;
      padding: 18px 16px;
      background: linear-gradient(180deg, rgba(15, 25, 36, 0.95), rgba(9, 16, 24, 0.96));
      overflow: auto;
    }
    .evidence-head { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 1px solid var(--line); }
    .selected-company { display: flex; align-items: center; gap: 14px; padding: 16px 0; }
    .chip-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      color: var(--cyan);
      background: rgba(47, 229, 224, 0.12);
      border: 1px solid rgba(47, 229, 224, 0.2);
    }
    .selected-title { font-weight: 750; }
    .selected-sub { color: #b3bfcb; font-size: 13px; line-height: 1.5; margin-top: 4px; }
    .section { padding: 15px 0; border-top: 1px solid var(--line); }
    .section-title { color: #e6edf5; font-weight: 720; font-size: 14px; margin-bottom: 8px; }
    .section-body { color: #c7d0da; font-size: 14px; line-height: 1.5; }
    .estimate { display: flex; justify-content: space-between; align-items: end; }
    .estimate-value { font-size: 22px; color: #f8fafc; }
    .flag-row, .evidence-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      margin-top: 9px;
      background: rgba(255, 255, 255, 0.025);
    }
    .flag-row.tariff { border-color: rgba(245, 158, 11, 0.35); background: rgba(245, 158, 11, 0.08); color: #fbbf24; }
    .flag-row.clear { border-color: rgba(62, 232, 107, 0.22); background: rgba(62, 232, 107, 0.06); color: #65f985; }
    .evidence-card { align-items: flex-start; }
    .evidence-kind { display: flex; gap: 10px; color: #7dd3fc; font-size: 13px; font-weight: 800; }
    .evidence-meta { color: #aebac6; font-size: 12px; margin: 4px 0 0 30px; line-height: 1.35; }
    .verified { color: var(--green); font-size: 12px; }
    .review-controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
    .review-controls button {
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      padding: 8px 4px;
      color: #d8e1ea;
      background: rgba(255,255,255,0.03);
      cursor: pointer;
      font-size: 12px;
      font-weight: 750;
    }
    .review-controls button.active { border-color: var(--cyan); background: rgba(47,229,224,0.14); color: #a6fffb; }
    textarea {
      width: 100%;
      min-height: 70px;
      resize: vertical;
      margin-top: 9px;
      padding: 9px;
      border: 1px solid var(--line-strong);
      border-radius: 6px;
      color: #e5edf5;
      background: rgba(0,0,0,0.18);
      outline: none;
    }
    .view-button {
      width: 100%;
      height: 40px;
      margin-top: 14px;
      border: 1px solid rgba(79, 156, 249, 0.55);
      border-radius: 6px;
      color: #80b9ff;
      background: rgba(79, 156, 249, 0.06);
      cursor: default;
      font-weight: 750;
    }
    .save-state { color: var(--muted); font-size: 12px; margin-top: 8px; min-height: 16px; }
    .review-meta { color: var(--muted); font-size: 12px; margin-top: 8px; line-height: 1.4; }
    .tiny { color: var(--muted); font-size: 12px; }

    @media (max-width: 1180px) {
      .app { grid-template-columns: 230px minmax(600px, 1fr); }
      .evidence-panel { grid-column: 2; grid-row: auto; margin-left: 16px; }
      .topbar { grid-column: 2; grid-template-columns: 1fr; }
      .top-icons { display: none; }
      .review-table-header { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="logo" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
            <path d="M17 3 29 9.8 17 16.5 5 9.8 17 3Z" stroke="#4f9cf9" stroke-width="2"/>
            <path d="M5 16.4 17 23.2l12-6.8M5 23.1 17 30l12-6.9" stroke="#4f9cf9" stroke-width="2"/>
          </svg>
        </div>
        StackTrace
      </div>
      <label class="search">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="#cbd5e1" stroke-width="2"/><path d="m20 20-3.6-3.6" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round"/></svg>
        <input value="NVDA" aria-label="Ticker search">
      </label>
      <section class="side-card">
        <div class="side-header">Watchlist <span class="tiny">+</span></div>
        <div class="watch-row active"><span>NVDA</span><span>NVIDIA Corporation</span><span class="star">★</span></div>
        <div class="watch-row"><span>AMD</span><span>Advanced Micro Devices</span></div>
        <div class="watch-row"><span>AVGO</span><span>Broadcom Inc.</span></div>
        <div class="watch-row"><span>TSM</span><span>Taiwan Semiconductor</span></div>
      </section>
      <section class="side-card">
        <div class="side-header">Alerts <span class="tiny" style="color:#60a5fa">View all</span></div>
        <div class="alert-row"><div><div class="alert-title"><span class="dot orange"></span>Coattail Signal</div><div class="alert-sub">Supplier exposure to NVDA...</div></div><span class="tiny">1m ago</span></div>
        <div class="alert-row"><div><div class="alert-title"><span class="dot amber"></span>Policy Alert</div><div class="alert-sub">Tariff watch: Advanced packaging...</div></div><span class="tiny">8m ago</span></div>
        <div class="alert-row"><div><div class="alert-title"><span class="dot cyan"></span>Earnings</div><div class="alert-sub">NVDA Q1 FY25 earnings call...</div></div><span class="tiny">2h ago</span></div>
      </section>
      <section class="side-card">
        <div class="side-header">Policy Monitor <span class="tiny" style="color:#60a5fa">View all</span></div>
        <div class="policy-row"><span>⚠ Tariff Watch</span><span class="policy-count">3</span></div>
        <div class="policy-row"><span>◎ OFAC Sanctions</span><span style="color:var(--green);font-weight:800">0</span></div>
        <div class="policy-row"><span>⚠ Export Controls</span><span class="policy-count">2</span></div>
      </section>
      <section class="side-card">
        <div class="side-header">Relationship Review <span id="review-total" class="tiny">0 total</span></div>
        <div class="review-summary">
          <div class="review-stat approved"><strong id="approved-count">0</strong><span>Approved</span></div>
          <div class="review-stat candidate"><strong id="candidate-count">0</strong><span>Candidate</span></div>
          <div class="review-stat rejected"><strong id="rejected-count">0</strong><span>Rejected</span></div>
        </div>
      </section>
      <div class="side-footer">
        <div class="footer-link">⚙ Settings</div>
        <div class="footer-link">? Help</div>
      </div>
    </aside>

    <header class="topbar">
      <div class="signal-card">
        <div style="color:var(--cyan)">◎</div>
        <div><div class="signal-title">Coattail Signal</div><div class="signal-sub">Supplier network is positioned to benefit from NVDA →</div></div>
      </div>
      <div class="signal-card policy">
        <div style="color:var(--amber)">⚠</div>
        <div><div class="signal-title">Policy Alert</div><div class="signal-sub">Tariff watch on advanced packaging materials →</div></div>
      </div>
      <div class="top-icons"><span>♧</span><div class="avatar">◎</div></div>
    </header>

    <main class="main">
      <section class="panel">
        <div class="panel-header">
          <div class="panel-title">Supplier Network <span class="tiny">ⓘ</span></div>
          <div class="hint">Node Size: Evidence Weight <span class="tiny">ⓘ</span></div>
        </div>
        <div class="network-wrap">
          <svg id="network-svg" class="graph-svg" viewBox="0 0 920 560" role="img" aria-label="Supplier network graph"></svg>
          <div class="tool-stack" aria-hidden="true"><button>⛶</button><button>+</button><button>−</button><button>▧</button></div>
        </div>
        <div class="flow-title">Relationship Flow <span class="tiny">ⓘ</span></div>
        <div class="flow">
          <div class="flow-brand">
            <svg width="42" height="42" viewBox="0 0 42 42"><rect x="8" y="8" width="26" height="26" rx="4" fill="#76b900"/><path d="M13 21c5-7 14-7 20 0-6 7-15 7-20 0Z" fill="#071018"/><circle cx="23" cy="21" r="5" fill="#76b900"/><circle cx="23" cy="21" r="2.5" fill="#071018"/></svg>
            <div>NVDA</div>
          </div>
          <div><div class="flow-col-title">Tier 1</div><div id="flow-tier-1" class="flow-list"></div></div>
          <div><div class="flow-col-title">Tier 2</div><div id="flow-tier-2" class="flow-list"></div></div>
          <div><div class="flow-col-title">Tier 3</div><div id="flow-tier-3" class="flow-list"></div></div>
        </div>
        <div class="review-table-wrap">
          <div class="review-table-header">
            <div>
              <div class="review-table-title">Relationship Review Queue</div>
              <div class="tiny">Evidence-backed edges, sorted for analyst triage.</div>
            </div>
            <div class="review-filters" aria-label="Review status filters">
              <button data-filter="all" class="active">All</button>
              <button data-filter="candidate">Candidate</button>
              <button data-filter="approved">Approved</button>
              <button data-filter="rejected">Rejected</button>
            </div>
          </div>
          <table class="review-table">
            <thead>
              <tr>
                <th data-sort="company">Company</th>
                <th data-sort="target">Target</th>
                <th data-sort="type">Type</th>
                <th data-sort="date">Source Date</th>
                <th data-sort="status">Status</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody id="relationship-review-body"></tbody>
          </table>
        </div>
      </section>
    </main>

    <aside class="evidence-panel">
      <div class="evidence-head"><div style="font-weight:750">Selected Evidence</div><div class="tiny">×</div></div>
      <div class="selected-company">
        <div class="chip-icon">▣</div>
        <div><div id="selected-name" class="selected-title">Select a node</div><div id="selected-meta" class="selected-sub">Click a supplier node or relationship line.</div></div>
      </div>
      <div class="section">
        <div class="section-title">Relationship to NVDA</div>
        <div id="relationship-copy" class="section-body">Evidence-backed relationships from SEC filings appear here.</div>
      </div>
      <div class="section estimate">
        <div><div class="section-title">Exposure Estimate</div><div class="tiny">(Placeholder until customs/revenue data)</div></div>
        <div id="exposure-estimate" class="estimate-value">N/A</div>
      </div>
      <div class="section">
        <div class="section-title">Policy Flags <span class="tiny">ⓘ</span></div>
        <div class="flag-row tariff"><span>⚠ Tariff Watch</span><span class="tiny">Needs data</span></div>
        <div class="flag-row clear"><span>◎ OFAC Clear</span><span class="tiny">Not checked</span></div>
      </div>
      <div class="section">
        <div class="section-title">Evidence</div>
        <div id="evidence-list"></div>
        <button class="view-button">View All Evidence →</button>
      </div>
      <div class="section">
        <div class="section-title">Review Status</div>
        <div class="review-controls">
          <button data-status="candidate" class="active">Candidate</button>
          <button data-status="approved">Approved</button>
          <button data-status="rejected">Rejected</button>
        </div>
        <textarea id="review-notes" placeholder="Add analyst review notes..."></textarea>
        <div id="review-meta" class="review-meta"></div>
        <div id="save-state" class="save-state"></div>
      </div>
    </aside>
  </div>

  <script id="graph-data" type="application/json">${graphJson}</script>
  <script>
    const embeddedGraph = JSON.parse(document.getElementById("graph-data").textContent);
    let graph = embeddedGraph;
    const nodesById = new Map();
    const statuses = new Map();
    const reviewNotes = new Map();
    let selectedEdge = null;
    let currentReviewFilter = "all";
    let reviewSort = { key: "company", direction: "asc" };
    let notesSaveTimer = null;

    const svg = document.getElementById("network-svg");
    const selectedName = document.getElementById("selected-name");
    const selectedMeta = document.getElementById("selected-meta");
    const relationshipCopy = document.getElementById("relationship-copy");
    const exposureEstimate = document.getElementById("exposure-estimate");
    const evidenceList = document.getElementById("evidence-list");
    const statusButtons = [...document.querySelectorAll("[data-status]")];
    const notesInput = document.getElementById("review-notes");
    const reviewMeta = document.getElementById("review-meta");
    const saveState = document.getElementById("save-state");
    const reviewTotal = document.getElementById("review-total");
    const approvedCount = document.getElementById("approved-count");
    const candidateCount = document.getElementById("candidate-count");
    const rejectedCount = document.getElementById("rejected-count");
    const relationshipReviewBody = document.getElementById("relationship-review-body");
    const reviewFilterButtons = [...document.querySelectorAll("[data-filter]")];
    const sortableHeaders = [...document.querySelectorAll("[data-sort]")];

    const palette = {
      foundry: "#2fe5e0",
      memory_supplier: "#94a3b8",
      contract_manufacturer: "#64748b",
      battery_cell_supplier: "#3ee86b"
    };

    const exposure = {
      "entity:taiwan-semiconductor-manufacturing-company-limited": "$12.6B",
      "entity:samsung-electronics-co-ltd": "$1.8B",
      "entity:sk-hynix-inc": "$4.3B",
      "entity:micron-technology-inc": "$3.0B",
      "entity:hon-hai-precision-industry-co-ltd": "N/A",
      "entity:wistron-corporation": "N/A",
      "entity:fabrinet": "N/A",
      "entity:panasonic": "N/A",
      "entity:contemporary-amperex-technology-co-limited": "N/A"
    };

    const customLabels = {
      "entity:taiwan-semiconductor-manufacturing-company-limited": "TSMC",
      "entity:samsung-electronics-co-ltd": "Samsung Foundry",
      "entity:hon-hai-precision-industry-co-ltd": "Hon Hai / Foxconn",
      "entity:contemporary-amperex-technology-co-limited": "CATL"
    };

    const positions = {
      "company:nvda": { x: 450, y: 285, r: 76 },
      "entity:taiwan-semiconductor-manufacturing-company-limited": { x: 450, y: 100, r: 61 },
      "entity:samsung-electronics-co-ltd": { x: 650, y: 125, r: 50 },
      "entity:sk-hynix-inc": { x: 170, y: 260, r: 53 },
      "entity:micron-technology-inc": { x: 225, y: 410, r: 51 },
      "entity:hon-hai-precision-industry-co-ltd": { x: 675, y: 280, r: 58 },
      "entity:wistron-corporation": { x: 650, y: 405, r: 50 },
      "entity:fabrinet": { x: 780, y: 230, r: 48 },
      "entity:panasonic": { x: 322, y: 118, r: 47 },
      "entity:contemporary-amperex-technology-co-limited": { x: 784, y: 395, r: 50 }
    };

    function label(node) {
      return customLabels[node.id] || node.label.replace(/(Corporation|Company Limited|Technology, Inc.|Electronics Co., Ltd.|Inc\\.)/g, "").trim();
    }

    function tierFor(edge) {
      if (edge.type === "foundry" || edge.type === "memory_supplier" || edge.type === "battery_cell_supplier") return "Tier 1";
      if (edge.type === "contract_manufacturer") return "Tier 2";
      return "Tier 3";
    }

    function reviewFor(edge) {
      return edge.review || {
        edgeId: edge.id,
        status: "candidate",
        notes: "",
        reviewer: "",
        updatedAt: ""
      };
    }

    function sourceDateFor(edge) {
      return edge.evidence?.[0]?.sourceDate || "";
    }

    function sourceLabel(edge) {
      const evidence = edge.evidence?.[0] || {};
      return [evidence.sourceSystem, evidence.sourceForm].filter(Boolean).join(" / ") || "Source evidence";
    }

    function displayType(type) {
      return String(type || "").replaceAll("_", " ");
    }

    function escapeHtml(value) {
      return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    }

    function svgEl(name, attrs = {}) {
      const el = document.createElementNS("http://www.w3.org/2000/svg", name);
      Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
      return el;
    }

    function addText(parent, lines, x, y, options = {}) {
      lines.forEach((line, index) => {
        const text = svgEl("text", {
          x, y: y + index * (options.lineHeight || 18),
          "text-anchor": "middle",
          fill: options.fill || "#f8fafc",
          "font-size": options.size || 14,
          "font-weight": options.weight || 500
        });
        text.textContent = line;
        parent.appendChild(text);
      });
    }

    function wrap(value, max = 14) {
      const words = String(value).split(" ");
      const lines = [];
      let line = "";
      for (const word of words) {
        if ((line + " " + word).trim().length > max && line) {
          lines.push(line);
          line = word;
        } else {
          line = (line + " " + word).trim();
        }
      }
      if (line) lines.push(line);
      return lines.slice(0, 3);
    }

    function drawGraph() {
      svg.textContent = "";
      graph.nodes.forEach((node) => nodesById.set(node.id, node));
      const center = positions["company:nvda"];

      graph.edges.filter((edge) => edge.source === "company:nvda").forEach((edge) => {
        const p = positions[edge.target];
        if (!p) return;
        const color = palette[edge.type] || "#64748b";
        const group = svgEl("g", { class: "edge-hit", "data-edge-id": edge.id });
        const line = svgEl("line", { x1: center.x, y1: center.y, x2: p.x, y2: p.y, stroke: color, "stroke-width": 2, opacity: 0.65, class: "edge-line" });
        const sourceDot = svgEl("circle", { cx: center.x + (p.x - center.x) * 0.36, cy: center.y + (p.y - center.y) * 0.36, r: 5, fill: "#8b949e" });
        const targetDot = svgEl("circle", { cx: center.x + (p.x - center.x) * 0.78, cy: center.y + (p.y - center.y) * 0.78, r: 6, fill: color });
        group.append(line, sourceDot, targetDot);
        group.addEventListener("click", () => selectEdge(edge.id));
        svg.appendChild(group);
      });

      const centerGroup = svgEl("g");
      centerGroup.appendChild(svgEl("circle", { cx: center.x, cy: center.y, r: center.r, fill: "rgba(12,18,26,0.96)", stroke: "#8b949e", "stroke-width": 3 }));
      centerGroup.appendChild(svgEl("rect", { x: center.x - 19, y: center.y - 42, width: 38, height: 26, rx: 4, fill: "#76b900" }));
      addText(centerGroup, ["NVDA"], center.x, center.y + 13, { size: 20, weight: 800 });
      addText(centerGroup, ["NVIDIA Corporation"], center.x, center.y + 39, { size: 13, fill: "#cbd5e1" });
      svg.appendChild(centerGroup);

      graph.nodes.filter((node) => node.id !== "company:nvda" && positions[node.id]).forEach((node) => {
        const p = positions[node.id];
        const edge = graph.edges.find((item) => item.target === node.id && item.source === "company:nvda");
        const color = palette[edge?.type] || "#64748b";
        const hot = edge?.type === "foundry" || node.id === "entity:hon-hai-precision-industry-co-ltd";
        const group = svgEl("g", { class: "supplier-node", "data-edge-id": edge?.id || "" });
        group.appendChild(svgEl("circle", { cx: p.x, cy: p.y, r: p.r, fill: "rgba(12,18,26,0.88)", stroke: hot ? color : "#737b86", "stroke-width": hot ? 2.2 : 1.8 }));
        const display = label(node);
        const lines = wrap(display, 15);
        addText(group, lines, p.x, p.y - (lines.length * 8), { size: 14, weight: 650 });
        addText(group, [exposure[node.id] || "N/A", tierFor(edge || {}).replace(" ", " ")], p.x, p.y + 20, { size: 12, fill: "#cbd5e1", lineHeight: 16 });
        group.addEventListener("click", () => edge && selectEdge(edge.id));
        svg.appendChild(group);
      });
    }

    function renderFlow() {
      const nvdaEdges = graph.edges.filter((edge) => edge.source === "company:nvda");
      const t1 = nvdaEdges.filter((edge) => ["foundry", "memory_supplier"].includes(edge.type)).slice(0, 4);
      const t2 = nvdaEdges.filter((edge) => edge.type === "contract_manufacturer").slice(0, 3);
      const t3 = [];
      const render = (id, edges) => {
        const target = document.getElementById(id);
        target.innerHTML = edges.map((edge, index) => {
          const node = nodesById.get(edge.target);
          const hot = index === 0 || node?.id === "entity:hon-hai-precision-industry-co-ltd";
          return \`<div class="flow-pill \${hot ? "hot" : ""}" data-edge-id="\${edge.id}"><span>\${escapeHtml(label(node))}</span><span>\${escapeHtml(exposure[node.id] || "N/A")}</span></div>\`;
        }).join("") || '<div class="flow-pill"><span>Other</span><span></span></div>';
      };
      render("flow-tier-1", t1);
      render("flow-tier-2", t2);
      render("flow-tier-3", t3);
      document.querySelectorAll(".flow-pill[data-edge-id]").forEach((pill) => {
        pill.addEventListener("click", () => selectEdge(pill.dataset.edgeId));
      });
    }

    function renderReviewSummary() {
      const counts = { approved: 0, candidate: 0, rejected: 0 };
      graph.edges.forEach((edge) => {
        const status = reviewFor(edge).status || "candidate";
        counts[status] = (counts[status] || 0) + 1;
      });
      approvedCount.textContent = counts.approved;
      candidateCount.textContent = counts.candidate;
      rejectedCount.textContent = counts.rejected;
      reviewTotal.textContent = \`\${graph.edges.length} total\`;
    }

    function reviewSortValue(edge, key) {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      if (key === "company") return source?.ticker || source?.label || "";
      if (key === "target") return label(target);
      if (key === "type") return displayType(edge.type);
      if (key === "date") return sourceDateFor(edge);
      if (key === "status") return reviewFor(edge).status || "candidate";
      return "";
    }

    function renderReviewTable() {
      const rows = graph.edges
        .filter((edge) => currentReviewFilter === "all" || reviewFor(edge).status === currentReviewFilter)
        .sort((a, b) => {
          const left = reviewSortValue(a, reviewSort.key);
          const right = reviewSortValue(b, reviewSort.key);
          const result = String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
          return reviewSort.direction === "asc" ? result : -result;
        });

      relationshipReviewBody.innerHTML = rows.map((edge) => {
        const source = nodesById.get(edge.source);
        const target = nodesById.get(edge.target);
        const evidence = edge.evidence?.[0] || {};
        const review = reviewFor(edge);
        const active = selectedEdge?.id === edge.id ? "active" : "";
        return \`
          <tr class="\${active}" data-edge-id="\${escapeHtml(edge.id)}">
            <td><strong>\${escapeHtml(source?.ticker || source?.label || "")}</strong></td>
            <td>\${escapeHtml(label(target))}</td>
            <td>\${escapeHtml(displayType(edge.type))}</td>
            <td><div class="source-cell">\${escapeHtml(sourceDateFor(edge))}<br>\${escapeHtml(sourceLabel(edge))}</div></td>
            <td><span class="status-pill \${escapeHtml(review.status || "candidate")}">\${escapeHtml(review.status || "candidate")}</span></td>
            <td class="quote-cell">\${escapeHtml(evidence.quote || "")}</td>
          </tr>
        \`;
      }).join("") || \`<tr><td colspan="6" class="tiny">No relationships match this filter.</td></tr>\`;

      relationshipReviewBody.querySelectorAll("[data-edge-id]").forEach((row) => {
        row.addEventListener("click", () => selectEdge(row.dataset.edgeId));
      });
    }

    function renderEvidence(edge) {
      const target = nodesById.get(edge.target);
      const source = nodesById.get(edge.source);
      const evidence = edge.evidence?.[0] || {};
      selectedEdge = edge;
      selectedName.textContent = label(target);
      selectedMeta.textContent = \`\${tierFor(edge)} Supplier · \${edge.type.replaceAll("_", " ")}\`;
      relationshipCopy.textContent = \`\${label(target)} is connected to \${source.ticker || source.label} as \${edge.type.replaceAll("_", " ")} based on source-cited SEC evidence.\`;
      exposureEstimate.textContent = exposure[target.id] || "N/A";
      evidenceList.innerHTML = \`
        <div class="evidence-card">
          <div>
            <div class="evidence-kind"><span>▤</span><span>SEC Filing</span></div>
            <div class="evidence-meta">\${escapeHtml(evidence.sourceForm || "")} · \${escapeHtml(evidence.sourceDate || "")}<br>\${escapeHtml(evidence.quote || "")}</div>
          </div>
          <div class="verified">Verified ◎</div>
        </div>
      \`;
      const review = edge.review || { status: "candidate", notes: "" };
      statusButtons.forEach((button) => button.classList.toggle("active", button.dataset.status === review.status));
      notesInput.value = review.notes || "";
      reviewMeta.textContent = review.updatedAt
        ? \`Reviewed by \${review.reviewer || "local-reviewer"} on \${new Date(review.updatedAt).toLocaleString()}\`
        : "Not reviewed yet.";
      saveState.textContent = "";
      document.querySelectorAll("[data-edge-id]").forEach((el) => el.classList.toggle("active", el.dataset.edgeId === edge.id));
      renderReviewTable();
    }

    async function selectEdge(edgeId) {
      const edge = graph.edges.find((item) => item.id === edgeId);
      if (edge) renderEvidence(edge);
    }

    async function loadGraph() {
      try {
        const response = await fetch("/api/graph-with-reviews");
        if (response.ok) graph = await response.json();
      } catch {}
      graph.nodes.forEach((node) => nodesById.set(node.id, node));
      graph.edges.forEach((edge) => {
        statuses.set(edge.id, edge.review?.status || "candidate");
        reviewNotes.set(edge.id, edge.review?.notes || "");
      });
      drawGraph();
      renderFlow();
      renderReviewSummary();
      renderReviewTable();
      selectEdge(graph.edges.find((edge) => edge.source === "company:nvda")?.id || graph.edges[0]?.id);
    }

    async function saveReview(status, options = {}) {
      if (!selectedEdge) return;
      selectedEdge.review = {
        ...(selectedEdge.review || {}),
        status,
        notes: notesInput.value,
        reviewer: "local-reviewer"
      };
      if (!options.skipRender) renderEvidence(selectedEdge);
      saveState.textContent = "Saving...";
      try {
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            edgeId: selectedEdge.id,
            status,
            notes: notesInput.value,
            reviewer: "local-reviewer"
          })
        });
        if (!response.ok) throw new Error(await response.text());
        const savedReview = await response.json();
        selectedEdge.review = savedReview;
        statuses.set(selectedEdge.id, savedReview.status);
        reviewNotes.set(selectedEdge.id, savedReview.notes || "");
        saveState.textContent = "Saved.";
        renderReviewSummary();
        renderReviewTable();
        reviewMeta.textContent = savedReview.updatedAt
          ? \`Reviewed by \${savedReview.reviewer || "local-reviewer"} on \${new Date(savedReview.updatedAt).toLocaleString()}\`
          : "Not reviewed yet.";
      } catch (error) {
        saveState.textContent = "Save failed. Open through http://localhost:4173.";
      }
    }

    statusButtons.forEach((button) => button.addEventListener("click", () => saveReview(button.dataset.status)));
    notesInput.addEventListener("input", () => {
      if (!selectedEdge) return;
      clearTimeout(notesSaveTimer);
      selectedEdge.review = {
        ...(selectedEdge.review || {}),
        status: selectedEdge.review?.status || "candidate",
        notes: notesInput.value,
        reviewer: "local-reviewer"
      };
      notesSaveTimer = setTimeout(() => saveReview(selectedEdge.review.status, { skipRender: true }), 700);
    });
    reviewFilterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        currentReviewFilter = button.dataset.filter;
        reviewFilterButtons.forEach((item) => item.classList.toggle("active", item === button));
        renderReviewTable();
      });
    });
    sortableHeaders.forEach((header) => {
      header.addEventListener("click", () => {
        const key = header.dataset.sort;
        reviewSort = {
          key,
          direction: reviewSort.key === key && reviewSort.direction === "asc" ? "desc" : "asc"
        };
        renderReviewTable();
      });
    });
    loadGraph();
  </script>
</body>
</html>`;
}

async function main() {
  const graph = JSON.parse(await fs.readFile(GRAPH_PATH, "utf8"));
  await fs.mkdir(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, "edgar-seed.graph.html");
  await fs.writeFile(htmlPath, buildDashboardHtml(graph));
  console.log(`Wrote ${htmlPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
