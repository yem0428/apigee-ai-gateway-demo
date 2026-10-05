import httpx
from ..config import settings

KNOWLEDGE_TOOL_DECLARATION = {
    "name": "search_knowledge_base",
    "description": "Search product manuals, refund policies, warranty documentation, and FAQs.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query keywords"}
        },
        "required": ["query"]
    }
}

async def execute_knowledge_tool(arguments: dict) -> dict:
    """Executes knowledge base search via Apigee Tools Gateway."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{settings.apigee_tools_gateway_url}/v1/tools/search_knowledge_base/execute",
            headers={"x-apikey": settings.apigee_api_key},
            json={"arguments": arguments}
        )
        return response.json()
