import { getDbClient } from "../db";

export async function verifyDiAuditSuccess({
  docId,
  caseId,
  pipelineIds,
  afterIso,
}: {
  docId: string;
  caseId: number;
  pipelineIds: number[];
  afterIso?: string;
}) {
  const client = await getDbClient();
  try {
    const result = await client.query(
      `SELECT pipeline_id, response_code, response_message
         FROM di_audit
        WHERE case_id = $1 AND doc_id = $2
          AND pipeline_id = ANY($3::int[])
          AND response_code = 200
          AND ($4::timestamptz IS NULL OR created_date >= $4::timestamptz)`,
      [caseId, docId, pipelineIds, afterIso ?? null]
    );
    const foundPipelines = result.rows.map((r: any) => r.pipeline_id);
    const missing = pipelineIds.filter((p) => !foundPipelines.includes(p));
    return {
      success: missing.length === 0,
      foundPipelines,
      missing,
      rows: result.rows,
    };
  } finally {
    await client.end();
  }
}
