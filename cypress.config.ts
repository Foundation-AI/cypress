import { defineConfig } from "cypress";
import { tasks, initConfig } from "./dev/support/helpers";

export default defineConfig({
  video: false,
  screenshotOnRunFailure: false,
  retries: {
    openMode: 2,
    runMode: 2,
  },
  e2e: {
    baseUrl: "https://extract-dev-frontend.foundationai.com",
    specPattern: "dev/e2e/**/*.cy.ts",
    supportFile: "dev/support/e2e.ts",
    setupNodeEvents(on, config) {
      initConfig(config);
      on("task", tasks);
    },
  },
});
