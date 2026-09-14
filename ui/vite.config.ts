import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// In-memory token cache for Apigee Management API
let cachedToken = ''
let tokenExpiry = 0

async function getGcpAccessToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < tokenExpiry) {
    return cachedToken
  }

  // 1. Check for Service Account Key File
  const keyPaths = [
    process.env.APIGEE_SA_KEY_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'apigee-ui-mgmt-sa-key.json'),
    path.resolve(process.cwd(), '../apigee-ui-mgmt-sa-key.json'),
  ].filter(Boolean) as string[];

  for (const keyPath of keyPaths) {
    if (fs.existsSync(keyPath)) {
      try {
        const keyData = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (keyData.client_email && keyData.private_key) {
          const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
          const nowSec = Math.floor(Date.now() / 1000);
          const payload = Buffer.from(
            JSON.stringify({
              iss: keyData.client_email,
              scope: 'https://www.googleapis.com/auth/cloud-platform',
              aud: 'https://oauth2.googleapis.com/token',
              exp: nowSec + 3600,
              iat: nowSec,
            })
          ).toString('base64url');

          const signer = crypto.createSign('RSA-SHA256');
          signer.update(`${header}.${payload}`);
          const signature = signer.sign(keyData.private_key, 'base64url');
          const jwt = `${header}.${payload}.${signature}`;

          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
              assertion: jwt,
            }),
          });

          if (tokenRes.ok) {
            const data = await tokenRes.json();
            if (data.access_token) {
              cachedToken = data.access_token;
              tokenExpiry = now + 50 * 60 * 1000; // Cache for 50 minutes
              return cachedToken;
            }
          }
        }
      } catch (err: any) {
        console.warn(`[Vite Server] Failed SA key auth at ${keyPath}:`, err.message);
      }
    }
  }

  // 2. Query Cloud Run / Compute Metadata Server (for Cloud Run deployments)
  try {
    const metaRes = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } }
    );
    if (metaRes.ok) {
      const metaData = await metaRes.json();
      if (metaData.access_token) {
        cachedToken = metaData.access_token;
        const expiresInSec = metaData.expires_in || 3600;
        tokenExpiry = now + Math.max(300, expiresInSec - 300) * 1000;
        return cachedToken;
      }
    }
  } catch {
    // Not running on Cloud Run / GCE
  }

  // 3. Fallback to gcloud SA impersonation or print-access-token
  try {
    try {
      cachedToken = execSync(
        'gcloud auth print-access-token --impersonate-service-account=apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com 2>/dev/null'
      )
        .toString()
        .trim();
    } catch {
      cachedToken = execSync('gcloud auth print-access-token').toString().trim();
    }
    tokenExpiry = now + 4 * 60 * 1000;
    return cachedToken;
  } catch (err: any) {
    console.error('[Vite Server] Failed to get gcloud auth token:', err.message);
    return '';
  }
}

// In-memory identity token cache for SSO local testing
let cachedIdToken = ''
let cachedIdEmail = ''
let cachedIdName = ''
let idTokenExpiry = 0

function getGcpIdentityToken(): { token: string; email: string; name: string } {
  const now = Date.now()
  if (cachedIdToken && now < idTokenExpiry) {
    return { token: cachedIdToken, email: cachedIdEmail, name: cachedIdName }
  }
  try {
    const rawToken = execSync('gcloud auth print-identity-token 2>/dev/null').toString().trim()
    if (rawToken) {
      cachedIdToken = rawToken
      idTokenExpiry = now + 4 * 60 * 1000 // Cache for 4 minutes
      try {
        const payload = JSON.parse(Buffer.from(rawToken.split('.')[1], 'base64').toString('utf8'))
        cachedIdEmail = payload.email || ''
        cachedIdName = payload.name || payload.given_name || (payload.email ? payload.email.split('@')[0] : '')
      } catch {
        cachedIdEmail = ''
        cachedIdName = ''
      }
      return { token: cachedIdToken, email: cachedIdEmail, name: cachedIdName }
    }
  } catch (err: any) {
    console.warn('[Vite Server] Note: gcloud identity token not available:', err.message)
  }
  return { token: '', email: '', name: '' }
}

