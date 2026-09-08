import httpx
from ..config import settings

CRM_TOOL_DECLARATION = {
    "name": "lookup_customer_profile",
    "description": "Look up customer account details, tier, loyalty points, and contact info by customer ID or email.",
    "parameters": {
        "type": "object",
        "properties": {
            "customer_id": {"type": "string", "description": "Customer ID (e.g. CUST-1001)"},
            "email": {"type": "string", "description": "Customer email address"}
        },
        "required": []
    }
}

async def execute_crm_tool(arguments: dict) -> dict:
    """Executes customer lookup tool via Apigee Tools Gateway."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.apigee_tools_gateway_url}/v1/tools/lookup_customer_profile/execute",
            headers={"x-apikey": settings.apigee_api_key},
            json={"arguments": arguments}
        )
        return response.json()
