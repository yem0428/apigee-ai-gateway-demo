# Cloud Run UI & Identity-Aware Proxy (IAP) Deployment Guide

> **Document status**: Production / active baseline
> **Last verified**: 2026-09-15 (against live GCP state and repository source)
> **Environment**: Google Cloud project `bap-apac-demo2` (project number `1058667481809`)
> **Region**: `asia-southeast1` (Cloud Run) / `global` (load balancer, IAP, SSL)
> **Primary domain**: `ai-ui.maloosatyam.demo.altostrat.com`

---

## 1. Architecture Overview

This deployment hosts the **Apigee AI & Tools Gateway demonstration UI** as an internal-only web
application on Google Cloud. Four controls make that true:

1. **No direct public access** — the Cloud Run service runs with `--no-allow-unauthenticated` and
   `--ingress=internal-and-cloud-load-balancing`. The raw `*.run.app` URLs
   (`https://apigee-ai-gateway-ui-1058667481809.asia-southeast1.run.app`) return `403 Forbidden`
   to the open internet.
2. **Identity-Aware Proxy** — browser sessions authenticate via Google Workspace SSO. IAP is enabled
   on the `apigee-ai-ui-backend` backend service and authorization is granted to `domain:google.com`
   plus `user:maloosatyam@google.com`.
3. **Dedicated global Application Load Balancer** — a Global External HTTPS ALB terminates TLS with a
   Google-managed certificate and forwards to Cloud Run through a Serverless NEG.
4. **Workload identity, not static keys** — the container holds **no API keys**. The Cloud Run
   service account calls the Apigee Management API using a token obtained from the Cloud Run
   metadata server, and mints per-user Apigee developer credentials on demand.

> [!IMPORTANT]
> The container image is **`node:20-alpine` running `node server.js`**. There is no NGINX, no
> web-server config file, and no entrypoint shell script in the runtime image. Any instruction
> elsewhere that references NGINX access/error logs for this service is stale.

```mermaid
flowchart TB
    User["Googler Browser (@google.com)"]

    subgraph edge["Google Cloud Global Edge"]
        DNS["DNS: ai-ui.maloosatyam.demo.altostrat.com\nA-record -> 136.68.103.117"]
        Port80["apigee-ai-ui-http-forwarding-rule\nPort 80 -> 301 redirect"]
        Port443["apigee-ai-ui-forwarding-rule\nPort 443 (EXTERNAL_MANAGED)"]
        Cert["Google-managed SSL cert\napigee-ai-ui-single-cert"]

        DNS --> Port80
        DNS --> Port443
        Port80 -->|301 redirect| Port443
        Port443 --- Cert
    end

    subgraph sec["Google Cloud IAP"]
        IAP["IAP on apigee-ai-ui-backend\nOAuth client 1058667481809-6skumftl...\nAllows domain:google.com"]
        GoogleLogin["accounts.google.com\nGoogle Workspace SSO"]
        IAP_SA["IAP service agent\nservice-1058667481809@gcp-sa-iap.iam.gserviceaccount.com"]

        Port443 --> IAP
        IAP -.->|unauthenticated| GoogleLogin
        GoogleLogin -.->|auth callback| IAP
        IAP --> IAP_SA
    end

    subgraph compute["Serverless backend - asia-southeast1"]
        NEG["Serverless NEG\napigee-ai-ui-neg"]
        CloudRun["Cloud Run: apigee-ai-gateway-ui\nIngress internal-and-cloud-load-balancing\nPort 8080\nSA apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com"]
        NodeServer["Node 20 HTTP server\nui/server.js"]
        Static["Compiled React + Vite SPA\ndist/"]
        ManagementProxy["Apigee Management API calls\ntoken from metadata server"]

        IAP_SA -->|roles/run.invoker| NEG
        NEG --> CloudRun
        CloudRun --> NodeServer
        NodeServer --> Static
        NodeServer --> ManagementProxy
    end

    subgraph gw["Apigee gateways - external"]
        DevProxy["Dev: bap.api.maloosatyam.demo.altostrat.com"]
        ProdProxy["Prod: api.maloosatyam.demo.altostrat.com"]

        NodeServer -->|/api/ai-dev, /api/claude-dev,\n/api/vertexai-dev, /api/mcp-dev| DevProxy
        NodeServer -->|/api/ai-prod, /api/claude-prod,\n/api/vertexai-prod, /api/mcp-prod, /v1| ProdProxy
    end

    User --> DNS
    ManagementProxy --> Apigee["apigee.googleapis.com"]
```

