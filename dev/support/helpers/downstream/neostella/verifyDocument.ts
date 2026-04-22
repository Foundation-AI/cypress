import { neostellaRequest } from "./auth";

export async function verifyNeostellaDocument({
  projectId,
  documentName,
}: {
  projectId: string;
  documentName: string;
}) {
  const result = await neostellaRequest("POST", "/v1/documents/list", {
    page: 0,
    page_size: 50,
    filters: {
      logical_operator: "and",
      items: [
        { field: "projects", operator: "in", value: [projectId] },
      ],
    },
  });

  if (result.status !== 200) {
    return { found: false, error: `API returned ${result.status}` };
  }

  const docs = result.body?.documents || [];
  // Multiple docs with the same filename can exist from prior test runs where cleanup
  // failed partway. Pick the most recently created match so assertions line up with
  // the doc pushed by the current retrigger.
  const matches = docs
    .filter((d: any) => d.name?.includes(documentName))
    .sort((a: any, b: any) => (b.created ?? 0) - (a.created ?? 0));
  const match = matches[0];
  return {
    found: !!match,
    documentId: match?.document_id || null,
    filename: match?.name || null,
    totalDocs: docs.length,
    totalMatches: matches.length,
  };
}
