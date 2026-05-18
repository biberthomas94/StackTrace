const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_DIR = path.resolve(process.env.STACKTRACE_DATA_DIR || "./data");
const INPUT = path.join(DATA_DIR, "seeds", "edgar-relationships.json");
const OUTPUT_DIR = path.join(DATA_DIR, "processed", "graphs");

function stableId(prefix, value) {
  return `${prefix}:${String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function addNode(nodes, node) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
}

function edgeId(relationship) {
  return stableId(
    "edge",
    [
      relationship.sourceTicker,
      relationship.targetName,
      relationship.relationshipType,
      relationship.sourceDate,
    ].join("-"),
  );
}

function toGraph(relationships) {
  const nodes = new Map();
  const edges = [];

  for (const relationship of relationships) {
    const sourceId = stableId("company", relationship.sourceTicker);
    const targetId = stableId("entity", relationship.targetName);

    addNode(nodes, {
      id: sourceId,
      type: "public_company",
      label: relationship.sourceName,
      ticker: relationship.sourceTicker,
    });

    addNode(nodes, {
      id: targetId,
      type: "supply_chain_entity",
      label: relationship.targetName,
      aliases: relationship.targetAliases || [],
    });

    edges.push({
      id: edgeId(relationship),
      source: sourceId,
      target: targetId,
      type: relationship.relationshipType,
      direction: relationship.direction,
      confidence: relationship.confidence,
      evidence: [
        {
          sourceSystem: relationship.sourceSystem,
          sourceForm: relationship.sourceForm,
          sourceDate: relationship.sourceDate,
          sourcePath: relationship.sourcePath,
          sourceLine: relationship.sourceLine,
          quote: relationship.evidenceQuote,
        },
      ],
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    schemaVersion: "0.1",
    nodes: [...nodes.values()],
    edges,
  };
}

async function main() {
  const relationships = JSON.parse(await fs.readFile(INPUT, "utf8"));
  const graph = toGraph(relationships);
  await ensureDir(OUTPUT_DIR);
  const outputPath = path.join(OUTPUT_DIR, "edgar-seed.graph.json");
  await fs.writeFile(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
  console.log(`Wrote ${outputPath}`);
  console.log(`${graph.nodes.length} nodes, ${graph.edges.length} edges`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
