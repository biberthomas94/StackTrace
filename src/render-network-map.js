const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(process.env.STACKTRACE_DATA_DIR || "./data");
const GRAPH_PATH = path.join(DATA_DIR, "processed", "graphs", "edgar-seed.graph.json");
const OUT_DIR = path.join(DATA_DIR, "processed", "graphs");

const COLORS = {
  public_company: "#0f766e",
  foundry: "#2563eb",
  memory_supplier: "#7c3aed",
  contract_manufacturer: "#ea580c",
  battery_cell_supplier: "#16a34a",
  edge: "#64748b",
  text: "#111827",
  muted: "#475569",
  bg: "#f8fafc",
};

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(text, maxChars = 28) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = `${line} ${word}`.trim();
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function layout(graph) {
  const companies = graph.nodes.filter((node) => node.type === "public_company");
  const byCompany = new Map(companies.map((company) => [company.id, []]));

  for (const edge of graph.edges) {
    byCompany.get(edge.source)?.push(edge);
  }

  const positions = new Map();
  const width = 1280;
  const leftX = 180;
  const rightX = 850;
  let y = 120;

  for (const company of companies) {
    const edges = byCompany.get(company.id) || [];
    const groupHeight = Math.max(170, edges.length * 74);
    const companyY = y + groupHeight / 2 - 30;
    positions.set(company.id, { x: leftX, y: companyY });

    edges.forEach((edge, index) => {
      positions.set(edge.target, {
        x: rightX,
        y: y + 40 + index * 74,
      });
    });

    y += groupHeight + 72;
  }

  return { positions, width, height: y + 50 };
}

function nodeSvg(node, pos) {
  const isCompany = node.type === "public_company";
  const width = isCompany ? 230 : 310;
  const height = isCompany ? 76 : 62;
  const fill = isCompany ? COLORS.public_company : "#ffffff";
  const stroke = isCompany ? COLORS.public_company : "#cbd5e1";
  const textColor = isCompany ? "#ffffff" : COLORS.text;
  const lines = wrapText(node.label, isCompany ? 24 : 34);
  const subtitle = isCompany ? node.ticker : (node.aliases || []).join(", ");

  const lineSvg = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : 18;
      return `<tspan x="${pos.x}" dy="${dy}">${esc(line)}</tspan>`;
    })
    .join("");

  return `
    <g>
      <rect x="${pos.x - width / 2}" y="${pos.y - height / 2}" width="${width}" height="${height}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${pos.x}" y="${pos.y - (lines.length > 1 ? 10 : 4)}" text-anchor="middle" font-size="${isCompany ? 17 : 15}" font-weight="700" fill="${textColor}">${lineSvg}</text>
      ${subtitle ? `<text x="${pos.x}" y="${pos.y + height / 2 - 13}" text-anchor="middle" font-size="12" fill="${isCompany ? "#ccfbf1" : COLORS.muted}">${esc(subtitle)}</text>` : ""}
    </g>`;
}

function edgeSvg(edge, positions) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);
  const color = COLORS[edge.type] || COLORS.edge;
  const startX = source.x + 115;
  const endX = target.x - 155;
  const c1 = startX + 120;
  const c2 = endX - 120;
  const midX = (startX + endX) / 2;
  const midY = (source.y + target.y) / 2;

  return `
    <g class="edge-group" data-edge-id="${esc(edge.id)}" tabindex="0" role="button" aria-label="${esc(edge.type.replaceAll("_", " "))}">
      <path d="M ${startX} ${source.y} C ${c1} ${source.y}, ${c2} ${target.y}, ${endX} ${target.y}" fill="none" stroke="${color}" stroke-width="2.5" opacity="0.86"/>
      <circle cx="${endX}" cy="${target.y}" r="4" fill="${color}"/>
      <rect class="edge-label" x="${midX - 88}" y="${midY - 15}" width="176" height="30" rx="6" fill="#ffffff" stroke="#e2e8f0"/>
      <text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="12" font-weight="700" fill="${color}">${esc(edge.type.replaceAll("_", " "))}</text>
    </g>`;
}

function legendSvg(x, y) {
  const items = [
    ["foundry", COLORS.foundry],
    ["memory supplier", COLORS.memory_supplier],
    ["contract manufacturer", COLORS.contract_manufacturer],
    ["battery cell supplier", COLORS.battery_cell_supplier],
  ];

  return `
    <g>
      <text x="${x}" y="${y}" font-size="14" font-weight="700" fill="${COLORS.text}">Relationship Types</text>
      ${items
        .map(([label, color], index) => {
          const itemY = y + 28 + index * 24;
          return `<circle cx="${x + 6}" cy="${itemY - 4}" r="5" fill="${color}"/><text x="${x + 20}" y="${itemY}" font-size="13" fill="${COLORS.muted}">${esc(label)}</text>`;
        })
        .join("")}
    </g>`;
}

function renderSvg(graph) {
  const { positions, width, height } = layout(graph);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>
  <text x="54" y="54" font-size="28" font-weight="800" fill="${COLORS.text}">StackTrace EDGAR Seed Network</text>
  <text x="54" y="82" font-size="14" fill="${COLORS.muted}">Initial evidence-backed supplier and manufacturing relationships extracted from SEC 10-K filings.</text>
  ${legendSvg(1010, 50)}
  ${graph.edges.map((edge) => edgeSvg(edge, positions)).join("\n")}
  ${graph.nodes.map((node) => nodeSvg(node, positions.get(node.id))).join("\n")}
  <text x="54" y="${height - 32}" font-size="12" fill="${COLORS.muted}">Each edge maps to source evidence in edgar-seed.graph.json. Current confidence: verified from single SEC source.</text>
</svg>`;
}

