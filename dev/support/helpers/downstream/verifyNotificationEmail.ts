import { getDbClient } from "../db";

export async function verifyNotificationEmail({
  docId,
  customerId,
  expectedRecipient,
  expectedSubjectContains,
  afterIso,
  maxAttempts = 18,
  intervalMs = 5000,
}: {
  docId: string;
  customerId: number;
  expectedRecipient: string;
  expectedSubjectContains: string;
  afterIso: string;
  maxAttempts?: number;
  intervalMs?: number;
}) {
  const client = await getDbClient();
  try {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await client.query(
        `SELECT request_id, email_to_id, actual_subject, status, sent_datetime
           FROM email_request
          WHERE customer_id = $1
            AND doc_id = $2
            AND created_datetime >= $3::timestamptz
            AND email_to_id ILIKE $4
            AND actual_subject ILIKE $5
          ORDER BY request_id DESC
          LIMIT 1`,
        [
          customerId,
          docId,
          afterIso,
          `%${expectedRecipient}%`,
          `%${expectedSubjectContains}%`,
        ]
      );
      const row = result.rows[0];
      if (row) {
        return {
          found: true,
          requestId: row.request_id,
          recipient: row.email_to_id,
          subject: row.actual_subject,
          status: row.status,
          sentDatetime: row.sent_datetime,
          attempts: i + 1,
        };
      }
      if (i < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    return { found: false, attempts: maxAttempts };
  } finally {
    await client.end();
  }
}
