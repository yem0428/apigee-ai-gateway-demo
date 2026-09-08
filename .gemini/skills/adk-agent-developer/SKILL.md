---
name: adk-agent-developer
description: >-
  Develop, test, and containerize Python Google ADK (Agent Development Kit) agents.
  Use when writing agent logic, defining custom tool bindings that call the Apigee Tools Gateway,
  or testing agent endpoints against Apigee AI Gateway.
---

# ADK Agent Developer Skill

This skill guides the implementation and local/cloud execution of Python ADK agents using the Dual-Pattern.

## 1. Project Scaffolding
The agent service is located in `agents/`:
- `agents/app/main.py`: FastAPI server exposing `/chat` and `/health`.
- `agents/app/agent.py`: ADK Agent orchestrator.
- `agents/app/tools/`: Tool clients communicating via Apigee Tools Gateway.

## 2. Dual-Pattern Agent Setup
1. **Model Invocation via AI Gateway**:
   Configure the LLM client to use the Apigee AI Gateway base URL (`APIGEE_AI_GATEWAY_URL`):
   ```python
   import httpx
   from config import settings

   async def call_llm_via_gateway(messages, model="gemini-1.5-flash"):
       async with httpx.AsyncClient() as client:
           response = await client.post(
               f"{settings.apigee_ai_gateway_url}/v1/models/{model}:generateContent",
               headers={
                   "x-apikey": settings.apigee_api_key,
                   "x-target-model": model,
                   "Content-Type": "application/json"
               },
               json={"contents": messages}
           )
           return response.json()
   ```

2. **Tool Invocation via Tools Gateway**:
   Execute external tools via Apigee Tools Gateway:
   ```python
   async def execute_tool_via_gateway(tool_name: str, arguments: dict):
       async with httpx.AsyncClient() as client:
           response = await client.post(
               f"{settings.apigee_tools_gateway_url}/v1/tools/{tool_name}/execute",
               headers={"x-apikey": settings.apigee_api_key},
               json={"arguments": arguments}
           )
           return response.json()
   ```

## 3. Local Development & Testing
```bash
cd agents
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## 4. Containerizing for Cloud Run
```bash
docker build -t gcr.io/$GCP_PROJECT_ID/adk-agent:v1 agents/
docker run -p 8000:8000 --env-file agents/.env gcr.io/$GCP_PROJECT_ID/adk-agent:v1
```
