import time
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from .config import settings
from .agent import DualPatternAgent, AVAILABLE_TOOLS

app = FastAPI(
    title="Apigee ADK Agent Service",
    description="Enterprise backend service hosting Google ADK agents using the Dual-Pattern (fronted by Apigee APIM, consuming Apigee AI & Tools Gateways).",
    version="1.0.0"
)

# CORS middleware for testing UI
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

agent_instance = DualPatternAgent()

class ChatRequest(BaseModel):
    message: str
    target_model: Optional[str] = "gemini-1.5-flash"
    history: Optional[List[Dict[str, Any]]] = []

class ToolExecuteRequest(BaseModel):
    arguments: Dict[str, Any]

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "environment": settings.environment
    }

@app.get("/tools/catalog")
def list_tools():
    return {"tools": AVAILABLE_TOOLS}

@app.post("/chat")
async def chat_endpoint(req: ChatRequest, x_apikey: Optional[str] = Header(None)):
    """Primary chat endpoint fronted by Apigee APIM."""
    try:
        result = await agent_instance.generate_response(
            user_message=req.message,
            history=req.history,
            target_model=req.target_model
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# -------------------------------------------------------------
# Local Gateway Simulation Endpoints (For UI testing & fallback)
# -------------------------------------------------------------
@app.post("/mock/ai/v1/models/{model}:generateContent")
async def mock_ai_gateway(model: str, payload: Dict[str, Any]):
    """Simulates Apigee AI Gateway response with telemetry headers & function calls."""
    contents = payload.get("contents", [])
    last_text = ""
    if contents:
        parts = contents[-1].get("parts", [])
        if parts:
            last_text = parts[0].get("text", "")

    # Check for PII keywords
    pii_redacted = "true" if any(k in last_text for k in ["@", "4532", "123-45"]) else "false"

    # Simulate tool call intent
    if "order" in last_text.lower() or "ORD-" in last_text:
        return {
            "candidates": [{
                "content": {
                    "parts": [{
                        "functionCall": {
                            "name": "get_order_status",
                            "args": {"order_id": "ORD-98765"}
                        }
                    }]
                }
            }],
            "usageMetadata": {
                "promptTokenCount": 142,
                "candidatesTokenCount": 38,
                "totalTokenCount": 180
            }
        }
    elif "customer" in last_text.lower() or "tier" in last_text or "points" in last_text:
        return {
            "candidates": [{
                "content": {
                    "parts": [{
                        "functionCall": {
                            "name": "lookup_customer_profile",
                            "args": {"customer_id": "CUST-1001"}
                        }
                    }]
                }
            }],
            "usageMetadata": {
                "promptTokenCount": 135,
                "candidatesTokenCount": 35,
                "totalTokenCount": 170
            }
        }
    
    # Default direct response
    return {
        "candidates": [{
            "content": {
                "parts": [{
                    "text": f"This is an enterprise response governed by Apigee AI Gateway using model [{model}]. Your prompt: '{last_text}' was validated and processed."
                }]
            }
        }],
        "usageMetadata": {
            "promptTokenCount": 98,
            "candidatesTokenCount": 42,
            "totalTokenCount": 140
        }
    }

@app.post("/mock/tools/v1/tools/{tool_id}/execute")
async def mock_tools_gateway(tool_id: str, req: ToolExecuteRequest):
    """Simulates Apigee Tools Gateway secure tool execution backend."""
    args = req.arguments
    if tool_id == "get_order_status":
        order_id = args.get("order_id", "ORD-98765")
        return {
            "tool": tool_id,
            "status": "success",
            "order_id": order_id,
            "shipping_status": "Out for Delivery",
            "carrier": "FedEx",
            "tracking_number": "TRK-883920192",
            "estimated_delivery": "Today by 4:00 PM",
            "summary": f"Order {order_id} is currently Out for Delivery by FedEx with estimated arrival today by 4:00 PM."
        }
    elif tool_id == "lookup_customer_profile":
        cust_id = args.get("customer_id", "CUST-1001")
        return {
            "tool": tool_id,
            "status": "success",
            "customer_id": cust_id,
            "name": "Alice Johnson",
            "membership_tier": "Platinum VIP",
            "loyalty_points": 4520,
            "account_status": "Active",
            "summary": f"Customer {cust_id} (Alice Johnson) holds a Platinum VIP membership with 4,520 loyalty points."
        }
    elif tool_id == "search_knowledge_base":
        query = args.get("query", "refund")
        return {
            "tool": tool_id,
            "status": "success",
            "query": query,
            "top_match": "Standard Refund Policy (Article #KB-402)",
            "content": "Items can be returned within 30 days for a full refund if in original condition.",
            "summary": "According to Article #KB-402, customers are eligible for a full refund within 30 days of delivery."
        }
    return {"error": "Tool not recognized", "status": "failed"}
