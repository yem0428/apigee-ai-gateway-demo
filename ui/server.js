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

const server = http.createServer(async (req, res) => {
  const reqUrl = req.url || '/';
  const parsedUrl = new URL(reqUrl, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // 1. /api/me endpoint
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

  // 2. /api/kvm/rates
  if (pathname === '/api/kvm/rates') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const token = await getGcpAccessToken();
    if (!token) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Could not obtain GCP access token' }));
      return;
    }
    const org = 'bap-apac-demo2';
    const apigeeEnv = parsedUrl.searchParams.get('env') === 'dev' ? 'dev' : 'prod';
    const apigeeBase = `https://apigee.googleapis.com/v1/organizations/${org}/environments/${apigeeEnv}/keyvaluemaps/ai-model-rates/entries/rate_card`;
    
    try {
      const apiRes = await fetch(apigeeBase, { headers: { Authorization: `Bearer ${token}` } });
      if (!apiRes.ok) {
        res.statusCode = apiRes.status;
        res.end(await apiRes.text());
        return;
      }
      const data = await apiRes.json();
      res.end(JSON.stringify(JSON.parse(data.value || '{}')));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 3. /api/monetization/balance
  if (pathname === '/api/monetization/balance') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    const token = await getGcpAccessToken();
    const dev = parsedUrl.searchParams.get('dev') || 'maloosatyam@google.com';
    const org = 'bap-apac-demo2';
    try {
      const apiRes = await fetch(`https://apigee.googleapis.com/v1/organizations/${org}/developers/${encodeURIComponent(dev)}/balance`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await apiRes.json();
      res.statusCode = apiRes.status;
      res.end(JSON.stringify(data));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 4. Proxy /api/vertexai-prod or /api/ai-prod
  if (pathname.startsWith('/api/vertexai-prod') || pathname.startsWith('/api/ai-prod')) {
    const targetPath = pathname.replace(/^\/api\/(vertexai-prod|ai-prod)/, '');
    const upstreamUrl = `https://api.maloosatyam.demo.altostrat.com/ai/v1${targetPath}${parsedUrl.search}`;
    try {
      const headers = { ...req.headers };
      delete headers.host;
      const proxyRes = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
        duplex: 'half',
      });
      res.statusCode = proxyRes.status;
      proxyRes.headers.forEach((val, key) => res.setHeader(key, val));
      const body = await proxyRes.arrayBuffer();
      res.end(Buffer.from(body));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 5. Proxy /api/mcp-prod
  if (pathname.startsWith('/api/mcp-prod')) {
    const targetPath = pathname.replace(/^\/api\/mcp-prod/, '');
    const upstreamUrl = `https://api.maloosatyam.demo.altostrat.com/mcp${targetPath}${parsedUrl.search}`;
    try {
      const headers = { ...req.headers };
      delete headers.host;
      const proxyRes = await fetch(upstreamUrl, {
        method: req.method,
        headers,
        body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
        duplex: 'half',
      });
      res.statusCode = proxyRes.status;
      proxyRes.headers.forEach((val, key) => res.setHeader(key, val));
      const body = await proxyRes.arrayBuffer();
      res.end(Buffer.from(body));
    } catch (err) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // 6. Serve static SPA files from dist/
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
