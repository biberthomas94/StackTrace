export async function fetchStackTraceGraph(baseUrl = "") {
  const response = await fetch(`${baseUrl}/api/graph-with-reviews`);
  if (!response.ok) throw new Error(`Failed to fetch graph: ${response.status}`);
  return response.json();
}

export async function fetchApprovedStackTraceGraph(baseUrl = "") {
  const response = await fetch(`${baseUrl}/api/graph/approved`);
  if (!response.ok) throw new Error(`Failed to fetch approved graph: ${response.status}`);
  return response.json();
}

export async function saveRelationshipReview({ edgeId, status, notes = "", reviewer = "local-reviewer" }, baseUrl = "") {
  const response = await fetch(`${baseUrl}/api/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edgeId, status, notes, reviewer }),
  });
  if (!response.ok) throw new Error(`Failed to save review: ${response.status}`);
  return response.json();
}

export function toReactFlowElements(graph) {
  return {
    nodes: graph.nodes.map((node, index) => ({
      id: node.id,
      type: node.type === "public_company" ? "companyNode" : "entityNode",
      position: node.position || {
        x: node.type === "public_company" ? 0 : 420,
        y: index * 90,
      },
      data: node,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.type.replaceAll("_", " "),
      data: edge,
      animated: edge.review?.status === "candidate",
      style: {
        stroke:
          edge.review?.status === "approved"
            ? "#0f766e"
            : edge.review?.status === "rejected"
              ? "#dc2626"
              : "#64748b",
      },
    })),
  };
}