async function fetchAppConsumerKey(org: string, token: string, devEmail: string, appName: string): Promise<string> {
  try {
    const res = await fetch(
      `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(devEmail)}/apps/${encodeURIComponent(appName)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const cred = data.credentials?.find((c: any) => c.status === 'approved') || data.credentials?.[0];
      return cred?.consumerKey || '';
    }
  } catch (err: any) {
    console.warn(`[Vite Server] Failed to fetch key for ${appName}:`, err.message);
  }
  return '';
}

async function provisionUserDeveloperAndApp(
  org: string,
  token: string,
  email: string,
  name: string
): Promise<{ apiKey: string; apiKeys: Record<string, string>; username: string }> {
  if (!email || !token) {
    return { apiKey: '', apiKeys: {}, username: '' };
  }

  const username = email.split('@')[0] || 'admin';
  const nameParts = name.trim().split(' ').filter(Boolean);
  const firstName = nameParts[0] || username;
  const lastName = nameParts.slice(1).join(' ') || 'User';
  const apiKeys: Record<string, string> = { admin: '', sales_agent: '', loans_agent: '' };

  try {
    // 1. Check if Developer exists; if not create Developer
    const devUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}`;
    const devRes = await fetch(devUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (devRes.status === 404) {
      console.log(`[Vite Server] Developer ${email} not found. Creating...`);
      await fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          userName: username,
        }),
      });
    }

    // 2. Provision/fetch user-specific Admin app (Unified Admin <USERNAME> App)
    const targetAppName = `Unified Admin ${username} App`;
    const appsUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/apps?expand=true`;
    const appsRes = await fetch(appsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const appsList = appsRes.ok ? (await appsRes.json()).app || [] : [];

    let matchedApp = appsList.find(
      (a: any) =>
        a.name === targetAppName ||
        a.name.startsWith(targetAppName)
    );

    if (!matchedApp) {
      console.log(`[Vite Server] Creating app ${targetAppName} for ${email}...`);
      const createAppRes = await fetch(
        `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/apps`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: targetAppName,
            displayName: targetAppName,
            apiProducts: ['Enterprise AI Tier', 'Enterprise Tools MCP'],
            attributes: [
              { name: 'DisplayName', value: targetAppName },
              { name: 'persona', value: 'admin' },
            ],
          }),
        }
      );
      if (createAppRes.ok) {
        matchedApp = await createAppRes.json();
      }
    } else {
      // Ensure products are attached and displayName is set
      const existingProducts = new Set<string>();
      if (matchedApp.credentials) {
        for (const cred of matchedApp.credentials) {
          if (cred.apiProducts) {
            for (const p of cred.apiProducts) {
              existingProducts.add(p.apiproduct);
            }
          }
        }
      }
      const requiredProducts = ['Enterprise AI Tier', 'Enterprise Tools MCP'];
      const missingProducts = requiredProducts.filter((p) => !existingProducts.has(p));
      const hasDisplayNameAttr = matchedApp.attributes?.some(
        (a: any) => (a.name === 'DisplayName' || a.name === 'displayName') && a.value
      );

      if (missingProducts.length > 0 || !hasDisplayNameAttr) {
        console.log(`[Vite Server] Ensuring app ${matchedApp.name} has required products and displayName...`);
        const updatedProducts = Array.from(new Set([...existingProducts, ...requiredProducts]));
        const existingAttrs = matchedApp.attributes || [];
        const mergedAttrs = existingAttrs.filter((a: any) => a.name !== 'DisplayName' && a.name !== 'displayName');
        mergedAttrs.unshift({ name: 'DisplayName', value: matchedApp.name });

        await fetch(
          `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/apps/${encodeURIComponent(matchedApp.name)}`,
          {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: matchedApp.name,
              displayName: matchedApp.name,
              apiProducts: updatedProducts,
              attributes: mergedAttrs,
            }),
          }
        );
      }
    }

    if (matchedApp && matchedApp.credentials) {
      const approvedCred = matchedApp.credentials.find((c: any) => c.status === 'approved') || matchedApp.credentials[0];
      if (approvedCred && approvedCred.consumerKey) {
        apiKeys.admin = approvedCred.consumerKey;
      }
    }

    // 3. Fetch existing global keys for Sales and Loans apps
    const defaultDevEmail = 'maloosatyam@google.com';
    apiKeys.sales_agent = await fetchAppConsumerKey(org, token, defaultDevEmail, 'Unified Sales App');
    apiKeys.loans_agent = await fetchAppConsumerKey(org, token, defaultDevEmail, 'Unified Loans App');

    // 4. Check if developer is a prepaid user; if not register as prepaid, add $20 starting balance
    const cfgUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/monetizationConfig`;
    const cfgRes = await fetch(cfgUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (cfgRes.ok) {
      const cfgData = await cfgRes.json();
      if (cfgData.billingType !== 'PREPAID') {
        console.log(`[Vite Server] Setting monetizationConfig PREPAID for ${email}...`);
        await fetch(cfgUrl, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ billingType: 'PREPAID' }),
        });
      }
    } else if (cfgRes.status === 404) {
      console.log(`[Vite Server] Initializing monetizationConfig PREPAID for ${email}...`);
      await fetch(cfgUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ billingType: 'PREPAID' }),
      });
    }

    // Check balance
    const balUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/balance`;
    const balRes = await fetch(balUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    let needsInitialTopup = true;
    if (balRes.ok) {
      const balData = await balRes.json();
      const wallets = balData.wallets || [];
      if (wallets.length > 0 && wallets[0].balance) {
        const units = parseInt(wallets[0].balance.units || '0', 10);
        if (units > 0 || wallets[0].lastCreditTime) {
          needsInitialTopup = false;
        }
      }
    }

    if (needsInitialTopup) {
      console.log(`[Vite Server] Adding $20 starting balance for developer ${email}...`);
      const creditUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/balance:credit`;
      await fetch(creditUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactionAmount: { currencyCode: 'USD', units: '20', nanos: 0 },
          transactionId: `init-topup-20-${Date.now()}`,
        }),
      });
    }

    return { apiKey: apiKeys.admin || '', apiKeys, username };
  } catch (err: any) {
    console.error('[Vite Server] Error provisioning user developer and apps:', err.message);
    return { apiKey: '', apiKeys: {}, username };
  }
}

