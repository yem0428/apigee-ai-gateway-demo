# Demo Script — Apigee AI Gateway

A presenter's talk track for the live demo UI.

Everything in this app is real: every prompt goes through a deployed Apigee proxy to a real
model on Vertex AI, and every number in the telemetry panel came back from that call. There
are no mocked responses. Say that out loud early — it is the single most credible thing
about the demo, and people assume the opposite.

---

## 0. Before you present

| Check | Why |
| --- | --- |
| Open the UI and send one throwaway prompt | Cold-start on the first call makes the gateway look slow. Warm it up before anyone is watching. |
| Confirm the environment badge in the footer | It reads `PROD` or `DEV`. Demo from **prod**. Dev is for testing changes. |
| Persona is **Admin** | Non-admin personas hide the Monetization tab and are blocked from some models — correct behaviour, but not what you want mid-flow. |
| Hit **Reset** | Clears the transcript so the first "what changed" hint is clean. |

> [!TIP]
> Two ways in: `?settings=open` lands on the configuration drawer, `?tour=open` starts the
> guided tour immediately. Both are usable as bookmarks or slide links.

---

## 1. The three-minute version: **Guide me**

Bottom-right, next to the settings cog. It walks 13 steps, switches tabs for you, and
**fires real gateway calls as it goes** — so the narration lands on live telemetry rather
than on a description of it.

Use it when:

- You are handing the laptop to someone else.
- You have three minutes, not thirty.
- You want the audience to self-serve after the meeting.

Controls: **Next** / **Back**, `Esc` to leave, and the tour is non-modal, so you can click
the thing it is pointing at while the step is still on screen. That is deliberate.

---

## 2. The full script

The chat pane is on the left, the **Gateway Telemetry** inspector on the right. The six
scenario chips sit under the prompt box and cycle through their steps as you click them.

### Scenario A — One endpoint, many models

> **Click:** `🧠 Model Routing` chip → sub-button **Simple**

**Point at:** the *Model Routing* card, top-right.

The client posted to `/auto`. It never named a model. An LLM router classified the prompt
and the gateway picked the tier that matches.

> **Click:** the same chip's **Coding** sub-button.

**Point at:** the *Model Routing* card — it turns purple whenever the router chose the
model — and the `Routed to <model>` badge under the target URL on the new reply.

Same URL, same credential, different vendor. The reply itself shows the switch without
anyone needing to read the panel.

**The line:** *"The category-to-model map is a custom attribute on the API Product. Swapping
in a cheaper model for one category is a config change, not a deployment."*

> [!NOTE]
> The router chain lives in the proxy's `AutoRoutingFlow`, so it only executes for `/auto`
> requests. A direct call to `/models/<name>` skips it entirely and pays nothing for it.

---

### Scenario B — Semantic cache

> **Click:** `⚡ Cache` chip → **Seed (Miss)**

**Point at:** *Latency* and the cost on the *Model Routing* card. This is the real price of
the call.

> **Click:** the same chip → **Instant Hit ($0)**

Read the prompts aloud, side by side. They are **differently worded questions with the same
meaning** — not a repeat. The cache matched on embedding similarity, not on string equality.

**Point at:** the *Semantic Cache* card. It turns green on a hit: `Vector Cache Hit`,
`$0 Token Cost`. Then the *Latency* figure above it, against what the seed call cost.

> [!TIP]
> If the vector index is still warm from an earlier rehearsal, **Seed (Miss)** will itself
> come back as a hit, so both cards are green and the latency gap is small. The *Semantic
> Cache* card is still true either way. Or hit **Reset** and use a prompt of your own to
> get a genuine cold miss.

**The line:** *"Exact-match caching never fires in production, because humans never ask the
same question twice the same way."*

> [!IMPORTANT]
> On a cache hit the panel says **"Served from cache"** and credits *no* model. That is not
> a gap — the cache is keyed on the prompt alone and the router never runs, so the gateway
> genuinely cannot attribute a model. Claiming one would be a lie in a telemetry panel.

---

### Scenario C — Access control

> **Click:** `🚫 Access Control` chip → **Missing Auth**, then → **Restricted Model**

Two different 401s from two different causes: no caller identity at all, and a valid
Enterprise key calling a model its API Product does not entitle it to.

