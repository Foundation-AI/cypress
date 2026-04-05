import { filevineRequest } from "./auth";

export async function verifyFilevineDocument({
  projectId,
  documentName,
}: {
  projectId: string;
  documentName: string;
}) {
  const result = await filevineRequest(
    "GET",
    `/projects/${projectId}/documents?limit=50`
  );
  if (result.status !== 200) {
    return { found: false, error: `API returned ${result.status}` };
  }
  const docs = result.body?.items || [];
  const match = docs.find((d: any) => d.filename?.includes(documentName));
  return {
    found: !!match,
    documentId: match?.documentId?.native || null,
    filename: match?.filename || null,
    totalDocs: docs.length,
  };
}
