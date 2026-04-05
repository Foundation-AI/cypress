import { filevineRequest } from "./auth";

export async function deleteFilevineDocument({
  documentId,
}: {
  documentId: number;
}) {
  const result = await filevineRequest("DELETE", `/documents/${documentId}`);
  return {
    success: result.status === 200 || result.status === 204,
    status: result.status,
  };
}
