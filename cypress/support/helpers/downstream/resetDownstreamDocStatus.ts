import { getDbClient } from "../db";

export async function resetDownstreamDocStatus({
  docId,
  caseId,
}: {
  docId: string;
  caseId: number;
}) {
  const client = await getDbClient();
  try {
    await client.query(
      `UPDATE di_audit SET response_code = 500 WHERE case_id = $1 AND doc_id = $2`,
      [caseId, docId]
    );
    await client.query(
      `UPDATE downstream_status SET doc_downstream_status = 'Processing Failed' WHERE doc_id = $1`,
      [docId]
    );
    return { success: true };
  } finally {
    await client.end();
  }
}
