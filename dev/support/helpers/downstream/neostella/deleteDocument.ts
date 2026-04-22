import { neostellaRequest } from "./auth";

export async function deleteNeostellaDocument({
  documentId,
}: {
  documentId: string;
}) {
  const result = await neostellaRequest(
    "DELETE",
    `/v1/documents/${documentId}`
  );
  return {
    success: result.status === 200 || result.status === 204,
    status: result.status,
  };
}
