#!/usr/bin/env python3
"""
Enterprise Apigee AI Gateway — Interactive Claude Code CLI Terminal Demo
Connects live to the deployed Apigee AI Gateway in GCP project `your-gcp-project-id`.

Usage:
  python3 claude_code_cli_demo.py
  python3 claude_code_cli_demo.py --demo-1a   # Run Step 1-A (Interactive Confirm) immediately
  python3 claude_code_cli_demo.py --demo-1b   # Run Step 1-B (Unattended Subagent Auto-Override)
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

GATEWAY_UI_URL = os.environ.get(
    "APIGEE_GATEWAY_URL",
    "https://apigee-ai-gateway-ui.a.run.app",
).rstrip("/")
APIGEE_NIP_IO = "https://dev.api.gateway.example.com/ai/v1"

# ANSI colors for authentic Claude Code CLI look
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
ITALIC = "\033[3m"
ORANGE = "\033[38;5;208m"
CYAN = "\033[38;5;45m"
GREEN = "\033[38;5;42m"
YELLOW = "\033[38;5;220m"
RED = "\033[38;5;196m"
MAGENTA = "\033[38;5;141m"
GRAY = "\033[38;5;245m"
WHITE = "\033[97m"


def fetch_session_credentials():
    """Fetch live API key and JWT identity from the deployed Cloud Run Gateway service."""
    req = urllib.request.Request(
        f"{GATEWAY_UI_URL}/api/me",
        headers={"User-Agent": "claude-code-cli/2.1.19 (enterprise-cli)"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        ent_key = data.get("keys", {}).get("enterprise", "enterprise-demo-key")
        email = data.get("user", {}).get("email", "developer@example.com")
        return ent_key, email


def call_gateway_generate(
    api_key: str,
    email: str,
    model: str,
    prompt_text: str,
    override_mode: str = "",
    original_model: str = "",
    subagent_name: str = "",
):
    """Send a live generateContent request through the Apigee AI Gateway."""
    url = f"{GATEWAY_UI_URL}/api/ai-dev/v1beta/models/{model}:generateContent"
    headers = {
        "Content-Type": "application/json",
        "x-apikey": api_key,
        "X-Identity-Token": email,
        "x-client-source": "claude-code-cli",
    }
    if override_mode:
        headers["x-gateway-override-mode"] = override_mode
    if original_model:
        headers["x-original-requested-model"] = original_model
    if subagent_name:
        headers["x-subagent-name"] = subagent_name

    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt_text}]}]
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=30) as resp:
        elapsed_ms = int((time.time() - t0) * 1000)
        resp_headers = {k.lower(): v for k, v in resp.getheaders()}
        body = json.loads(resp.read().decode("utf-8"))
        return resp.status, resp_headers, body, elapsed_ms


def print_banner(active_model: str, email: str):
    print()
    print(f"{ORANGE}{BOLD}╭──────────────────────────────────────────────────────────────────────────────╮{RESET}")
    print(f"{ORANGE}{BOLD}│ ✻ Claude Code CLI {WHITE}v2.1.19{ORANGE} — Enterprise AI Gateway Edition               │{RESET}")
    print(f"{ORANGE}{BOLD}├──────────────────────────────────────────────────────────────────────────────┤{RESET}")
    print(f"{ORANGE}│{RESET} {GRAY}ANTHROPIC_BASE_URL :{RESET} {CYAN}{APIGEE_NIP_IO}{RESET}{' ' * 21}{ORANGE}│{RESET}")
    print(f"{ORANGE}│{RESET} {GRAY}GCP Project / VPC  :{RESET} {WHITE}your-gcp-project-id (asia-southeast1 Vertex Tenancy){RESET}{' ' * 10}{ORANGE}│{RESET}")
    print(f"{ORANGE}│{RESET} {GRAY}Caller Identity    :{RESET} {GREEN}{email:<55}{RESET}{ORANGE}│{RESET}")
    print(f"{ORANGE}│{RESET} {GRAY}Default CLI Model  :{RESET} {MAGENTA}{BOLD}{active_model:<55}{RESET}{ORANGE}│{RESET}")
    print(f"{ORANGE}{BOLD}╰──────────────────────────────────────────────────────────────────────────────╯{RESET}")
    print(f"{GRAY}  Commands: Type any prompt (or press {WHITE}Enter{GRAY} for default simple query demo){RESET}")
    print(f"{GRAY}            Type {WHITE}/subagent <prompt>{GRAY} to test Step 1-B Unattended Subagent Auto-Override{RESET}")
    print(f"{GRAY}            Type {WHITE}/model <name>{GRAY} to switch CLI model | Type {WHITE}exit{GRAY} to quit{RESET}")
    print()


def is_simple_query(prompt: str) -> bool:
    lower = prompt.lower().strip()
    complex_keywords = ["architecture", "benchmark", "trade-off", "distributed", "refactor", "design"]
    if any(k in lower for k in complex_keywords):
        return False
    return len(prompt.strip()) < 120


def run_interactive_confirm_flow(api_key: str, email: str, active_model: str, prompt_text: str):
    """Step 1-A: Interactive Developer Session in Claude Code CLI with Gateway Cost-Guardrail Confirm."""
    print()
    print(f"{DIM}⠋ Sending request to Apigee AI Gateway ({APIGEE_NIP_IO})...{RESET}")
    time.sleep(0.35)

    # Check if expensive Claude model is used for a simple query
    if ("opus" in active_model or "sonnet" in active_model) and is_simple_query(prompt_text):
        print(f"\n{YELLOW}{BOLD}╭──────────────────────────────────────────────────────────────────────────────╮{RESET}")
        print(f"{YELLOW}{BOLD}│ ⚡ APIGEE AI GATEWAY — COST & MODEL ROUTING GUARDRAIL (VERTEX TENANCY)      │{RESET}")
        print(f"{YELLOW}{BOLD}├──────────────────────────────────────────────────────────────────────────────┤{RESET}")
        print(f"{YELLOW}│{RESET} • {GRAY}Client Source     :{RESET} {WHITE}claude-code-cli (Interactive Developer Session){RESET}        {YELLOW}│{RESET}")
        print(f"{YELLOW}│{RESET} • {GRAY}Requested Model   :{RESET} {RED}{BOLD}{active_model}{RESET} {GRAY}($15.00 / $75.00 per 1M tok){RESET}   {YELLOW}│{RESET}")
        print(f"{YELLOW}│{RESET} • {GRAY}Prompt Complexity :{RESET} {GREEN}Score 0.12 — Low / Simple Lookup{RESET}                       {YELLOW}│{RESET}")
        print(f"{YELLOW}│{RESET} • {GRAY}Gateway Policy    :{RESET} {CYAN}Enterprise-Interactive-Model-Downgrade-Confirm{RESET}                {YELLOW}│{RESET}")
        print(f"{YELLOW}{BOLD}╰──────────────────────────────────────────────────────────────────────────────╯{RESET}")
        print(f"  {YELLOW}⚠️  Apigee AI Gateway paused this expensive Claude Opus 4.5 call.{RESET}")
        print(f"  {GRAY}Running a simple query on {WHITE}{active_model}{GRAY} costs 200x more than Flash-Lite.{RESET}\n")
        print(f"  {BOLD}How would you like Apigee AI Gateway to route this request?{RESET}")
        print(f"    {GREEN}{BOLD}[1]{RESET} Switch to {GREEN}{BOLD}gemini-3.1-flash-lite{RESET}  {GRAY}($0.075 / 1M tok — {GREEN}Save 99.5%{GRAY} • Recommended){RESET}")
        print(f"    {CYAN}{BOLD}[2]{RESET} Switch to {CYAN}{BOLD}deepseek-v4 (Vertex VPC){RESET}  {GRAY}($0.270 / 1M tok — {CYAN}Save 98.2%{GRAY} • Vertex Model Garden){RESET}")
        print(f"    {RED}{BOLD}[3]{RESET} Keep      {RED}{BOLD}{active_model}{RESET} {GRAY}($15.00 / 1M tok — Proceed & log justification){RESET}")
        print()

        try:
            choice = input(f"  {ORANGE}{BOLD}? Select option [1/2/3] (Press Enter for 1): {RESET}").strip()
        except EOFError:
            choice = "1"

        if choice == "2":
            target_model = "deepseek-v4"
            override_mode = "confirmed-switch"
            print(f"\n  {CYAN}✔ Confirmed:{RESET} Rerouting in-flight request from {RED}{active_model}{RESET} → {CYAN}{BOLD}deepseek-v4{RESET} (Vertex Dedicated Tenancy)...")
        elif choice == "3":
            target_model = active_model
            override_mode = "confirmed-keep"
            print(f"\n  {YELLOW}✔ Confirmed:{RESET} Retaining {RED}{BOLD}{active_model}{RESET} (Audit log recorded in Cloud Logging)...")
        else:
            target_model = "gemini-3.1-flash-lite"
            override_mode = "confirmed-switch"
            print(f"\n  {GREEN}✔ Confirmed:{RESET} Rerouting in-flight request from {RED}{active_model}{RESET} → {GREEN}{BOLD}gemini-3.1-flash-lite{RESET} (99.5% Cost Saved)...")
    else:
        target_model = active_model
        override_mode = ""

    status, headers, body, elapsed_ms = call_gateway_generate(
        api_key=api_key,
        email=email,
        model=target_model,
        prompt_text=prompt_text,
        override_mode=override_mode,
        original_model=active_model,
    )

    answer = (
        body.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
        .strip()
    )
    gw_model = headers.get("x-gateway-model", target_model)
    gw_req_model = headers.get("x-gateway-requested-model", active_model)
    gw_cost = headers.get("x-gateway-cost-usd", "0.000010")
    gw_tokens = headers.get("x-gateway-total-tokens", "68")
    gw_reason = headers.get("x-gateway-override-reason", "Direct Route")
    gw_tenancy = headers.get("x-vertex-tenancy", "your-gcp-project-id (Vertex AI asia-southeast1)")

    print()
    print(f"{GREEN}{BOLD}╭──────────────────────────────────────────────────────────────────────────────╮{RESET}")
    print(f"{GREEN}{BOLD}│ ✅ APIGEE AI GATEWAY — LIVE EXECUTION TELEMETRY                             │{RESET}")
    print(f"{GREEN}{BOLD}├──────────────────────────────────────────────────────────────────────────────┤{RESET}")
    print(f"{GREEN}│{RESET} • {GRAY}Requested Model  :{RESET} {WHITE}{gw_req_model:<55}{RESET}{GREEN}│{RESET}")
    print(f"{GREEN}│{RESET} • {GRAY}Executed Model   :{RESET} {GREEN}{BOLD}{gw_model:<55}{RESET}{GREEN}│{RESET}")
    print(f"{GREEN}│{RESET} • {GRAY}Tokens & Cost    :{RESET} {WHITE}{gw_tokens} tokens  |  ${gw_cost} USD  (vs $0.003450 on Opus 4.5){RESET}     {GREEN}│{RESET}")
    print(f"{GREEN}│{RESET} • {GRAY}Vertex Tenancy   :{RESET} {CYAN}{gw_tenancy:<55}{RESET}{GREEN}│{RESET}")
    print(f"{GREEN}│{RESET} • {GRAY}Gateway Latency  :{RESET} {WHITE}{elapsed_ms} ms{RESET}{' ' * (52 - len(str(elapsed_ms)))}{GREEN}│{RESET}")
    print(f"{GREEN}│{RESET} • {GRAY}Audit Decision   :{RESET} {GRAY}{gw_reason[:55]:<55}{RESET}{GREEN}│{RESET}")
    print(f"{GREEN}{BOLD}╰──────────────────────────────────────────────────────────────────────────────╯{RESET}")
    print(f"\n{ORANGE}{BOLD}⏺ Claude ({gw_model}):{RESET}\n{WHITE}{answer}{RESET}\n")


def run_subagent_auto_override_flow(api_key: str, email: str, active_model: str, prompt_text: str):
    """Step 1-B: Unattended Subagent Zero-Touch Auto-Override (no human confirmation prompt)."""
    print()
    print(f"{MAGENTA}{BOLD}╭──────────────────────────────────────────────────────────────────────────────╮{RESET}")
    print(f"{MAGENTA}{BOLD}│ 🤖 CLAUDE CODE SUBAGENT SPAWNED — UNATTENDED BACKGROUND TASK                │{RESET}")
    print(f"{MAGENTA}{BOLD}├──────────────────────────────────────────────────────────────────────────────┤{RESET}")
    print(f"{MAGENTA}│{RESET} • {GRAY}Subagent Header  :{RESET} {WHITE}x-subagent-name: code-review-worker{RESET}                    {MAGENTA}│{RESET}")
    print(f"{MAGENTA}│{RESET} • {GRAY}Requested Model  :{RESET} {RED}{active_model}{RESET}                                {MAGENTA}│{RESET}")
    print(f"{MAGENTA}│{RESET} • {GRAY}Gateway Action   :{RESET} {CYAN}Zero-Touch Auto-Override (No Human Prompt){RESET}             {MAGENTA}│{RESET}")
    print(f"{MAGENTA}{BOLD}╰──────────────────────────────────────────────────────────────────────────────╯{RESET}")

    status, headers, body, elapsed_ms = call_gateway_generate(
        api_key=api_key,
        email=email,
        model=active_model,
        prompt_text=prompt_text,
        override_mode="auto-override",
        original_model=active_model,
        subagent_name="code-review-worker",
    )

    answer = (
        body.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
        .strip()
    )
    gw_model = headers.get("x-gateway-model", "deepseek-v4")
    gw_cost = headers.get("x-gateway-cost-usd", "0.000038")
    gw_tenancy = headers.get("x-vertex-tenancy", "enterprise-dedicated-vpc (Vertex AI asia-southeast1)")
    gw_reason = headers.get("x-gateway-override-reason", "")

    print(f"  {CYAN}⚡ Auto-Rerouted by Apigee:{RESET} {RED}{active_model}{RESET} → {CYAN}{BOLD}{gw_model}{RESET} ({gw_tenancy})")
    print(f"  {GRAY}   Reason: {gw_reason}{RESET}")
    print(f"  {GRAY}   Cost: ${gw_cost} USD (98.2% saved) | Latency: {elapsed_ms} ms{RESET}")
    print(f"\n{CYAN}{BOLD}⏺ Subagent ({gw_model}):{RESET}\n{WHITE}{answer}{RESET}\n")


def main():
    active_model = "claude-opus-4-5@20251101"
    try:
        api_key, email = fetch_session_credentials()
    except Exception as exc:
        print(f"{RED}Failed to connect to Gateway ({GATEWAY_UI_URL}): {exc}{RESET}")
        sys.exit(1)

    print_banner(active_model, email)

    if "--demo-1a" in sys.argv:
        default_q = "What is the HTTP status code for Too Many Requests, and what does it mean in 1 sentence?"
        print(f"{ORANGE}{BOLD}claude ({active_model}) > {RESET}{WHITE}{default_q}{RESET}")
        run_interactive_confirm_flow(api_key, email, active_model, default_q)
        return

    if "--demo-1b" in sys.argv:
        sub_q = "Write a Python function to validate semantic version strings with unit tests"
        print(f"{ORANGE}{BOLD}claude ({active_model}) > {RESET}{WHITE}/subagent {sub_q}{RESET}")
        run_subagent_auto_override_flow(api_key, email, active_model, sub_q)
        return

    while True:
        try:
            user_input = input(f"{ORANGE}{BOLD}claude ({active_model}) > {RESET}").strip()
        except (EOFError, KeyboardInterrupt):
            print(f"\n{GRAY}Session ended.{RESET}")
            break

        if user_input.lower() in ("exit", "quit", "/quit", "/exit"):
            print(f"{GRAY}Session ended.{RESET}")
            break

        if not user_input:
            # Default Step 1-A simple query when pressing Enter
            user_input = "What is the HTTP status code for Too Many Requests, and what does it mean in 1 sentence?"
            print(f"{DIM}  (Using default Step 1-A simple query): \"{user_input}\"{RESET}")

        if user_input.startswith("/model"):
            parts = user_input.split(maxsplit=1)
            if len(parts) > 1:
                active_model = parts[1].strip()
                print(f"{GREEN}✔ Active CLI model set to: {BOLD}{active_model}{RESET}\n")
            else:
                print(f"{GRAY}Available models: claude-opus-4-5@20251101, claude-sonnet-4-6, gemini-3.1-flash-lite, deepseek-v4, kimi-k3, glm-5.3{RESET}\n")
            continue

        if user_input.startswith("/subagent"):
            sub_q = user_input[len("/subagent"):].strip() or "Write a Python function to validate semantic version strings with unit tests"
            run_subagent_auto_override_flow(api_key, email, active_model, sub_q)
            continue

        run_interactive_confirm_flow(api_key, email, active_model, user_input)


if __name__ == "__main__":
    main()
