import LoginPage from "../../../../support/pages/Login";
import {
  extractNeostellaCredentials,
  neostellaConfig,
  neostellaTestData,
} from "../../../../support/config/testCredentials";

const loginPage = new LoginPage();
// eslint-disable-next-line cypress/unsafe-to-chain-command
const EXTRACT_BACKEND_URL = Cypress.env("EXTRACT_BACKEND_URL");

const PUSH_FILE_PIPELINE_ID = 2113;
const SEND_EMAIL_PIPELINE_ID = 2114;
const NEOSTELLA_UI_BASE = "https://neostella.app";

describe("Send Document to Neostella Workflow", () => {
  let accessToken: string;

  beforeEach(() => {
    loginPage.visit();
    loginPage.loginUser(
      extractNeostellaCredentials.email,
      extractNeostellaCredentials.password
    );

    loginPage.getAccessToken().then((token) => {
      accessToken = token;
    });
  });

  describe("Retrigger downstream push", () => {
    it("should reset doc status, retrigger downstream, and verify document + email in Neostella", () => {
      // Record the approximate retrigger start time for the email_request search window.
      const retriggerStartIso = new Date(Date.now() - 30_000).toISOString();
      // Captured in Step 4, asserted in Step 5 once the new Neostella document_id is known.
      let emailResponse:
        | {
            file_url: string;
            matter_home_url: string;
            file_name: string;
            matter_id: string;
          }
        | undefined;

      // Step 1: Reset the document's downstream status so it can be re-sent
      cy.task("resetDownstreamDocStatus", {
        docId: neostellaTestData.docId,
        caseId: neostellaTestData.caseId,
      }).then((result: any) => {
        expect(result.success).to.be.true;
        cy.task("log", "Document status reset successfully");
      });

      // Step 2: Call retrigger_downstream endpoint
      cy.request({
        method: "POST",
        url: `${EXTRACT_BACKEND_URL}/retrigger_downstream`,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: {
          retrigger_case_ids: [neostellaTestData.caseId],
          customer_id: neostellaConfig.customerId,
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        expect(response.body.retriggered_downstream_cases).to.deep.eq([
          neostellaTestData.caseId,
        ]);
        cy.task(
          "log",
          `Retrigger response: ${JSON.stringify(response.body)}`
        );
      });

      // Step 3: Poll downstream_status until the document is processed
      cy.task(
        "pollDownstreamStatus",
        {
          docId: neostellaTestData.docId,
          maxAttempts: 36,
          intervalMs: 5000,
        },
        { timeout: 240000 }
      ).then((result: any) => {
        expect(result.status).to.eq("Processed");
        cy.task(
          "log",
          `Document processed after ${result.attempts} polling attempts`
        );
      });

      // Step 4: Verify di_audit has 200 responses for push_file_to_neostella + email pipelines,
      // and capture the email pipeline's response JSON for URL assertions in Step 5.
      cy.task("verifyDiAuditSuccess", {
        docId: neostellaTestData.docId,
        caseId: neostellaTestData.caseId,
        pipelineIds: [PUSH_FILE_PIPELINE_ID, SEND_EMAIL_PIPELINE_ID],
        afterIso: retriggerStartIso,
      }).then((result: any) => {
        expect(
          result.success,
          `di_audit missing 200 rows for pipelines: ${JSON.stringify(
            result.missing
          )}`
        ).to.be.true;
        const emailRow = result.rows.find(
          (r: any) => r.pipeline_id === SEND_EMAIL_PIPELINE_ID
        );
        expect(emailRow, "send_email di_audit row").to.exist;
        emailResponse = JSON.parse(emailRow.response_message);
        cy.task(
          "log",
          `di_audit verified: 200 response for pipelines ${result.foundPipelines.join(", ")}`
        );
      });

      // Step 5: Verify doc exists in Neostella, assert email URL shape, then clean up.
      cy.task("verifyNeostellaDocument", {
        projectId: neostellaTestData.projectId,
        documentName: neostellaTestData.documentName,
      }).then((result: any) => {
        expect(
          result.found,
          `Document ${neostellaTestData.documentName} should exist in Cypress-Test`
        ).to.be.true;
        cy.task(
          "log",
          `Verified document in Neostella: ${result.filename} (ID: ${result.documentId})`
        );

        // Assert the email's deep-link URLs match the new Neostella doc + project.
        expect(emailResponse, "emailResponse captured in Step 4").to.exist;
        const expectedFileUrl = `${NEOSTELLA_UI_BASE}/core/projects/${neostellaTestData.projectId}/documents/${result.documentId}?documentDetailsTabs.tab=overview`;
        const expectedMatterUrl = `${NEOSTELLA_UI_BASE}/core/projects/${neostellaTestData.projectId}/documents?documentsTabs.tab=all-documents`;
        expect(
          emailResponse!.file_url,
          "email file_url should deep-link to the new Neostella document"
        ).to.eq(expectedFileUrl);
        expect(
          emailResponse!.matter_home_url,
          "email matter_home_url should point at the project documents tab"
        ).to.eq(expectedMatterUrl);
        cy.task(
          "log",
          `Email URLs verified: file_url=${emailResponse!.file_url}, matter_home_url=${emailResponse!.matter_home_url}`
        );

        // Cleanup: delete the document so the test is repeatable
        cy.task("deleteNeostellaDocument", {
          documentId: result.documentId,
        }).then((del: any) => {
          expect(del.success, "Document should be deleted").to.be.true;
          cy.task("log", "Document deleted from Neostella");
        });
      });

      // Step 6: Verify the notification email was queued + sent via email_request
      const expectedSubject = `${neostellaTestData.documentName} was added to ${neostellaTestData.projectName} - ${neostellaTestData.tag}`;
      cy.task(
        "verifyNotificationEmail",
        {
          docId: neostellaTestData.docId,
          customerId: neostellaConfig.customerId,
          expectedRecipient: neostellaTestData.emailRecipient,
          expectedSubjectContains: expectedSubject,
          afterIso: retriggerStartIso,
          maxAttempts: 18,
          intervalMs: 5000,
        },
        { timeout: 120000 }
      ).then((result: any) => {
        expect(
          result.found,
          `email_request row for doc ${neostellaTestData.docId} with recipient ${neostellaTestData.emailRecipient} should exist`
        ).to.be.true;
        expect(result.status).to.eq("SENT");
        cy.task(
          "log",
          `Notification email row found: "${result.subject}" to ${result.recipient} (SENT at ${result.sentDatetime})`
        );
      });
    });
  });
});
