import { defineConfig } from "cypress";
import { tasks, initConfig } from "./cypress/support/helpers";

export default defineConfig({
  video: false,
  screenshotOnRunFailure: false,
  retries: {
    openMode: 2,
    runMode: 2,
  },
  e2e: {
    baseUrl: "https://extract-dev-frontend.foundationai.com",
    setupNodeEvents(on, config) {
      initConfig(config);
      on("task", tasks);
    },
  },
});
