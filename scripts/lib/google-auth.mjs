/**
 * GitHub OIDC → Google Workload Identity Federation → service-account access
 * token. No long-lived credential exists anywhere in this path.
 *
 * WHY BY HAND, rather than google-github-actions/auth:
 *
 *   The whole point of this design is that no durable Google credential is
 *   stored in GitHub. Handing the short-lived exchange to a third-party action
 *   would put a step with network access between the OIDC token and the Play
 *   API, which is precisely the position a supply-chain compromise wants. The
 *   exchange is three HTTP calls and they are all here, readable, with nothing
 *   between them. deploy.yml already hand-rolls the Pages deployment for the
 *   same reason.
 *
 * THE THREE CALLS:
 *
 *   1. Ask the Actions runtime for an OIDC JWT whose `aud` is the workload
 *      identity provider. GitHub signs it; its `sub` carries the repository and
 *      ref, which is what Google's attribute condition matches on.
 *   2. Exchange that JWT at Google STS for a federated access token.
 *   3. Use the federated token to impersonate the Play service account, asking
 *      for the `androidpublisher` scope only, for ten minutes only.
 *
 * NOTHING HERE IS PRINTED. Tokens are returned, never logged; error bodies from
 * Google are truncated and scrubbed before they reach a log, because a failed
 * exchange can echo the subject token back.
 */

const STS_ENDPOINT = 'https://sts.googleapis.com/v1/token';
const IAM_CREDENTIALS = 'https://iamcredentials.googleapis.com/v1';

/** The only scope this project ever needs. Not cloud-platform. */
export const ANDROIDPUBLISHER_SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

/**
 * Anything Google returns on failure may quote what we sent it. Strip
 * JWT-shaped and token-shaped runs before any of it reaches a log.
 */
export const scrub = (text) =>
  String(text)
    .replace(/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '«jwt redacted»')
    .replace(/ya29\.[A-Za-z0-9._-]+/g, '«access token redacted»')
    .slice(0, 800);

async function postJson(url, body, { headers = {}, attempts = 3 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      });
    } catch (error) {
      // Network-level failure: no response at all, so nothing was accepted.
      lastError = new Error(`${url} was unreachable: ${scrub(error.message)}`);
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      throw lastError;
    }

    if (response.ok) return response.json();

    const detail = scrub(await response.text());
    // 4xx is a configuration problem — retrying cannot fix a wrong audience or
    // a missing IAM binding, and retrying a rejected credential just looks like
    // an attack in Google's audit log.
    if (response.status < 500) {
      throw new Error(`${url} refused the request (HTTP ${response.status}): ${detail}`);
    }
    lastError = new Error(`${url} failed (HTTP ${response.status}): ${detail}`);
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  throw lastError;
}

/**
 * Step 1 — the GitHub-signed OIDC token. Requires `id-token: write` on the job;
 * without it the runtime supplies no request URL at all, which is the error
 * worth naming explicitly because the symptom is otherwise a blank variable.
 */
export async function githubOidcToken(audience) {
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!requestUrl || !requestToken) {
    throw new Error(
      'No GitHub OIDC token is available. The job needs `permissions: id-token: write`; ' +
        'nothing else can supply this token, and there is deliberately no fallback credential.',
    );
  }

  const url = new URL(requestUrl);
  url.searchParams.set('audience', audience);
  const response = await fetch(url, { headers: { authorization: `Bearer ${requestToken}` } });
  if (!response.ok) {
    throw new Error(`GitHub refused to mint an OIDC token (HTTP ${response.status})`);
  }
  const { value } = await response.json();
  if (!value) throw new Error('GitHub returned an empty OIDC token');
  return value;
}

/**
 * Steps 2 and 3. `workloadIdentityProvider` is the full resource name:
 *   projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>
 */
export async function playAccessToken({
  workloadIdentityProvider,
  serviceAccount,
  audience = `https://iam.googleapis.com/${workloadIdentityProvider}`,
  lifetimeSeconds = 600,
} = {}) {
  if (!workloadIdentityProvider) throw new Error('workloadIdentityProvider is required');
  if (!serviceAccount) throw new Error('serviceAccount is required');
  if (!/^projects\/\d+\/locations\/global\/workloadIdentityPools\/[^/]+\/providers\/[^/]+$/.test(workloadIdentityProvider)) {
    throw new Error(
      `PLAY_WORKLOAD_IDENTITY_PROVIDER is not a provider resource name: "${workloadIdentityProvider}". ` +
        'Expected projects/<number>/locations/global/workloadIdentityPools/<pool>/providers/<provider>.',
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
    throw new Error(`PLAY_SERVICE_ACCOUNT is not a service-account email: "${serviceAccount}"`);
  }

  const subjectToken = await githubOidcToken(audience);

  // The STS exchange must ask for cloud-platform: it is the scope that permits
  // the impersonation call below. The narrow androidpublisher scope is applied
  // to the token that actually talks to Play.
  const federated = await postJson(STS_ENDPOINT, {
    audience: `//iam.googleapis.com/${workloadIdentityProvider}`,
    grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
    requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
    subjectToken,
  });
  if (!federated.access_token) {
    throw new Error('Google STS returned no access token for the GitHub OIDC assertion');
  }

  const impersonated = await postJson(
    `${IAM_CREDENTIALS}/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    { scope: [ANDROIDPUBLISHER_SCOPE], lifetime: `${lifetimeSeconds}s` },
    { headers: { authorization: `Bearer ${federated.access_token}` } },
  );
  if (!impersonated.accessToken) {
    throw new Error(`Impersonating ${serviceAccount} produced no access token`);
  }
  return impersonated.accessToken;
}
