import { Client } from "pg";

let _config: Cypress.PluginConfigOptions | null = null;

export function setConfig(config: Cypress.PluginConfigOptions) {
  _config = config;
}

function env(key: string): string {
  return _config?.env?.[key] ?? process.env[`CYPRESS_${key}`] ?? "";
}

export async function getDbClient(): Promise<Client> {
  const client = new Client({
    host: env("DB_HOST"),
    port: Number(env("DB_PORT")) || 5432,
    database: env("DB_NAME") || "xtract",
    user: env("DB_USER"),
    password: env("DB_PASSWORD"),
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}
