import httpx
from ..config import settings

ORDER_TOOL_DECLARATION = {
    "name": "get_order_status",
    "description": "Fetch shipping status, tracking numbers, and delivery dates for an order ID.",
    "parameters": {
        "type": "object",
        "properties": {
            "order_id": {"type": "string", "description": "Order reference code (e.g. ORD-98765)"}
        },
        "required": ["order_id"]
    }
}

async def execute_order_tool(arguments: dict) -> dict:
    """Executes order status tool via Apigee Tools Gateway."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.apigee_tools_gateway_url}/v1/tools/get_order_status/execute",
            headers={"x-apikey": settings.apigee_api_key},
            json={"arguments": arguments}
        )
        return response.json()
