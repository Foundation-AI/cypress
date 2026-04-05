/// <reference types="node" />

let _config: Cypress.PluginConfigOptions | null = null;

export function setFilevineConfig(config: Cypress.PluginConfigOptions) {
  _config = config;
}

function env(key: string): string {
  return _config?.env?.[key] ?? process.env[`CYPRESS_${key}`] ?? "";
}

async function getFilevineAccessToken(): Promise<{
  accessToken: string;
  orgId: string;
  userId: string;
}> {
  const params = new URLSearchParams({
    grant_type: "personal_access_token",
    client_id: env("FILEVINE_CLIENT_ID"),
    client_secret: env("FILEVINE_CLIENT_SECRET"),
    token: env("FILEVINE_PAT"),
    scope: env("FILEVINE_SCOPE"),
  });

  const resp = await fetch("https://identity.filevine.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    throw new Error(
      `Filevine auth failed: ${resp.status} ${await resp.text()}`
    );
  }

  const data = await resp.json();
  return {
    accessToken: data.access_token,
    orgId: env("FILEVINE_ORG_ID"),
    userId: env("FILEVINE_USER_ID"),
  };
}

export async function filevineRequest(
  method: string,
  path: string,
  body?: any
): Promise<any> {
  const { accessToken, orgId, userId } = await getFilevineAccessToken();
  const apiUrl = env("FILEVINE_API_URL");
  const url = path.startsWith("http") ? path : `${apiUrl}${path}`;

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-fv-orgid": orgId,
      "x-fv-userid": userId,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: resp.status,
    body: resp.status !== 204 ? await resp.json().catch(() => null) : null,
  };
}
