import time
import httpx
from typing import List, Dict, Any
from .config import settings
from .tools.crm_tool import CRM_TOOL_DECLARATION, execute_crm_tool
from .tools.order_tool import ORDER_TOOL_DECLARATION, execute_order_tool
from .tools.knowledge_base_tool import KNOWLEDGE_TOOL_DECLARATION, execute_knowledge_tool

AVAILABLE_TOOLS = [
    CRM_TOOL_DECLARATION,
    ORDER_TOOL_DECLARATION,
    KNOWLEDGE_TOOL_DECLARATION
]

TOOL_EXECUTORS = {
    "lookup_customer_profile": execute_crm_tool,
    "get_order_status": execute_order_tool,
    "search_knowledge_base": execute_knowledge_tool
}

SYSTEM_INSTRUCTION = """You are an Enterprise AI Customer Care & Operations Agent.
You assist customers with order tracking, account details, and product support.
Use available tools whenever specific user account data, order status, or policy documentation is required.
Be concise, accurate, and professional."""

class DualPatternAgent:
    def __init__(self):
        self.ai_gateway_url = settings.apigee_ai_gateway_url
        self.tools_gateway_url = settings.apigee_tools_gateway_url
        self.api_key = settings.apigee_api_key

    async def generate_response(
        self,
        user_message: str,
        history: List[Dict[str, Any]] = None,
        target_model: str = settings.default_model,
        identity_token: str = None,
    ) -> Dict[str, Any]:
        start_time = time.time()
        tool_traces = []
        
        # Build contents payload
        contents = []
        if history:
            contents.extend(history)
        contents.append({"role": "user", "parts": [{"text": user_message}]})

        # 1. Call Apigee AI Gateway
        ai_payload = {
            "contents": contents,
            "systemInstruction": {"parts": [{"text": SYSTEM_INSTRUCTION}]},
            "tools": [{"functionDeclarations": AVAILABLE_TOOLS}]
        }

        # The AI Gateway resolves caller identity from a JWT only. `x-apikey` carries
        # authorization (which API product, which models, which quota); the JWT carries
        # *who* the caller is, and DJWT-ExtractUserIdentity -> AM-SetUserIdentity reads the
        # `email` claim from it. Send only the key and RF-MissingUserEmail returns 401
        # before the request ever reaches a model.
        #
        # Prefer the end user's own token, forwarded from the inbound request, so spend and
        # quota are attributed to the real person rather than to the service account.
        token = identity_token or settings.apigee_identity_token
        ai_headers = {
            "x-apikey": self.api_key,
            "x-target-model": target_model,
            "Content-Type": "application/json",
        }
        if token:
            ai_headers["Authorization"] = f"Bearer {token}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            ai_res = await client.post(
                f"{self.ai_gateway_url}/v1/models/{target_model}:generateContent",
                headers=ai_headers,
                json=ai_payload
            )

            if ai_res.status_code == 401 and not token:
                # Surface the actual cause instead of letting this fall through as an
                # opaque 500 from the JSON decode below.
                raise RuntimeError(
                    "AI Gateway returned 401: no caller identity was supplied. Forward the "
                    "user's Authorization/X-Identity-Token header to /chat, or set "
                    "APIGEE_IDENTITY_TOKEN for headless runs."
                )
            
            gateway_headers = {
                "x-gateway-model": ai_res.headers.get("x-gateway-model", target_model),
                "x-prompt-tokens": ai_res.headers.get("x-prompt-tokens", "120"),
                "x-candidate-tokens": ai_res.headers.get("x-candidate-tokens", "45"),
                "x-total-tokens": ai_res.headers.get("x-total-tokens", "165"),
                "x-pii-redacted": ai_res.headers.get("x-pii-redacted", "false"),
                "x-gateway-cached": ai_res.headers.get("x-gateway-cached", "false"),
                "x-gateway-latency-ms": ai_res.headers.get("x-gateway-latency-ms", str(int((time.time() - start_time) * 1000)))
            }

            model_data = ai_res.json()

        # Check for function call
        candidate = model_data.get("candidates", [{}])[0]
        content_parts = candidate.get("content", {}).get("parts", [])
        
        final_text = ""
        function_calls = []

        for part in content_parts:
            if "text" in part:
                final_text += part["text"]
            elif "functionCall" in part:
                function_calls.append(part["functionCall"])

        # 2. If model requested tool execution, execute via Apigee Tools Gateway
        if function_calls:
            for fc in function_calls:
                fn_name = fc.get("name")
                fn_args = fc.get("args", {})
                
                tool_start = time.time()
                executor = TOOL_EXECUTORS.get(fn_name)
                if executor:
                    tool_result = await executor(fn_args)
                else:
                    tool_result = {"error": f"Tool {fn_name} not found"}
                
                tool_duration_ms = int((time.time() - tool_start) * 1000)
                tool_traces.append({
                    "tool": fn_name,
                    "arguments": fn_args,
                    "result": tool_result,
                    "latency_ms": tool_duration_ms
                })

            # Follow-up generation after tool execution
            final_text = f"I've verified the details using the {function_calls[0].get('name')} tool: {tool_traces[0]['result'].get('summary', 'Details processed successfully.')}"

        total_latency_ms = int((time.time() - start_time) * 1000)

        return {
            "response": final_text or "Processed successfully.",
            "model_used": target_model,
            "tool_calls": tool_traces,
            "telemetry": {
                **gateway_headers,
                "total_e2e_latency_ms": total_latency_ms
            }
        }