---

## 2. Infrastructure Inventory

All resources are provisioned in project `bap-apac-demo2` and were re-verified with `gcloud` on
2026-09-15.

| Component | Resource name / ID | Configuration |
| :--- | :--- | :--- |
| **Static external IP** | `apigee-ai-ui-ip` | `136.68.103.117` (global IPv4, `IN_USE`) |
| **Cloud Run service** | `apigee-ai-gateway-ui` | Region `asia-southeast1`<br>Port `8080`<br>Ingress `internal-and-cloud-load-balancing`<br>Auth `--no-allow-unauthenticated` |
| **Cloud Run runtime config** | — | CPU `1000m`, memory `512Mi`, container concurrency `80`, min scale `0`, max scale `100`, request timeout `300s`, startup CPU boost on |
| **Cloud Run service account** | `apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com` | Calls the Apigee Management API via the metadata server; no static key env vars |
| **Artifact Registry** | `cloud-run-source-deploy` | `asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest` |
| **Serverless NEG** | `apigee-ai-ui-neg` | Region `asia-southeast1`, type `SERVERLESS`, target Cloud Run `apigee-ai-gateway-ui` |
| **Backend service** | `apigee-ai-ui-backend` | Scheme `EXTERNAL_MANAGED`, protocol `HTTP`, `timeoutSec: 30`, backend `apigee-ai-ui-neg`, **IAP enabled** |
| **IAP OAuth client** | — | `1058667481809-6skumftl6n16t2r2phgua0i989j4seji.apps.googleusercontent.com` |
| **IAP service agent** | `service-1058667481809@gcp-sa-iap.iam.gserviceaccount.com` | Holds `roles/run.invoker` on the Cloud Run service |
| **IAP access IAM** | `roles/iap.httpsResourceAccessor` | `domain:google.com`, `user:maloosatyam@google.com` |
| **SSL certificate** | `apigee-ai-ui-single-cert` | Google-managed for `ai-ui.maloosatyam.demo.altostrat.com` — status **ACTIVE** |
| **URL map (HTTPS)** | `apigee-ai-ui-url-map` | Default service `apigee-ai-ui-backend` |
| **Target HTTPS proxy** | `apigee-ai-ui-target-proxy` | Map `apigee-ai-ui-url-map`, cert `apigee-ai-ui-single-cert` |
| **HTTPS forwarding rule** | `apigee-ai-ui-forwarding-rule` | `136.68.103.117:443` |
| **HTTP redirect URL map** | `apigee-ai-ui-http-redirect` | `httpsRedirect: true` |
| **Target HTTP proxy** | `apigee-ai-ui-http-proxy` | Map `apigee-ai-ui-http-redirect` |
| **HTTP forwarding rule** | `apigee-ai-ui-http-forwarding-rule` | `136.68.103.117:80` |

Cloud Run `roles/run.invoker` is currently granted to `domain:google.com`,
`user:maloosatyam@google.com`, the IAP service agent, and
`1058667481809-compute@developer.gserviceaccount.com`.

---

## 3. UI Container & Runtime Architecture

### A. Container image

