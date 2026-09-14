import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = process.env.PORT || 8080;

// In-memory token cache for Apigee Management API
let cachedToken = '';
let tokenExpiry = 0;

async function getGcpAccessToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }

  // 1. Check for Service Account Key File
  const keyPaths = [
    process.env.APIGEE_SA_KEY_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'apigee-ui-mgmt-sa-key.json'),
    path.resolve(process.cwd(), '../apigee-ui-mgmt-sa-key.json'),
  ].filter(Boolean);

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
              tokenExpiry = now + 50 * 60 * 1000;
              return cachedToken;
            }
          }
        }
      } catch (err) {
        console.warn(`[Server] SA key auth error at ${keyPath}:`, err.message);
      }
    }
  }

  // 2. Query Cloud Run / Compute Metadata Server
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

  // 3. Fallback to gcloud
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
  } catch (err) {
    console.error('[Server] Failed to get gcloud auth token:', err.message);
    return '';
  }
}

async function fetchAppConsumerKey(org, token, devEmail, appName) {
  try {
    const res = await fetch(
      `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(devEmail)}/apps/${encodeURIComponent(appName)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.ok) {
      const data = await res.json();
      const cred = data.credentials?.find((c) => c.status === 'approved') || data.credentials?.[0];
      return cred?.consumerKey || '';
    }
  } catch (err) {
    console.warn(`[Server] Failed to fetch key for ${appName}:`, err.message);
  }
  return '';
}

async function provisionUserDeveloperAndApp(org, token, email, name) {
  if (!email || !token) {
    return { apiKey: '', apiKeys: {}, username: '' };
  }

  const username = email.split('@')[0] || 'admin';
  const nameParts = name.trim().split(' ').filter(Boolean);
  const firstName = nameParts[0] || username;
  const lastName = nameParts.slice(1).join(' ') || 'User';
  const apiKeys = { admin: '', sales_agent: '', loans_agent: '' };

  try {
    // 1. Check/Create Developer
    const devUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}`;
    const devRes = await fetch(devUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (devRes.status === 404) {
      console.log(`[Server] Developer ${email} not found. Creating...`);
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

    // 2. Check/Create Admin App
    const targetAppName = `Unified Admin ${username} App`;
    const appsUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/apps?expand=true`;
    const appsRes = await fetch(appsUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const appsList = appsRes.ok ? (await appsRes.json()).app || [] : [];

    let matchedApp = appsList.find(
      (a) =>
        a.name === targetAppName ||
        a.name === 'Unified Admin App' ||
        a.name.startsWith(targetAppName)
    );

    if (!matchedApp) {
      console.log(`[Server] Creating app ${targetAppName} for ${email}...`);
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
            apiProducts: ['Enterprise AI Tier', 'Enterprise Tools MCP'],
            attributes: [{ name: 'persona', value: 'admin' }],
          }),
        }
      );
      if (createAppRes.ok) {
        matchedApp = await createAppRes.json();
      }
    }

    if (matchedApp && matchedApp.credentials) {
      const approvedCred = matchedApp.credentials.find((c) => c.status === 'approved') || matchedApp.credentials[0];
      if (approvedCred && approvedCred.consumerKey) {
        apiKeys.admin = approvedCred.consumerKey;
      }
    }

    // 3. Fetch global keys for Sales and Loans
    const defaultDevEmail = 'maloosatyam@google.com';
    apiKeys.sales_agent = await fetchAppConsumerKey(org, token, defaultDevEmail, 'Unified Sales App');
    apiKeys.loans_agent = await fetchAppConsumerKey(org, token, defaultDevEmail, 'Unified Loans App');

    // 4. Monetization PREPAID + Balance Top-up
    const cfgUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/monetizationConfig`;
    const cfgRes = await fetch(cfgUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (cfgRes.ok) {
      const cfgData = await cfgRes.json();
      if (cfgData.billingType !== 'PREPAID') {
        await fetch(cfgUrl, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ billingType: 'PREPAID' }),
        });
      }
    } else if (cfgRes.status === 404) {
      await fetch(cfgUrl, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ billingType: 'PREPAID' }),
      });
    }

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
      console.log(`[Server] Adding $20 starting balance for developer ${email}...`);
      const creditUrl = `https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(email)}/balance:credit`;
      await fetch(creditUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionAmount: { currencyCode: 'USD', units: '20', nanos: 0 },
          transactionId: `init-topup-20-${Date.now()}`,
        }),
      });
    }

    return { apiKey: apiKeys.admin || '', apiKeys, username };
  } catch (err) {
    console.error('[Server] Error provisioning user developer and apps:', err.message);
    return { apiKey: '', apiKeys: {}, username };
  }
}

