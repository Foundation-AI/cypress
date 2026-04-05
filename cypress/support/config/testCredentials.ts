export const extractCredentials = {
  get email() { return Cypress.env("EXTRACT_EMAIL") as string; },
  get password() { return Cypress.env("EXTRACT_PASSWORD") as string; },
};

export const filevineConfig = {
  customerId: 4094,
};

export const testData = {
  caseId: 269471,
  docId: "1484819",
};
