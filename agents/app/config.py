import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Apigee ADK Agent Service"
    environment: str = os.getenv("ENVIRONMENT", "development")
    
    # Apigee Gateway Endpoints.
    # Both gateway URLs default to the local mock endpoints served by main.py so
    # the agent is runnable offline. Override BOTH in any deployed environment —
    # leaving them unset silently bypasses the AI and Tools gateways entirely.
    apigee_ai_gateway_url: str = os.getenv("APIGEE_AI_GATEWAY_URL", "http://localhost:8000/mock/ai")
    apigee_tools_gateway_url: str = os.getenv("APIGEE_TOOLS_GATEWAY_URL", "http://localhost:8000/mock/tools")

    # No literal fallback: a hardcoded key would be a committed credential, and a
    # bogus one turns an auth misconfiguration into a confusing 401 from the
    # gateway. Fail loudly at startup instead.
    apigee_api_key: str = os.getenv("APIGEE_API_KEY", "")

    # Caller identity for headless runs only. The AI Gateway reads the `email` claim from
    # a JWT and rejects anything else with 401 — `x-apikey` alone is not enough. In a real
    # deployment the end user's own token is forwarded from the inbound /chat request; this
    # is the fallback for cron jobs and smoke tests that have no user context.
    # Same rule as above: no literal default, ever.
    apigee_identity_token: str = os.getenv("APIGEE_IDENTITY_TOKEN", "")

    # Default Model. Must be a model entitled by the caller's API product —
    # an unentitled ID is rejected at VA-VerifyAPIKey before it reaches Vertex.
    default_model: str = os.getenv("DEFAULT_MODEL", "gemini-3.1-flash-lite")
    
    class Config:
        env_file = ".env"

settings = Settings()
