import LoginPage from "../../../../support/pages/Login";
import {
  extractCredentials,
  filevineConfig,
  testData,
} from "../../../../support/config/testCredentials";

const loginPage = new LoginPage();
// eslint-disable-next-line cypress/unsafe-to-chain-command
const EXTRACT_BACKEND_URL = Cypress.env("EXTRACT_BACKEND_URL");

describe("Send Document to Filevine Workflow", () => {
  let accessToken: string;

  beforeEach(() => {
    loginPage.visit();
    loginPage.loginUser(
      extractCredentials.email,
      extractCredentials.password
    );

    loginPage.getAccessToken().then((token) => {
      accessToken = token;
    });
  });

  describe("Retrigger downstream push", () => {
    it("should reset doc status, retrigger downstream, and verify document in Filevine", () => {
      // Step 1: Reset the document's downstream status so it can be re-sent
      cy.task("resetDownstreamDocStatus", {
        docId: testData.docId,
        caseId: testData.caseId,
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
          retrigger_case_ids: [testData.caseId],
          customer_id: filevineConfig.customerId,
        },
      }).then((response) => {
        expect(response.status).to.eq(200);
        cy.task("log", `Retrigger response: ${JSON.stringify(response.body)}`);
      });

      // Step 3: Poll downstream_status until the document is processed
      cy.task(
        "pollDownstreamStatus",
        {
          docId: testData.docId,
          maxAttempts: 30,
          intervalMs: 5000,
        },
        { timeout: 180000 }
      ).then((result: any) => {
        expect(result.status).to.eq("Processed");
        cy.task(
          "log",
          `Document processed after ${result.attempts} polling attempts`
        );
      });

      // Step 4: Verify document exists in Filevine via API
      cy.task("verifyFilevineDocument", {
        projectId: "14384",
        documentName: "Correspondence",
      }).then((result: any) => {
        expect(result.found, "Document should exist in Filevine").to.be.true;
        cy.task(
          "log",
          `Verified document in Filevine: ${result.filename} (ID: ${result.documentId})`
        );

        // Step 5: Delete the document from Filevine to reset for next run
        cy.task("deleteFilevineDocument", {
          documentId: result.documentId,
        }).then((deleteResult: any) => {
          expect(deleteResult.success, "Document should be deleted").to.be
            .true;
          cy.task("log", "Document deleted from Filevine successfully");
        });
      });
    });
  });
});