**The line:** *"Model entitlement is an API Product attribute. The same key that works for
Flash is rejected for Opus, and the application never had to be changed."*

---

### Scenario D — Model Armor

> **Click:** `🛡️ Model Armor` chip → **Destructive**, **Jailbreak**, **PII Exfil**

Three prompts that never reach the model. The *Model Armor* card flips to **Blocked (400)**.

**The line:** *"This is enforced at the gateway, so it applies to every model behind it —
including the one a team stands up next quarter without telling you."*

---

### Scenario E — Tokenomics and quota

> **Click:** `⚡ Tokenomics` chip → **Within Limit**, then → **Limit Exceeded**

The second call returns a real **429** from the token-rate quota, not a simulated one.

**Point at:** the *Token* card flipping to *Quota Exceeded*, and the *Wallet* card.

**The line:** *"Rate limits on LLM traffic have to be counted in tokens, not requests. One
request can cost a thousand times another."*

---

## 3. Proving it: the Request Flow

On **any** reply, click **Request Flow**.

This opens the exact ordered sequence of Apigee policies that specific call executed —
auth, Model Armor, routing, cache lookup, quota, cost accounting. Not a generic diagram;
that call's path.

This is usually the moment the architect in the room starts asking good questions. Leave
time for it.

---

## 4. Looking back at earlier calls

Every reply carrying telemetry is clickable, and each one also has an explicit
**Telemetry** button next to **Request Flow**.

- Click an earlier reply → the inspector loads **that** call, and shows an amber
  *Viewing an earlier call* banner with **Back to latest**.
- Flick between two replies to compare them directly: the *Model Routing* and *Semantic
  Cache* cards light up on whichever call actually routed or hit the cache.

Use this when someone asks *"wait, go back — what did the first one cost?"* You do not have
to re-run it.

---

## 5. The surrounding tabs

| Tab | What to say | Notes |
| --- | --- | --- |
| **MCP Gateway** | Tool calls, not prompts, through the same gateway with the same identity and quota enforcement. | Deployed to **prod only**. |
| **Analytics & Cost** | Traffic, tokens and spend per model and per developer, from Apigee analytics. | |
| **Monetization** | Rate plans, prepaid wallets, per-developer billing. | **Admin persona only.** |
| **Architecture** (navbar) | The full blueprint, if someone wants the whole picture at once. | |

---

## 6. Things that will go wrong, and what to say

| Symptom | Cause | Recovery |
| --- | --- | --- |
| Cache **Instant Hit** returns a MISS | The cache TTL is short. If the seed ran more than ~20 minutes ago, it has lapsed. | Click **Seed (Miss)** again, then **Instant Hit**. Say "the cache has a deliberately short TTL here so the demo does not go stale". |
| First call of the session is slow | Cold start. | Warm it up before you present (see §0). |
| Monetization tab is missing | You are not on the Admin persona. | Gateway Settings → persona → Admin. |
| A `/auto` prompt routes somewhere you did not expect | The router is a real classifier on a real prompt. It is allowed to disagree with you. | Lean in: *"that is a genuine classification, not a lookup table — and if you disagree with it, you change the product attribute, not the code."* |

---

## 7. What the telemetry cards mean

| Card | Reads |
| --- | --- |
| **Model Routing** | Which model actually served the call, its provider, cost tier, the router's intent label, and the USD cost. Says *Served from cache* when no model ran. |
| **Token** | Prompt / output / total tokens, or the quota rejection. |
| **Latency** | Round-trip through the gateway, including the router when `/auto` was used. |
| **Semantic Cache** | Whether `use-cache` was sent, and whether it hit. |
| **Model Armor** | Clean, or the specific block reason. |
| **Wallet** | Prepaid balance before and after this call. |

---

## Appendix — running it yourself

Local UI against the dev gateway:

```bash
cd ui && npm install
PORT=3000 DEFAULT_ENV=dev node server.js
```

Live tests default to **dev**. Pointing them at prod requires an explicit opt-in, because
prod is the environment other people demo from:

```bash
npm run test:live        # dev
npm run test:live:prod   # prod, requires TEST_ALLOW_PROD=1 (set by the script)
```
