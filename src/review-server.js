const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(process.env.STACKTRACE_DATA_DIR || "./data");
const PORT = Number(process.env.STACKTRACE_REVIEW_PORT || 4173);
const GRAPH_PATH = path.join(DATA_DIR, "processed", "graphs", "edgar-seed.graph.json");
const HTML_PATH = path.join(DATA_DIR, "processed", "graphs", "edgar-seed.graph.html");
const REVIEWS_PATH = path.join(DATA_DIR, "processed", "reviews", "relationship-reviews.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function send(res, statusCode, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(body);
}

function sendJson(res, statusCode, value) {
  send(res, statusCode, JSON.stringify(value, null, 2));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function getReviews() {
  return readJsonIfExists(REVIEWS_PATH, {
    generatedAt: new Date().toISOString(),
    schemaVersion: "0.1",
    reviews: {},
  });
}

function mergeReviewsIntoGraph(graph, reviews) {
  const reviewMap = reviews.reviews || {};
  return {
    ...graph,
    edges: graph.edges.map((edge) => ({
      ...edge,
      review: reviewMap[edge.id] || {
        edgeId: edge.id,
        status: "candidate",
        notes: "",
        reviewer: "",
        updatedAt: "",
      },
    })),
  };
}

function approvedOnly(graphWithReviews) {
  const approvedEdges = graphWithReviews.edges.filter((edge) => edge.review?.status === "approved");
  const nodeIds = new Set(approvedEdges.flatMap((edge) => [edge.source, edge.target]));
  return {
    ...graphWithReviews,
    nodes: graphWithReviews.nodes.filter((node) => nodeIds.has(node.id)),
    edges: approvedEdges,
  };
}

async function upsertReview(payload) {
  const allowedStatuses = new Set(["candidate", "approved", "rejected"]);
  if (!payload.edgeId) throw new Error("edgeId is required.");
  if (!allowedStatuses.has(payload.status)) throw new Error("status must be candidate, approved, or rejected.");

  const reviews = await getReviews();
  reviews.updatedAt = new Date().toISOString();
  reviews.reviews[payload.edgeId] = {
    edgeId: payload.edgeId,
    status: payload.status,
    notes: payload.notes || "",
    reviewer: payload.reviewer || "local-reviewer",
    updatedAt: reviews.updatedAt,
  };
  await writeJson(REVIEWS_PATH, reviews);
  return reviews.reviews[payload.edgeId];
}

async function serveFile(res, filePath) {
  const content = await fs.readFile(filePath);
  send(res, 200, content, MIME_TYPES[path.extname(filePath)] || "application/octet-stream");
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "GET" && url.pathname === "/") {
    await serveFile(res, HTML_PATH);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/graph") {
    await serveFile(res, GRAPH_PATH);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/graph-with-reviews") {
    const graph = await readJsonIfExists(GRAPH_PATH, { nodes: [], edges: [] });
    const reviews = await getReviews();
    sendJson(res, 200, mergeReviewsIntoGraph(graph, reviews));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/graph/approved") {
    const graph = await readJsonIfExists(GRAPH_PATH, { nodes: [], edges: [] });
    const reviews = await getReviews();
    sendJson(res, 200, approvedOnly(mergeReviewsIntoGraph(graph, reviews)));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/reviews") {
    sendJson(res, 200, await getReviews());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/reviews") {
    const review = await upsertReview(await readBody(req));
    sendJson(res, 200, review);
    return;
  }

  sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    sendJson(res, 500, { error: error.message });
  });
});

server.listen(PORT, () => {
  console.log(`StackTrace review server running at http://localhost:${PORT}`);
  console.log(`Reviews persist to ${REVIEWS_PATH}`);
});