function getApigeeTimeRange(rangeParam: string): string {
  const now = new Date();
  let days = 7;
  if (rangeParam === '24h') days = 1;
  else if (rangeParam === '30d') days = 30;

  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  const fmt = (d: Date) => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${fmt(start)}~${fmt(now)}`;
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'iap-me-endpoint',
        configureServer(server) {
          server.middlewares.use('/api/me', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            if (parsedUrl.searchParams.get('refresh') === 'true') {
              idTokenExpiry = 0;
              cachedIdToken = '';
            }

            const incomingHeader = (req.headers['x-goog-authenticated-user-email'] as string) || '';
            const cleanHeader = incomingHeader.replace(/^accounts\.google\.com:/, '').trim();

            // Obtain SSO identity token from gcloud for local testing
            const sso = getGcpIdentityToken();

            const email = cleanHeader || sso.email || env.VITE_SSO_USER_EMAIL || env.SSO_USER_EMAIL || 'demo.user@google.com';
            const name = sso.name || (email ? email.split('@')[0] : 'SSO User');

            // Obtain Service Account token for Apigee Management API
            const saToken = await getGcpAccessToken();
            let apiKey = '';
            let apiKeys: Record<string, string> = {};
            let username = email.split('@')[0] || 'admin';

            if (saToken && email) {
              const org = 'bap-apac-demo2';
              const provResult = await provisionUserDeveloperAndApp(org, saToken, email, name);
              if (provResult.apiKey) {
                apiKey = provResult.apiKey;
              }
              if (provResult.apiKeys) {
                apiKeys = provResult.apiKeys;
              }
              if (provResult.username) {
                username = provResult.username;
              }
            }

            res.end(JSON.stringify({
              email,
              token: sso.token || '',
              name,
              username,
              apiKey,
              apiKeys,
              provider: sso.token ? 'Google Cloud Identity SSO (gcloud)' : 'Google Cloud Identity SSO (IAP)',
              raw: incomingHeader,
            }));
          });

          server.middlewares.use('/api/kvm/rates', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            const envParam = parsedUrl.searchParams.get('env') || 'prod';
            const apigeeEnv = envParam === 'dev' || envParam === 'bap' ? 'dev' : 'prod';
            const org = 'bap-apac-demo2';
            const kvmName = 'ai-model-rates';
            const entryKey = 'rate_card';

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token from gcloud' }));
              return;
            }

            const apigeeBase = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/keyvaluemaps/${kvmName}/entries`;

            if (req.method === 'GET') {
              try {
                const apiRes = await fetch(`${apigeeBase}/${entryKey}`, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                if (!apiRes.ok) {
                  const errText = await apiRes.text();
                  res.statusCode = apiRes.status;
                  res.end(JSON.stringify({ error: `Apigee KVM error (${apiRes.status}): ${errText}` }));
                  return;
                }
                const data = await apiRes.json();
                let rates = {};
                try {
                  rates = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
                } catch {
                  rates = {};
                }
                res.end(JSON.stringify({
                  status: 'ok',
                  env: apigeeEnv,
                  org,
                  map: kvmName,
                  rates,
                  updatedAt: new Date().toISOString(),
                }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            } else if (req.method === 'PUT' || req.method === 'POST') {
              let body = '';
              req.on('data', (chunk) => { body += chunk; });
              req.on('end', async () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const targetEnv = payload.env === 'dev' || payload.env === 'bap' ? 'dev' : (payload.env || apigeeEnv);
                  const newRates = payload.rates;
                  if (!newRates || typeof newRates !== 'object') {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing or invalid "rates" object in request body' }));
                    return;
                  }

                  const targetUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${targetEnv}/keyvaluemaps/${kvmName}/entries/${entryKey}`;
                  const updateRes = await fetch(targetUrl, {
                    method: 'PUT',
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      name: entryKey,
                      value: JSON.stringify(newRates),
                    }),
                  });

                  if (!updateRes.ok) {
                    const errText = await updateRes.text();
                    res.statusCode = updateRes.status;
                    res.end(JSON.stringify({ error: `Failed to update Apigee KVM (${updateRes.status}): ${errText}` }));
                    return;
                  }

                  res.end(JSON.stringify({
                    status: 'ok',
                    env: targetEnv,
                    message: `Successfully updated ${entryKey} in ${targetEnv} KVM`,
                    rates: newRates,
                    updatedAt: new Date().toISOString(),
                  }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            }
          });

          // Apigee Monetization balance inspection
          server.middlewares.use('/api/monetization/balance', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token from gcloud' }));
              return;
            }

            const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            const dev = parsedUrl.searchParams.get('dev') || env.DEV_EMAIL || 'maloosatyam@google.com';
            const org = 'bap-apac-demo2';

            try {
              const apiRes = await fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(dev)}/balance`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const data = await apiRes.json();
              res.statusCode = apiRes.status;
              res.end(JSON.stringify({
                status: apiRes.ok ? 'ok' : 'error',
                developer: dev,
                org,
                data,
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });

          // Apigee Monetization wallet credit / top-up
          server.middlewares.use('/api/monetization/credit', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            if (req.method !== 'POST') {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method Not Allowed. Use POST.' }));
              return;
            }

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
              return;
            }

            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body || '{}');
                const dev = payload.developer || env.DEV_EMAIL || 'maloosatyam@google.com';
                const units = String(payload.units || '50');
                const org = 'bap-apac-demo2';
                const txId = `topup-${Date.now()}`;

                const creditUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(dev)}/balance:credit`;
                const creditRes = await fetch(creditUrl, {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    transactionAmount: {
                      currencyCode: 'USD',
                      units,
                      nanos: 0,
                    },
                    transactionId: txId,
                  }),
                });

                const data = await creditRes.json();
                res.statusCode = creditRes.status;
                res.end(JSON.stringify({
                  status: creditRes.ok ? 'ok' : 'error',
                  developer: dev,
                  credited: units,
                  transactionId: txId,
                  data,
                }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
          });

          // Apigee Monetization published rate plans
          server.middlewares.use('/api/monetization/rateplans', async (_req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token from gcloud' }));
              return;
            }

            const org = 'bap-apac-demo2';
            const products = ['Standard AI Tier', 'Enterprise AI Tier'];

            try {
              const allPlans: any[] = [];
              const prodPromises = products.map(async (prod) => {
                const rpListRes = await fetch(
                  `https://apigee.googleapis.com/v1/organizations/${org}/apiproducts/${encodeURIComponent(prod)}/rateplans`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                if (rpListRes.ok) {
                  const rpListData = await rpListRes.json();
                  const planItems = rpListData.ratePlans || [];
                  const planPromises = planItems.map(async (item: any) => {
                    try {
                      const planRes = await fetch(
                        `https://apigee.googleapis.com/v1/organizations/${org}/apiproducts/${encodeURIComponent(prod)}/rateplans/${item.name}`,
                        { headers: { Authorization: `Bearer ${token}` } }
                      );
                      if (planRes.ok) {
                        return await planRes.json();
                      }
                    } catch {}
                    return null;
                  });
                  const loadedPlans = await Promise.all(planPromises);
                  return loadedPlans.filter(Boolean);
                }
                return [];
              });
              const results = await Promise.all(prodPromises);
              results.forEach((plans) => allPlans.push(...plans));
              res.end(JSON.stringify({ status: 'ok', ratePlans: allPlans }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });

          // Apigee Monetization developer subscriptions
          server.middlewares.use('/api/monetization/subscriptions', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token from gcloud' }));
              return;
            }

            const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            const dev = parsedUrl.searchParams.get('dev') || env.DEV_EMAIL || 'maloosatyam@google.com';
            const org = 'bap-apac-demo2';

            if (req.method === 'GET') {
              try {
                const subRes = await fetch(
                  `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(dev)}/subscriptions`,
                  { headers: { Authorization: `Bearer ${token}` } }
                );
                const data = await subRes.json();
                res.statusCode = subRes.status;
                res.end(JSON.stringify({
                  status: subRes.ok ? 'ok' : 'error',
                  developer: dev,
                  subscriptions: data.developerSubscriptions || (Array.isArray(data) ? data : []),
                }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            } else if (req.method === 'POST') {
              let body = '';
              req.on('data', (c) => { body += c; });
              req.on('end', async () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const targetDev = payload.developer || dev;
                  const apiproduct = payload.apiproduct;
                  const subRes = await fetch(
                    `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(targetDev)}/subscriptions`,
                    {
                      method: 'POST',
                      headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        apiproduct,
                        startTime: String(Date.now()),
                      }),
                    }
                  );
                  const data = await subRes.json();
                  res.statusCode = subRes.status;
                  res.end(JSON.stringify({ status: subRes.ok ? 'ok' : 'error', data }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            }
          });

          // Apigee Monetization developer configuration (PREPAID vs POSTPAID)
          server.middlewares.use('/api/monetization/config', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token from gcloud' }));
              return;
            }

            const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            const dev = parsedUrl.searchParams.get('dev') || env.DEV_EMAIL || 'maloosatyam@google.com';
            const org = 'bap-apac-demo2';
            const cfgUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(dev)}/monetizationConfig`;

            if (req.method === 'GET') {
              try {
                const apiRes = await fetch(cfgUrl, {
                  headers: { Authorization: `Bearer ${token}` },
                });
                const data = await apiRes.json();
                res.statusCode = apiRes.status;
                res.end(JSON.stringify({ status: apiRes.ok ? 'ok' : 'error', developer: dev, config: data }));
              } catch (err: any) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            } else if (req.method === 'PUT' || req.method === 'POST') {
              let body = '';
              req.on('data', (c) => { body += c; });
              req.on('end', async () => {
                try {
                  const payload = JSON.parse(body || '{}');
                  const billingType = payload.billingType || 'PREPAID';
                  const apiRes = await fetch(cfgUrl, {
                    method: 'PUT',
                    headers: {
                      Authorization: `Bearer ${token}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ billingType }),
                  });
                  const data = await apiRes.json();
                  res.statusCode = apiRes.status;
                  res.end(JSON.stringify({ status: apiRes.ok ? 'ok' : 'error', developer: dev, config: data }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } else {
              res.statusCode = 405;
              res.end(JSON.stringify({ error: 'Method Not Allowed' }));
            }
          });

          // Live Apigee Management API Fleet Analytics Endpoint
          server.middlewares.use('/api/analytics/fleet-stats', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token from gcloud' }));
              return;
            }

            const parsedUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
            const rangeParam = parsedUrl.searchParams.get('timeRange') || '7d';
            const envParam = parsedUrl.searchParams.get('env') || 'prod';
            const org = 'bap-apac-demo2';
            const apigeeEnv = envParam === 'dev' || envParam === 'bap' ? 'dev' : 'prod';
            const apigeeTimeRange = getApigeeTimeRange(rangeParam);

            try {
              // 1. Fetch DataCapture stats (user email & model breakdown)
              const statsUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/stats/dc_user_email,dc_model_name?select=sum(message_count),sum(dc_prompt_token_count),sum(dc_candidates_token_count),sum(dc_total_token_count)&timeRange=${encodeURIComponent(apigeeTimeRange)}`;

              // 2. Fetch Proxy stats (for overall SLA, latency, error count)
              const proxyStatsUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/stats/apiproxy?select=sum(message_count),sum(is_error),avg(total_response_time)&timeRange=${encodeURIComponent(apigeeTimeRange)}`;

              // 3. Fetch KVM Rates
              const kvmUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/keyvaluemaps/ai-model-rates/entries/rate_card`;

              const [statsRes, proxyRes, kvmRes] = await Promise.all([
                fetch(statsUrl, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(proxyStatsUrl, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(kvmUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
              ]);

              // Parse KVM rates
              let rates: Record<string, any> = {};
              if (kvmRes && kvmRes.ok) {
                try {
                  const kvmData = await kvmRes.json();
                  rates = typeof kvmData.value === 'string' ? JSON.parse(kvmData.value) : kvmData.value || {};
                } catch {}
              }

              // Parse Proxy stats for SLA and latency
              let totalProxyCalls = 0;
              let totalProxyErrors = 0;
              let avgLatencyMs = 380;
              if (proxyRes.ok) {
                const pData = await proxyRes.json();
                const dims = pData.environments?.[0]?.dimensions || [];
                const aiGatewayDim = dims.find((d: any) => d.name === 'ai-gateway-v1');
                if (aiGatewayDim) {
                  const mc = aiGatewayDim.metrics?.find((m: any) => m.name === 'sum(message_count)');
                  const ec = aiGatewayDim.metrics?.find((m: any) => m.name === 'sum(is_error)');
                  const lat = aiGatewayDim.metrics?.find((m: any) => m.name === 'avg(total_response_time)');
                  totalProxyCalls = Number(mc?.values?.[0] || 0);
                  totalProxyErrors = Number(ec?.values?.[0] || 0);
                  avgLatencyMs = Math.round(Number(lat?.values?.[0] || 380));
                }
              }

              // Parse DC stats
              const statsData = statsRes.ok ? await statsRes.json() : null;
              const rawDimensions = statsData?.environments?.[0]?.dimensions || [];

              let totalTraffic = 0;
              let totalPromptTokens = 0;
              let totalCandidateTokens = 0;
              let totalCostUsd = 0;
              let flashCalls = 0;
              let proCalls = 0;

              const consumptionRows: any[] = [];

              for (const dim of rawDimensions) {
                const rawUser = dim.individualNames?.[0] || dim.name?.split(',')[0] || '(not set)';
                const rawModel = dim.individualNames?.[1] || dim.name?.split(',')[1] || '(not set)';

                const mc = Number(dim.metrics?.find((m: any) => m.name === 'sum(message_count)')?.values?.[0] || 0);
                const pt = Number(dim.metrics?.find((m: any) => m.name === 'sum(dc_prompt_token_count)')?.values?.[0] || 0);
                const ct = Number(dim.metrics?.find((m: any) => m.name === 'sum(dc_candidates_token_count)')?.values?.[0] || 0);

                if (mc <= 0) continue;

                // Exclude probe/unauthorized proxy traffic (e.g. 401s, health checks) where no model was invoked and no tokens were captured
                if ((rawModel === '(not set)' || !rawModel) && pt === 0 && ct === 0) {
                  continue;
                }

                const isUnauthenticated = rawUser === '(not set)' || !rawUser;
                const userEmail = isUnauthenticated ? 'anonymous.caller@external.client' : rawUser;
                const model = rawModel === '(not set)' || !rawModel ? 'unknown-model' : rawModel;

                const provider = model.includes('claude') ? 'Anthropic' : 'Google';
                const tier = model.includes('pro') || model.includes('opus') ? 'high' : model.includes('flash-lite') ? 'low' : 'medium';

                // Look up KVM rate card with prefix / normalization support
                const rateKey = Object.keys(rates).find(k => k !== 'default' && (model === k || model.startsWith(k) || k.startsWith(model)));
                const matchedRate = (rateKey ? rates[rateKey] : null) || rates[model] || rates['default'] || {};
                const inRate = matchedRate.input ?? (tier === 'high' ? 1.25 : 0.15);
                const outRate = matchedRate.output ?? (tier === 'high' ? 5.0 : 0.60);
                const cost = (pt / 1_000_000) * inRate + (ct / 1_000_000) * outRate;

                totalTraffic += mc;
                totalPromptTokens += pt;
                totalCandidateTokens += ct;
                totalCostUsd += cost;

                if (tier === 'high') proCalls += mc;
                else flashCalls += mc;

                consumptionRows.push({
                  userEmail,
                  model,
                  provider,
                  tier,
                  totalTraffic: mc,
                  inputTokens: pt,
                  outputTokens: ct,
                  costUsd: Number(cost.toFixed(4)),
                  isUnauthenticated,
                });
              }

              consumptionRows.sort((a, b) => b.costUsd - a.costUsd || b.totalTraffic - a.totalTraffic);

              const totalCalls = totalTraffic;
              const slaHealth = totalProxyCalls > 0 ? Math.round((1 - totalProxyErrors / totalProxyCalls) * 100) : 99;
              const flashRatio = (flashCalls + proCalls) > 0 ? Number(((flashCalls / (flashCalls + proCalls)) * 100).toFixed(1)) : 78.5;

              res.end(JSON.stringify({
                status: 'ok',
                source: 'Apigee Analytics Management API',
                org,
                env: apigeeEnv,
                timeRange: rangeParam,
                apigeeTimeRange,
                metaData: {
                  notices: statsData?.metaData?.notices || ['Source:ApigeeAnalytics'],
                },
                kpis: {
                  totalCalls,
                  totalTokens: totalPromptTokens + totalCandidateTokens,
                  inputTokens: totalPromptTokens,
                  outputTokens: totalCandidateTokens,
                  totalSpendUsd: Number(totalCostUsd.toFixed(2)),
                  cacheCostSavingsUsd: Number((totalCostUsd * 0.35).toFixed(2)),
                  cacheHitRate: 29.4,
                  slaHealth,
                  avgLatencyMs,
                  isErrorCount: totalProxyErrors,
                },
                routing: {
                  flashCalls,
                  flashPercent: flashRatio,
                  proOpusCalls: proCalls,
                  proOpusPercent: Number((100 - flashRatio).toFixed(1)),
                },
                consumptionRows,
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });

          // Live Apigee Monetization Developer Attributions Endpoint
          server.middlewares.use('/api/monetization/attributions', async (req, res) => {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Cache-Control', 'no-store');

            const token = await getGcpAccessToken();
            if (!token) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: 'Could not obtain GCP access token from gcloud' }));
              return;
            }

            const org = 'bap-apac-demo2';
            try {
              const devListRes = await fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers`, {
                headers: { Authorization: `Bearer ${token}` },
              });
              const devData = await devListRes.json();
              const developers: Array<{ email: string }> = devData.developer || [];

              // 2. Fetch DataCapture stats by user email to compute real consumption
              let statsByUser: Record<string, { calls: number; tokens: number }> = {};
              try {
                const sUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/prod/stats/dc_user_email?select=sum(message_count),sum(dc_total_token_count)&timeRange=09/01/2026%2000:00~09/15/2026%2000:00`;
                const sRes = await fetch(sUrl, { headers: { Authorization: `Bearer ${token}` } });
                if (sRes.ok) {
                  const sData = await sRes.json();
                  const dims = sData.environments?.[0]?.dimensions || [];
                  for (const d of dims) {
                    const email = d.name;
                    const calls = Number(d.metrics?.find((m: any) => m.name === 'sum(message_count)')?.values?.[0] || 0);
                    const tokens = Number(d.metrics?.find((m: any) => m.name === 'sum(dc_total_token_count)')?.values?.[0] || 0);
                    statsByUser[email] = { calls, tokens };
                  }
                }
              } catch {}

              const attributions = await Promise.all(
                developers.map(async (d) => {
                  const email = d.email;
                  let balanceUsd = 0;
                  let hasWallet = false;
                  let apps: string[] = [];
                  let firstName = '';
                  let lastName = '';

                  try {
                    const [balRes, detRes] = await Promise.all([
                      fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/balance`, {
                        headers: { Authorization: `Bearer ${token}` },
                      }),
                      fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}`, {
                        headers: { Authorization: `Bearer ${token}` },
                      }),
                    ]);

                    if (balRes.ok) {
                      const bJson = await balRes.json();
                      const primaryWallet = bJson.wallets?.[0];
                      if (primaryWallet?.balance) {
                        hasWallet = true;
                        const units = Number(primaryWallet.balance.units || 0);
                        const nanos = Number(primaryWallet.balance.nanos || 0);
                        balanceUsd = Number((units + nanos / 1e9).toFixed(2));
                      }
                    }

                    if (detRes.ok) {
                      const dJson = await detRes.json();
                      apps = dJson.apps || [];
                      firstName = dJson.firstName || '';
                      lastName = dJson.lastName || '';
                    }
                  } catch {}

                  const fullName = [firstName, lastName].filter(Boolean).join(' ') || (email.split('@')[0]);
                  const isEnterprise = apps.some((a) => a.toLowerCase().includes('enterprise') || a.toLowerCase().includes('admin'));
                  const userStats = statsByUser[email] || { calls: 0, tokens: 0 };
                  const consumedUsd = Number(((userStats.tokens / 1_000_000) * 0.75).toFixed(2));

                  return {
                    userEmail: email,
                    name: fullName,
                    tier: isEnterprise ? 'Enterprise AI Tier' : 'Standard AI Tier',
                    badge: hasWallet ? 'Prepaid Wallet' : 'Developer',
                    billingType: hasWallet ? 'PREPAID' : 'POSTPAID',
                    totalConsumedUsd: consumedUsd,
                    totalCalls: userStats.calls,
                    totalTokens: userStats.tokens,
                    currentBalanceUsd: balanceUsd,
                    allocatedBudgetUsd: balanceUsd > 0 ? Number((balanceUsd + consumedUsd + 25).toFixed(2)) : 100.0,
                    lastActive: hasWallet ? 'Active Wallet' : 'Registered',
                  };
                })
              );

              res.end(JSON.stringify({ status: 'ok', attributions }));
            } catch (err: any) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        },
      },
    ],
    server: {
      port: 3000,
      proxy: {
        '/api/ai-dev': {
          target: 'https://bap.api.maloosatyam.demo.altostrat.com/ai/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ai-dev/, ''),
          secure: false,
        },
        '/api/ai-prod': {
          target: 'https://api.maloosatyam.demo.altostrat.com/ai/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ai-prod/, ''),
          secure: false,
        },
        '/api/claude-dev': {
          target: 'https://bap.api.maloosatyam.demo.altostrat.com/v1/messages',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/claude-dev/, ''),
          secure: false,
        },
        '/api/claude-prod': {
          target: 'https://api.maloosatyam.demo.altostrat.com/v1/messages',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/claude-prod/, ''),
          secure: false,
        },
        '/v1': {
          target: 'https://api.maloosatyam.demo.altostrat.com',
          changeOrigin: true,
          secure: false,
        },
        '/api/vertexai-dev': {
          target: 'https://bap.api.maloosatyam.demo.altostrat.com/vertexai/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/vertexai-dev/, ''),
          secure: false,
        },
        '/api/vertexai-prod': {
          target: 'https://api.maloosatyam.demo.altostrat.com/vertexai/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/vertexai-prod/, ''),
          secure: false,
        },
        '/api/mcp-dev': {
          target: 'https://bap.api.maloosatyam.demo.altostrat.com/mcp',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mcp-dev/, ''),
          secure: false,
        },
        '/api/mcp-prod': {
          target: 'https://api.maloosatyam.demo.altostrat.com/mcp',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/mcp-prod/, ''),
          secure: false,
        },
      },
    },
  };
});
