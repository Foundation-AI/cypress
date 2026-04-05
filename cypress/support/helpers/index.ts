import { setConfig } from "./db";
import { setFilevineConfig } from "./downstream/filevine/auth";
import * as downstreamTasks from "./downstream";
import * as filevineTasks from "./downstream/filevine";

export const tasks = {
  log(message: string) {
    console.log(message);
    return null;
  },
  ...downstreamTasks,
  ...filevineTasks,
};

export function initConfig(config: Cypress.PluginConfigOptions) {
  setConfig(config);
  setFilevineConfig(config);
}
