import { setConfig } from "./db";
import { setFilevineConfig } from "./downstream/filevine/auth";
import { setNeostellaConfig } from "./downstream/neostella/auth";
import * as downstreamTasks from "./downstream";
import * as filevineTasks from "./downstream/filevine";
import * as neostellaTasks from "./downstream/neostella";

export const tasks = {
  log(message: string) {
    console.log(message);
    return null;
  },
  ...downstreamTasks,
  ...filevineTasks,
  ...neostellaTasks,
};

export function initConfig(config: Cypress.PluginConfigOptions) {
  setConfig(config);
  setFilevineConfig(config);
  setNeostellaConfig(config);
}
