beforeEach(() => {
  cy.on('uncaught:exception', () => {
    return false;
  });
});
