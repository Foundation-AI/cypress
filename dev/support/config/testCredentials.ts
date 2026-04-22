export const extractCredentials = {
  get email() { return Cypress.env("EXTRACT_EMAIL") as string; },
  get password() { return Cypress.env("EXTRACT_PASSWORD") as string; },
};

export const extractNeostellaCredentials = {
  get email() { return Cypress.env("EXTRACT_NEOSTELLA_PMS_EMAIL") as string; },
  get password() { return Cypress.env("EXTRACT_NEOSTELLA_PMS_PASSWORD") as string; },
};

export const filevineConfig = {
  customerId: 4094,
};

export const testData = {
  caseId: 269471,
  docId: "1484819",
};

export const neostellaConfig = {
  customerId: 5084,
};

export const neostellaTestData = {
  caseId: 270005,
  docId: "1486748",
  projectId: "96f49864-6cc7-49d4-b344-af48e3f8f526",
  documentName: "Referral Ltr.pdf",
  projectName: "Cypress-Test",
  tag: "Medical Records",
  emailRecipient: "sahil.c@foundationai.com",
};
