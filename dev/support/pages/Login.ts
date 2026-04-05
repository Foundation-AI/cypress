import { loginSelectors } from "../selectors/login";

export class LoginPage {
  visit() {
    cy.visit("/");
  }

  loginUser(email: string, password: string) {
    const selectors = { ...loginSelectors };
    cy.origin(
      "https://accounts-dev.foundationai.com",
      { args: { email, password, selectors } },
      ({ email, password, selectors }) => {
        cy.get(selectors.usernameInput).clear().type(email);
        cy.get(selectors.continueButton).click();

        cy.get(selectors.providerSelection, { timeout: 10000 }).should(
          "be.visible"
        );
        cy.contains(selectors.passwordProvider, "Password").click();

        cy.get(selectors.passwordInput, { timeout: 10000 }).should(
          "be.visible"
        );
        cy.get(selectors.passwordInput).clear().type(password, { log: false });
        cy.get(selectors.continueButton).click();
      }
    );
  }

  getAccessToken(): Cypress.Chainable<string> {
    cy.intercept("POST", "**/protocol/openid-connect/token").as(
      "tokenExchange"
    );
    cy.visit("/dashboard");
    return cy
      .wait("@tokenExchange", { timeout: 15000 })
      .then((interception) => {
        const token = interception.response?.body?.access_token;
        expect(token, "access_token from token exchange").to.exist;
        return token;
      });
  }
}

export default LoginPage;