function renderHtml(svg) {
  const graphJson = JSON.stringify(JSON.parse(svg.graphSource), null, 2).replaceAll("</script", "<\\/script");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>StackTrace EDGAR Seed Network</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, sans-serif; background: #f8fafc; color: #111827; }
    main { display: grid; grid-template-columns: minmax(0, 1fr) 360px; min-height: 100vh; }
    .canvas { overflow: auto; }
    svg { width: 100%; height: auto; display: block; }
    .edge-group { cursor: pointer; outline: none; }
    .edge-group:hover path, .edge-group:focus path { stroke-width: 4; opacity: 1; }
    .edge-group:hover .edge-label, .edge-group:focus .edge-label { stroke: #0f172a; }
    aside { border-left: 1px solid #e2e8f0; background: #ffffff; padding: 22px; position: sticky; top: 0; height: 100vh; overflow: auto; }
    .eyebrow { color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; }
    h1 { font-size: 20px; margin: 8px 0 8px; line-height: 1.2; }
    .muted { color: #64748b; font-size: 13px; line-height: 1.45; }
    .field { margin-top: 18px; }
    .label { color: #475569; font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .value { margin-top: 6px; font-size: 14px; line-height: 1.45; }
    blockquote { margin: 8px 0 0; padding: 12px; border-left: 3px solid #0f766e; background: #f8fafc; font-size: 13px; line-height: 1.45; }
    code { font-size: 12px; white-space: pre-wrap; word-break: break-word; color: #334155; }
    .pill { display: inline-flex; align-items: center; min-height: 24px; padding: 2px 8px; border-radius: 999px; background: #ecfeff; color: #0f766e; font-size: 12px; font-weight: 700; }
    .status-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
    .status-row button { border: 1px solid #cbd5e1; background: #fff; border-radius: 6px; padding: 8px 6px; cursor: pointer; font-size: 12px; font-weight: 700; color: #334155; }
    .status-row button.active { border-color: #0f766e; background: #ccfbf1; color: #115e59; }
    @media (max-width: 900px) {
      main { grid-template-columns: 1fr; }
      aside { position: static; height: auto; border-left: 0; border-top: 1px solid #e2e8f0; }
    }
  </style>
</head>
<body>
  <main>
    <section class="canvas">
${svg.markup}
    </section>
    <aside>
      <div class="eyebrow">Evidence Drawer</div>
      <h1 id="drawer-title">Select an edge</h1>
      <p id="drawer-subtitle" class="muted">Click a relationship label or line to inspect the source evidence behind that map connection.</p>

      <div class="field">
        <div class="label">Review Status</div>
        <div class="status-row">
          <button data-status="candidate" class="active">Candidate</button>
          <button data-status="approved">Approved</button>
          <button data-status="rejected">Rejected</button>
        </div>
      </div>

      <div id="drawer-body"></div>
    </aside>
  </main>
  <script id="graph-data" type="application/json">${graphJson}</script>
  <script>
    const graph = JSON.parse(document.getElementById("graph-data").textContent);
    const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
    const statuses = new Map();
    const notes = new Map();
    const title = document.getElementById("drawer-title");
    const subtitle = document.getElementById("drawer-subtitle");
    const body = document.getElementById("drawer-body");
    const statusButtons = [...document.querySelectorAll("[data-status]")];
    let selectedEdgeId = null;
    const canPersist = location.protocol.startsWith("http");

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    async function saveReview(status) {
      if (!selectedEdgeId) return;
      statuses.set(selectedEdgeId, status);
      statusButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.status === status);
      });
      const noteInput = document.getElementById("review-notes");
      const noteValue = noteInput ? noteInput.value : "";
      notes.set(selectedEdgeId, noteValue);

      const saveState = document.getElementById("save-state");
      if (!canPersist) {
        if (saveState) saveState.textContent = "Open through http://localhost:4173 to save review decisions.";
        return;
      }

      if (saveState) saveState.textContent = "Saving...";
      try {
        const response = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            edgeId: selectedEdgeId,
            status,
            notes: noteValue,
            reviewer: "local-reviewer"
          })
        });
        if (!response.ok) throw new Error(await response.text());
        if (saveState) saveState.textContent = "Saved.";
      } catch (error) {
        if (saveState) saveState.textContent = "Save failed: " + error.message;
      }
    }

    function renderEdge(edge) {
      const source = nodesById.get(edge.source);
      const target = nodesById.get(edge.target);
      const evidence = edge.evidence?.[0] || {};
      selectedEdgeId = edge.id;
      const currentStatus = statuses.get(edge.id) || "candidate";
      statusButtons.forEach((button) => {
        button.classList.toggle("active", button.dataset.status === currentStatus);
      });

      title.textContent = source.label + " -> " + target.label;
      subtitle.textContent = edge.type.replaceAll("_", " ") + " | " + edge.confidence.replaceAll("_", " ");
      body.innerHTML = \`
        <div class="field">
          <div class="label">Relationship</div>
          <div class="value"><span class="pill">\${escapeHtml(edge.type.replaceAll("_", " "))}</span></div>
        </div>
        <div class="field">
          <div class="label">Direction</div>
          <div class="value">\${escapeHtml(source.label)} uses / depends on \${escapeHtml(target.label)}</div>
        </div>
        <div class="field">
          <div class="label">Confidence</div>
          <div class="value">\${escapeHtml(edge.confidence.replaceAll("_", " "))}</div>
        </div>
        <div class="field">
          <div class="label">Evidence Quote</div>
          <blockquote>\${escapeHtml(evidence.quote || "No quote attached.")}</blockquote>
        </div>
        <div class="field">
          <div class="label">Source</div>
          <div class="value">\${escapeHtml(evidence.sourceSystem || "")} \${escapeHtml(evidence.sourceForm || "")} | \${escapeHtml(evidence.sourceDate || "")}</div>
        </div>
        <div class="field">
          <div class="label">Local Source Path</div>
          <div class="value"><code>\${escapeHtml(evidence.sourcePath || "")}\${evidence.sourceLine ? ":" + evidence.sourceLine : ""}</code></div>
        </div>
        <div class="field">
          <div class="label">Review Notes</div>
          <textarea id="review-notes" rows="4" style="width:100%; margin-top:8px; border:1px solid #cbd5e1; border-radius:6px; padding:8px; font:13px Arial, sans-serif;">\${escapeHtml(notes.get(edge.id) || "")}</textarea>
          <div id="save-state" class="muted" style="margin-top:8px;">\${canPersist ? "Review changes save when you choose a status." : "Open through http://localhost:4173 to save review decisions."}</div>
        </div>
      \`;
    }

    async function loadReviews() {
      if (!canPersist) return;
      try {
        const response = await fetch("/api/reviews");
        if (!response.ok) return;
        const payload = await response.json();
        for (const review of Object.values(payload.reviews || {})) {
          statuses.set(review.edgeId, review.status || "candidate");
          notes.set(review.edgeId, review.notes || "");
        }
      } catch {
        // The graph still works without persistence.
      }
    }

    document.querySelectorAll("[data-edge-id]").forEach((element) => {
      const edge = graph.edges.find((item) => item.id === element.dataset.edgeId);
      element.addEventListener("click", () => renderEdge(edge));
      element.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          renderEdge(edge);
        }
      });
    });

    statusButtons.forEach((button) => {
      button.addEventListener("click", () => saveReview(button.dataset.status));
    });

    loadReviews();
  </script>
</body>
</html>`;
}

async function main() {
  const graph = JSON.parse(await fs.readFile(GRAPH_PATH, "utf8"));
  const svg = renderSvg(graph);
  const htmlInput = { markup: svg, graphSource: JSON.stringify(graph) };
  await fs.mkdir(OUT_DIR, { recursive: true });
  const svgPath = path.join(OUT_DIR, "edgar-seed.graph.svg");
  const htmlPath = path.join(OUT_DIR, "edgar-seed.graph.html");
  await fs.writeFile(svgPath, svg);
  await fs.writeFile(htmlPath, renderHtml(htmlInput));
  console.log(`Wrote ${svgPath}`);
  console.log(`Wrote ${htmlPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
