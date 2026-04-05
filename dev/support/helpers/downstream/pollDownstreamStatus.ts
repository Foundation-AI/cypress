import { getDbClient } from "../db";

export async function pollDownstreamStatus({
  docId,
  maxAttempts = 30,
  intervalMs = 5000,
}: {
  docId: string;
  maxAttempts?: number;
  intervalMs?: number;
}) {
  const client = await getDbClient();
  try {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await client.query(
        `SELECT doc_downstream_status FROM downstream_status WHERE doc_id = $1`,
        [docId]
      );
      const status = result.rows[0]?.doc_downstream_status;
      if (status === "Processed") {
        return { status: "Processed", attempts: i + 1 };
      }
      if (i < maxAttempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    return { status: "timeout", attempts: maxAttempts };
  } finally {
    await client.end();
  }
}