function getApigeeTimeRange(rangeParam) {
  const now = new Date();
  let days = 7;
  if (rangeParam === '24h') days = 1;
  else if (rangeParam === '30d') days = 30;

  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');

  const fmt = (d) => `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  return `${fmt(start)}~${fmt(now)}`;
}

// MIME Types helper
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function proxyRequest(req, res, targetUrl) {
  try {
    const headers = {};
    for (const [key, val] of Object.entries(req.headers)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== 'host' &&
        lowerKey !== 'content-length' &&
        lowerKey !== 'connection' &&
        lowerKey !== 'accept-encoding'
      ) {
        headers[key] = val;
      }
    }

    let bodyBuffer = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      bodyBuffer = Buffer.concat(chunks);
    }

    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: bodyBuffer,
    });

    res.statusCode = proxyRes.status;
    proxyRes.headers.forEach((val, key) => {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey !== 'content-encoding' &&
        lowerKey !== 'content-length' &&
        lowerKey !== 'transfer-encoding' &&
        lowerKey !== 'connection'
      ) {
        res.setHeader(key, val);
      }
    });

    const responseBody = await proxyRes.arrayBuffer();
    const buffer = Buffer.from(responseBody);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  } catch (err) {
    console.error(`[Server] Proxy error to ${targetUrl}:`, err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message }));
  }
}

const server = http.createServer(async (req, res) => {
  const reqUrl = req.url || '/';
  const parsedUrl = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. Serve /env-config.js dynamically for SPA
  if (pathname === '/env-config.js') {
    res.setHeader('Content-Type', 'text/javascript');
    res.setHeader('Cache-Control', 'no-store');
    const runtimeConfig = {
      ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',
      SALES_API_KEY: process.env.SALES_API_KEY || '',
      LOANS_API_KEY: process.env.LOANS_API_KEY || '',
      ADMIN_USER_EMAIL: process.env.ADMIN_USER_EMAIL || 'admin.user@google.com',
      SALES_AGENT_EMAIL: process.env.SALES_AGENT_EMAIL || 'sales.agent@example.com',
      LOANS_AGENT_EMAIL: process.env.LOANS_AGENT_EMAIL || 'loans.agent@example.com',
      SSO_USER_EMAIL: process.env.SSO_USER_EMAIL || 'demo.user@google.com',
      DEFAULT_ENV: process.env.DEFAULT_ENV || 'prod',
    };
    res.end(`window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};`);
    return;
  }

  // 2. /api/me endpoint
  if (pathname === '/api/me' || pathname === '/api/me/') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const incomingHeader = req.headers['x-goog-authenticated-user-email'] || '';
    const cleanHeader = String(incomingHeader).replace(/^accounts\.google\.com:/, '').trim();
    const email = cleanHeader || process.env.VITE_SSO_USER_EMAIL || process.env.SSO_USER_EMAIL || 'demo.user@google.com';
    const name = email.split('@')[0] || 'SSO User';

    const saToken = await getGcpAccessToken();
    let apiKey = '';
    let apiKeys = {};
    let username = email.split('@')[0] || 'admin';

    if (saToken && email) {
      const org = 'bap-apac-demo2';
      const provResult = await provisionUserDeveloperAndApp(org, saToken, email, name);
      if (provResult.apiKey) apiKey = provResult.apiKey;
      if (provResult.apiKeys) apiKeys = provResult.apiKeys;
      if (provResult.username) username = provResult.username;
    }

    res.end(
      JSON.stringify({
        email,
        token: '',
        name,
        username,
        apiKey,
        apiKeys,
        provider: cleanHeader ? 'Google Cloud Identity SSO (IAP)' : 'Local Default SSO',
        raw: incomingHeader,
      })
    );
    return;
  }

  // 3. /api/kvm/rates
  if (pathname === '/api/kvm/rates') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const envParam = parsedUrl.searchParams.get('env') || 'prod';
    const apigeeEnv = envParam === 'dev' || envParam === 'bap' ? 'dev' : 'prod';
    const org = 'bap-apac-demo2';
    const kvmName = 'ai-model-rates';
    const entryKey = 'rate_card';

    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
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
      } catch (err) {
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
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
    return;
  }

  // 4. /api/monetization/balance
  if (pathname === '/api/monetization/balance') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
      return;
    }

    const dev = parsedUrl.searchParams.get('dev') || 'maloosatyam@google.com';
    const org = 'bap-apac-demo2';
    try {
      const apiRes = await fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(dev)}/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await apiRes.json();
      res.statusCode = apiRes.status;
      res.end(JSON.stringify({
        status: apiRes.ok ? 'ok' : 'error',
        developer: dev,
        org,
        data,
      }));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. /api/monetization/credit
  if (pathname === '/api/monetization/credit') {
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
        const dev = payload.developer || 'maloosatyam@google.com';
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
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // 6. /api/monetization/rateplans
  if (pathname === '/api/monetization/rateplans') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
      return;
    }

    const org = 'bap-apac-demo2';
    const products = ['Standard AI Tier', 'Enterprise AI Tier'];

    try {
      const allPlans = [];
      const prodPromises = products.map(async (prod) => {
        const rpListRes = await fetch(
          `https://apigee.googleapis.com/v1/organizations/${org}/apiproducts/${encodeURIComponent(prod)}/rateplans`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (rpListRes.ok) {
          const rpListData = await rpListRes.json();
          const planItems = rpListData.ratePlans || [];
          const planPromises = planItems.map(async (item) => {
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
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 7. /api/monetization/subscriptions
  if (pathname === '/api/monetization/subscriptions') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
      return;
    }

    const dev = parsedUrl.searchParams.get('dev') || 'maloosatyam@google.com';
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
      } catch (err) {
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
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
    return;
  }

  // 8. /api/monetization/config
  if (pathname === '/api/monetization/config') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
      return;
    }

    const dev = parsedUrl.searchParams.get('dev') || 'maloosatyam@google.com';
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
      } catch (err) {
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
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    } else {
      res.statusCode = 405;
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    }
    return;
  }

  // 9. /api/analytics/fleet-stats
  if (pathname === '/api/analytics/fleet-stats') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
      return;
    }

    const rangeParam = parsedUrl.searchParams.get('timeRange') || '7d';
    const envParam = parsedUrl.searchParams.get('env') || 'prod';
    const org = 'bap-apac-demo2';
    const apigeeEnv = envParam === 'dev' || envParam === 'bap' ? 'dev' : 'prod';
    const apigeeTimeRange = getApigeeTimeRange(rangeParam);

    try {
      const statsUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/stats/dc_user_email,dc_model_name?select=sum(message_count),sum(dc_prompt_token_count),sum(dc_candidates_token_count),sum(dc_total_token_count)&timeRange=${encodeURIComponent(apigeeTimeRange)}`;
      const proxyStatsUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/stats/apiproxy?select=sum(message_count),sum(is_error),avg(total_response_time)&timeRange=${encodeURIComponent(apigeeTimeRange)}`;
      const kvmUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/keyvaluemaps/ai-model-rates/entries/rate_card`;

      const [statsRes, proxyRes, kvmRes] = await Promise.all([
        fetch(statsUrl, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(proxyStatsUrl, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(kvmUrl, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null),
      ]);

      let rates = {};
      if (kvmRes && kvmRes.ok) {
        try {
          const kvmData = await kvmRes.json();
          rates = typeof kvmData.value === 'string' ? JSON.parse(kvmData.value) : kvmData.value || {};
        } catch {}
      }

      let totalProxyCalls = 0;
      let totalProxyErrors = 0;
      let avgLatencyMs = 380;
      if (proxyRes.ok) {
        const pData = await proxyRes.json();
        const dims = pData.environments?.[0]?.dimensions || [];
        const aiGatewayDim = dims.find((d) => d.name === 'ai-gateway-v1');
        if (aiGatewayDim) {
          const mc = aiGatewayDim.metrics?.find((m) => m.name === 'sum(message_count)');
          const ec = aiGatewayDim.metrics?.find((m) => m.name === 'sum(is_error)');
          const lat = aiGatewayDim.metrics?.find((m) => m.name === 'avg(total_response_time)');
          totalProxyCalls = Number(mc?.values?.[0] || 0);
          totalProxyErrors = Number(ec?.values?.[0] || 0);
          avgLatencyMs = Math.round(Number(lat?.values?.[0] || 380));
        }
      }

      const statsData = statsRes.ok ? await statsRes.json() : null;
      const rawDimensions = statsData?.environments?.[0]?.dimensions || [];

      let totalTraffic = 0;
      let totalPromptTokens = 0;
      let totalCandidateTokens = 0;
      let totalCostUsd = 0;
      let flashCalls = 0;
      let proCalls = 0;

      const consumptionRows = [];

      for (const dim of rawDimensions) {
        const rawUser = dim.individualNames?.[0] || dim.name?.split(',')[0] || '(not set)';
        const rawModel = dim.individualNames?.[1] || dim.name?.split(',')[1] || '(not set)';

        const mc = Number(dim.metrics?.find((m) => m.name === 'sum(message_count)')?.values?.[0] || 0);
        const pt = Number(dim.metrics?.find((m) => m.name === 'sum(dc_prompt_token_count)')?.values?.[0] || 0);
        const ct = Number(dim.metrics?.find((m) => m.name === 'sum(dc_candidates_token_count)')?.values?.[0] || 0);

        if (mc <= 0) continue;
        if ((rawModel === '(not set)' || !rawModel) && pt === 0 && ct === 0) continue;

        const isUnauthenticated = rawUser === '(not set)' || !rawUser;
        const userEmail = isUnauthenticated ? 'anonymous.caller@external.client' : rawUser;
        const model = rawModel === '(not set)' || !rawModel ? 'unknown-model' : rawModel;

        const provider = model.includes('claude') ? 'Anthropic' : 'Google';
        const tier = model.includes('pro') || model.includes('opus') ? 'high' : model.includes('flash-lite') ? 'low' : 'medium';

        const rateKey = Object.keys(rates).find((k) => k !== 'default' && (model === k || model.startsWith(k) || k.startsWith(model)));
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
        source: 'Apigee Management API (Live BigQuery DataCollector)',
        org,
        env: apigeeEnv,
        timeRange: rangeParam,
        apigeeTimeRange,
        metaData: {
          notices: statsData?.metaData?.notices || ['Source:BigQuery'],
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
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 10. /api/monetization/attributions
  if (pathname === '/api/monetization/attributions') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');

    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
      return;
    }

    const org = 'bap-apac-demo2';
    try {
      const devListRes = await fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const devData = await devListRes.json();
      const developers = devData.developer || [];

      let statsByUser = {};
      try {
        const sUrl = `https://apigee.googleapis.com/v1/organizations/${org}/environments/prod/stats/dc_user_email?select=sum(message_count),sum(dc_total_token_count)&timeRange=09/01/2026%2000:00~09/15/2026%2000:00`;
        const sRes = await fetch(sUrl, { headers: { Authorization: `Bearer ${token}` } });
        if (sRes.ok) {
          const sData = await sRes.json();
          const dims = sData.environments?.[0]?.dimensions || [];
          for (const d of dims) {
            const email = d.name;
            const calls = Number(d.metrics?.find((m) => m.name === 'sum(message_count)')?.values?.[0] || 0);
            const tokens = Number(d.metrics?.find((m) => m.name === 'sum(dc_total_token_count)')?.values?.[0] || 0);
            statsByUser[email] = { calls, tokens };
          }
        }
      } catch {}

      const attributions = await Promise.all(
        developers.map(async (d) => {
          const email = d.email;
          let balanceUsd = 0;
          let hasWallet = false;
          let apps = [];
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

          const fullName = [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0];
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
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Reverse proxy routes for Apigee Gateway
  if (pathname.startsWith('/api/ai-dev')) {
    const targetPath = pathname.replace(/^\/api\/ai-dev/, '');
    await proxyRequest(req, res, `https://bap.api.maloosatyam.demo.altostrat.com/ai/v1${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/api/ai-prod')) {
    const targetPath = pathname.replace(/^\/api\/ai-prod/, '');
    await proxyRequest(req, res, `https://api.maloosatyam.demo.altostrat.com/ai/v1${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/api/claude-dev')) {
    const targetPath = pathname.replace(/^\/api\/claude-dev/, '');
    await proxyRequest(req, res, `https://bap.api.maloosatyam.demo.altostrat.com/v1/messages${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/api/claude-prod')) {
    const targetPath = pathname.replace(/^\/api\/claude-prod/, '');
    await proxyRequest(req, res, `https://api.maloosatyam.demo.altostrat.com/v1/messages${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/api/vertexai-dev')) {
    const targetPath = pathname.replace(/^\/api\/vertexai-dev/, '');
    await proxyRequest(req, res, `https://bap.api.maloosatyam.demo.altostrat.com/vertexai/v1${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/api/vertexai-prod')) {
    const targetPath = pathname.replace(/^\/api\/vertexai-prod/, '');
    await proxyRequest(req, res, `https://api.maloosatyam.demo.altostrat.com/vertexai/v1${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/api/mcp-dev')) {
    const targetPath = pathname.replace(/^\/api\/mcp-dev/, '');
    await proxyRequest(req, res, `https://bap.api.maloosatyam.demo.altostrat.com/mcp${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/api/mcp-prod')) {
    const targetPath = pathname.replace(/^\/api\/mcp-prod/, '');
    await proxyRequest(req, res, `https://api.maloosatyam.demo.altostrat.com/mcp${targetPath}${parsedUrl.search}`);
    return;
  }

  if (pathname.startsWith('/v1')) {
    await proxyRequest(req, res, `https://api.maloosatyam.demo.altostrat.com${pathname}${parsedUrl.search}`);
    return;
  }

  // Serve static SPA files from dist/
  let filePath = path.join(DIST_DIR, pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  try {
    const content = fs.readFileSync(filePath);
    res.setHeader('Content-Type', contentType);
    res.end(content);
  } catch (err) {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`[Server] Production Node server listening on port ${PORT}`);
});
