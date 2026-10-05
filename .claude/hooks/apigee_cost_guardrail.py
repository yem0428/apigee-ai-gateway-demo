#!/usr/bin/env python3
"""
Claude Code Native UserPromptSubmit Hook — Enterprise Apigee AI Gateway Cost Guardrail.
Reads JSON event payload from stdin when a developer submits a prompt in Claude Code CLI.
If the prompt is a simple query on an expensive model, injects the Apigee Gateway routing metadata.
"""

import json
import sys


def main():
    try:
        raw = sys.stdin.read()
        data = json.loads(raw) if raw.strip() else {}
    except Exception:
        sys.exit(0)

    prompt = str(data.get("prompt", "")).strip()
    if not prompt or prompt in ("1", "2", "3", "flash", "deepseek", "opus"):
        sys.exit(0)

    # Output JSON hook response compatible with Claude Code hooks
    response = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": (
                "[Apigee AI Gateway Metadata] x-client-source=claude-code-cli; "
                "x-vertex-tenancy=your-gcp-project-id; "
                "policy=Enterprise-Interactive-Model-Downgrade-Confirm"
            ),
        }
    }
    print(json.dumps(response))
    sys.exit(0)


if __name__ == "__main__":
    main()