[ui/Dockerfile](file:///Users/maloosatyam/Codebase/AI%20Code/ui/Dockerfile) is twelve lines and does
no building — it copies a **pre-built** `dist/` directory:

```dockerfile
FROM node:20-alpine

WORKDIR /app
ENV PORT=8080

COPY dist ./dist
COPY server.js ./

EXPOSE 8080

CMD ["node", "server.js"]
```

> [!WARNING]
> `npm run build` must be run in `ui/` **before** `gcloud builds submit`. If `ui/dist` is stale, the
> deployed image silently ships the previous UI. The image contains no `node_modules`,
> so `server.js` uses only Node built-ins (`node:http`, `node:fs`, `node:path`, `node:crypto`,
> `node:child_process`, `node:url`) plus global `fetch`.

`ui/nginx.conf.template` and `ui/generate-env.sh` still exist in the repository but are referenced by
nothing — not the Dockerfile, not any script. They are dead artefacts of an earlier NGINX-based
container.

### B. Production Node server ([ui/server.js](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js))

A single `http.createServer` handler listens on `process.env.PORT || 8080` and dispatches on
pathname in the order below. On startup it also reads an optional `.env` file next to `server.js`
and populates `process.env` for any key not already set.

#### 1. Runtime config — `GET /env-config.js`

Returns JavaScript that assigns `window.__RUNTIME_CONFIG__`, built from environment variables with
inline defaults:

| Key | Env var | Default |
| :--- | :--- | :--- |
| `ADMIN_USER_EMAIL` | `ADMIN_USER_EMAIL` | `admin.user@google.com` |
| `SALES_AGENT_EMAIL` | `SALES_AGENT_EMAIL` | `sales.agent@example.com` |
| `LOANS_AGENT_EMAIL` | `LOANS_AGENT_EMAIL` | `loans.agent@example.com` |
| `SSO_USER_EMAIL` | `SSO_USER_EMAIL` | `demo.user@google.com` |
| `DEFAULT_ENV` | `DEFAULT_ENV` | `prod` |

No API keys are injected here — keys are fetched at runtime through `/api/me`.

#### 2. Identity and auto-provisioning — `GET /api/me`

Reads the `X-Goog-Authenticated-User-Email` header injected by IAP and strips the
`accounts.google.com:` prefix. If the header is absent it falls back to `VITE_SSO_USER_EMAIL`,
`SSO_USER_EMAIL`, then `demo.user@google.com`.

It then acquires a Google access token via
[`getGcpAccessToken()`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L34-L130), which
tries, in order:

1. A service-account key file (`APIGEE_SA_KEY_PATH`, `GOOGLE_APPLICATION_CREDENTIALS`,
   `./apigee-ui-mgmt-sa-key.json`, `../apigee-ui-mgmt-sa-key.json`) — self-signs a JWT and exchanges
   it at `https://oauth2.googleapis.com/token`.
2. The **Cloud Run metadata server**
   (`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token`) —
   this is the path taken in production.
3. `gcloud auth print-access-token` with SA impersonation, then plain `gcloud` — local fallback only.

Tokens are cached in memory (50 min for key-file JWTs, `expires_in - 300s` for metadata tokens).

With that token,
[`provisionUserDeveloperAndApp()`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L149-L332):

- creates the Apigee developer if `GET /developers/{email}` returns 404 (`userName` = local part of
  the email);
- creates or repairs a developer app named **`Unified Admin <username> App`** attached to the
  `Enterprise AI Tier` and `Enterprise Tools MCP` products, with a `DisplayName` attribute and
  `persona: admin`;
- fetches the shared consumer keys for the global `Unified Sales App` and `Unified Loans App` owned
  by `maloosatyam@google.com`;
- sets `monetizationConfig.billingType = PREPAID` when it is unset or different;
- credits a **$20 USD** starting balance if the wallet has never been credited.

The JSON response is
`{ email, token, name, username, apiKey, apiKeys: { admin, sales_agent, loans_agent }, provider, raw }`.

> [!NOTE]
> In the production Node server `token` is always the empty string and `provider` is
> `"Google Cloud Identity SSO (IAP)"` when the IAP header is present, otherwise `"Local Default SSO"`.
> Only the Vite dev server shells out to `gcloud auth print-identity-token` and returns a real
> bearer token, which is why the Bearer-JWT test scenarios are local-only.

#### 3. Apigee Management API handlers

Each of these acquires a token the same way and performs the Apigee REST call server-side against
organization `bap-apac-demo2`:

| Route | Methods | Upstream |
| :--- | :--- | :--- |
| `/api/kvm/rates` | `GET`, `PUT`, `POST` | KVM `ai-model-rates`, entry `rate_card`, env `prod` or `dev` |
| `/api/monetization/balance` | `GET` | `/developers/{dev}/balance` |
| `/api/monetization/credit` | `POST` | `/developers/{dev}/balance:credit` (USD, default 50 units) |
| `/api/monetization/rateplans` | `GET` | `/apiproducts/{Standard AI Tier,Enterprise AI Tier}/rateplans` |
| `/api/monetization/subscriptions` | `GET`, `POST` | `/developers/{dev}/subscriptions` |
| `/api/monetization/config` | `GET`, `PUT`, `POST` | `/developers/{dev}/monetizationConfig` |
| `/api/analytics/fleet-stats` | `GET` | Analytics `stats/dc_user_email,dc_model_name` and `stats/apiproxy`, plus the KVM rate card for cost maths |
| `/api/monetization/attributions` | `GET` | Developer list joined with balances and `dc_user_email` stats |

The `env` query parameter accepts `dev`, `bap` (mapped to `dev`) or anything else (mapped to `prod`).
Unsupported methods return `405`; a missing token returns `500`.

#### 4. Gateway reverse proxy routes

[`proxyRequest()`](file:///Users/maloosatyam/Codebase/AI%20Code/ui/server.js#L362-L415) forwards the
method, body and headers upstream, dropping `host`, `content-length`, `connection` and
`accept-encoding` on the way out, and dropping `content-encoding`, `content-length`,
`transfer-encoding` and `connection` on the way back before setting an accurate `Content-Length`.
This is what prevents browser decompression mismatches.

| Route prefix | Upstream |
| :--- | :--- |
| `/api/ai-dev/*` | `https://bap.api.maloosatyam.demo.altostrat.com/ai/v1/*` |
| `/api/ai-prod/*` | `https://api.maloosatyam.demo.altostrat.com/ai/v1/*` |
| `/api/claude-dev/*` | `https://bap.api.maloosatyam.demo.altostrat.com/v1/messages/*` |
| `/api/claude-prod/*` | `https://api.maloosatyam.demo.altostrat.com/v1/messages/*` |
| `/api/vertexai-dev/*` | `https://bap.api.maloosatyam.demo.altostrat.com/vertexai/v1/*` |
| `/api/vertexai-prod/*` | `https://api.maloosatyam.demo.altostrat.com/vertexai/v1/*` |
| `/api/mcp-dev/*` | `https://bap.api.maloosatyam.demo.altostrat.com/mcp/*` |
| `/api/mcp-prod/*` | `https://api.maloosatyam.demo.altostrat.com/mcp/*` |
| `/v1/*` | `https://api.maloosatyam.demo.altostrat.com/v1/*` (path preserved verbatim) |

Query strings are preserved on every route.

#### 5. Static SPA fallback

Anything else is served from `dist/`. Missing paths and directories fall back to `dist/index.html`
so client-side routing works; content type comes from a small extension map
(`.html .js .css .json .png .jpg .gif .svg .ico .woff .woff2`), defaulting to
`application/octet-stream`. A read failure returns `404 Not Found`.

### C. Credentials posture

There are **no API keys in the image, in the repository, or in the Cloud Run environment**. The
deployed revision declares no environment variables and no Secret Manager volumes or references —
only `PORT=8080`, baked in by the Dockerfile.

> [!CAUTION]
> `apigee-ui-mgmt-sa-key.json` sits at the repository root and `server.js` will load it if present in
> the working directory. It is a live service-account private key. It must never be baked into an
> image or committed to a shared branch; production relies on the metadata server instead.

---

## 4. DNS Mapping & Domain Status

| Hostname | Record | Value | Status |
| :--- | :--- | :--- | :--- |
| `ai-ui.maloosatyam.demo.altostrat.com` | `A` | `136.68.103.117` | Active |

- **HTTPS (443)** — terminated by `apigee-ai-ui-forwarding-rule` using `apigee-ai-ui-single-cert`
  (managed status `ACTIVE`).
- **HTTP (80)** — `apigee-ai-ui-http-forwarding-rule` returns `301 Moved Permanently` to the HTTPS
  origin.

The separate `apigee-lb-cert` certificate covers the gateway hosts
`api.maloosatyam.demo.altostrat.com` and `bap.api.maloosatyam.demo.altostrat.com`; those are the
Apigee data-plane endpoints, not this UI.

---

## 5. Operations & Maintenance Playbook

### A. Rebuilding and updating the UI

```bash
# 1. Build the SPA — the Dockerfile copies dist/, it does not build it
cd ui
npm run build
cd ..

# 2. Build and push the container image with Cloud Build
gcloud builds submit --tag asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest ui --project=bap-apac-demo2

# 3. Deploy the image to Cloud Run
gcloud run deploy apigee-ai-gateway-ui \
  --image=asia-southeast1-docker.pkg.dev/bap-apac-demo2/cloud-run-source-deploy/apigee-ai-gateway-ui:latest \
  --region=asia-southeast1 \
  --platform=managed \
  --no-allow-unauthenticated \
  --ingress=internal-and-cloud-load-balancing \
  --service-account=apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com \
  --project=bap-apac-demo2
```

Always pass the full flag set on step 3. Omitting `--ingress` or `--no-allow-unauthenticated` on a
redeploy can relax the service's security posture.

### B. Forcing a new revision without an image change

```bash
gcloud run services update apigee-ai-gateway-ui \
  --region=asia-southeast1 \
  --project=bap-apac-demo2 \
  --update-annotations="last-updated=$(date +%s)"
```

### C. Modifying IAP access permissions

```bash
# Grant access to a Google Group
gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services \
  --service=apigee-ai-ui-backend \
  --project=bap-apac-demo2 \
  --member="group:ai-team@google.com" \
  --role="roles/iap.httpsResourceAccessor"

# Grant access to an individual
gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services \
  --service=apigee-ai-ui-backend \
  --project=bap-apac-demo2 \
  --member="user:engineer@google.com" \
  --role="roles/iap.httpsResourceAccessor"

# Review the current policy
gcloud iap web get-iam-policy \
  --resource-type=backend-services \
  --service=apigee-ai-ui-backend \
  --project=bap-apac-demo2
```

### D. Viewing live logs and telemetry

```bash
# Tail Cloud Run container logs — these are Node.js stdout/stderr from server.js
gcloud run services logs tail apigee-ai-gateway-ui --region=asia-southeast1 --project=bap-apac-demo2

# Inspect load balancer request logs
gcloud logging read 'resource.type="http_load_balancer" AND resource.labels.forwarding_rule_name="apigee-ai-ui-forwarding-rule"' --limit=20 --project=bap-apac-demo2
```

Useful log prefixes emitted by `server.js`: `[Server] Production Node server listening on port 8080`
at boot, `[Server] Creating app ...`, `[Server] Adding $20 starting balance ...`,
`[Server] Proxy error to <url>: ...`, and `[Server] Failed to get gcloud auth token: ...`.

### E. Inspecting the deployed configuration

```bash
gcloud run services describe apigee-ai-gateway-ui --region=asia-southeast1 --project=bap-apac-demo2 --format=yaml
gcloud compute backend-services describe apigee-ai-ui-backend --global --project=bap-apac-demo2 --format="yaml(iap,backends,timeoutSec)"
gcloud compute ssl-certificates describe apigee-ai-ui-single-cert --global --project=bap-apac-demo2
```

---

## 6. Troubleshooting Matrix

| Symptom | Probable cause | Resolution |
| :--- | :--- | :--- |
| `The IAP service account is not provisioned` | The Google-managed IAP service agent is missing or lacks invoke permission | 1. `gcloud beta services identity create --service=iap.googleapis.com --project=bap-apac-demo2`<br>2. `gcloud run services add-iam-policy-binding apigee-ai-gateway-ui --region=asia-southeast1 --member="serviceAccount:service-1058667481809@gcp-sa-iap.iam.gserviceaccount.com" --role="roles/run.invoker"`<br>3. Redeploy the service |
| `403 Forbidden` on the raw `*.run.app` URL | Expected security behaviour | Direct Cloud Run access is blocked by ingress policy. Use `https://ai-ui.maloosatyam.demo.altostrat.com` |
| `You don't have access` on the Google sign-in page | Account is outside `@google.com` or missing the IAP role | Sign in with an authorized account or grant `roles/iap.httpsResourceAccessor` (section 5C) |
| `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` / `ERR_CONNECTION_CLOSED` | Managed certificate still provisioning | `gcloud compute ssl-certificates describe apigee-ai-ui-single-cert --global` must report `status: ACTIVE` |
| UI loads but shows stale content after a deploy | `ui/dist` was not rebuilt before `gcloud builds submit` | Run `npm run build` in `ui/`, then rebuild and redeploy |
| `/api/me` returns empty `apiKey` / `apiKeys` | The service account could not obtain a token or the Apigee Management API call failed | Check logs for `[Server] Failed to get gcloud auth token` or `[Server] Error provisioning user developer and apps`. Confirm `apigee-ui-mgmt-sa@bap-apac-demo2.iam.gserviceaccount.com` retains Apigee admin permissions |
| Management or analytics panels return HTTP 500 | Token acquisition failed inside a `/api/...` handler | Same as above — every handler returns `{"error": "Could not obtain GCP access token"}` on token failure |
| Network error calling the gateway from the UI | Apigee proxy unavailable, or an invalid API key | Verify the environment selected in the settings modal, then test the upstream directly: `curl -i https://api.maloosatyam.demo.altostrat.com/ai/v1/...`. The server-side routes are listed in section 3.B.4 |
| HTTP 429 from the gateway | Product-driven LLM token quota breached | Expected for the `gemini-2.5-flash` demo model, which is capped at 100 tokens/minute in the API product |

---

## 7. Not Implemented — Historical Notes

Earlier revisions of this guide described infrastructure that does not exist. It is recorded here so
the claims are not silently reintroduced.

| Former claim | Actual state |
| :--- | :--- |
| Container runs NGINX; tail "NGINX access and errors" | Container runs `node server.js` on `node:20-alpine`. `ui/nginx.conf.template` is unreferenced dead code |
| Secret Manager binding of `apigee-bronze-api-key`, `apigee-silver-api-key`, `apigee-sales-agent-api-key` | **None of these secrets exist** in project `bap-apac-demo2`, and the Cloud Run revision declares no secret references and no environment variables |
| An entrypoint script reads injected secrets into the frontend runtime at boot | No entrypoint script in the image. `/env-config.js` is generated by `server.js` and contains email/env defaults only — no keys |
| A secret-rotation playbook using `gcloud secrets versions add` | Removed. There are no application secrets to rotate; API keys are minted per user through the Apigee Management API |
| Secret Manager IAM troubleshooting row for the compute default service account | Removed as not applicable to this service |
