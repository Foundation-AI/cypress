/// <reference types="node" />

let _config: Cypress.PluginConfigOptions | null = null;

export function setNeostellaConfig(config: Cypress.PluginConfigOptions) {
  _config = config;
}

function env(key: string): string {
  return _config?.env?.[key] ?? process.env[`CYPRESS_${key}`] ?? "";
}

let _cachedToken: { token: string; expiresAt: number } | null = null;

async function getNeostellaAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.expiresAt) {
    return _cachedToken.token;
  }

  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env("NEOSTELLA_CLIENT_ID"),
    client_secret: env("NEOSTELLA_CLIENT_SECRET"),
  });

  const resp = await fetch(env("NEOSTELLA_TOKEN_URL"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!resp.ok) {
    throw new Error(
      `Neostella auth failed: ${resp.status} ${await resp.text()}`
    );
  }

  const data = await resp.json();
  const expiresIn = Number(data.expires_in ?? 3600);
  _cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (expiresIn - 60) * 1000,
  };
  return _cachedToken.token;
}

export async function neostellaRequest(
  method: string,
  path: string,
  body?: any
): Promise<{ status: number; body: any }> {
  const token = await getNeostellaAccessToken();
  const apiUrl = env("NEOSTELLA_API_URL");
  const url = path.startsWith("http") ? path : `${apiUrl}${path}`;

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    status: resp.status,
    body: resp.status !== 204 ? await resp.json().catch(() => null) : null,
  };
}
