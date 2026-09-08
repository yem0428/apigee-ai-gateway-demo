import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    app_name: str = "Apigee ADK Agent Service"
    environment: str = os.getenv("ENVIRONMENT", "development")
    
    # Apigee Gateway Endpoints
    apigee_ai_gateway_url: str = os.getenv("APIGEE_AI_GATEWAY_URL", "http://localhost:8000/mock/ai")
    apigee_tools_gateway_url: str = os.getenv("APIGEE_TOOLS_GATEWAY_URL", "http://localhost:8000/mock/tools")
    apigee_api_key: str = os.getenv("APIGEE_API_KEY", "demo-apigee-api-key")
    
    # Default Model
    default_model: str = os.getenv("DEFAULT_MODEL", "gemini-1.5-flash")
    
    class Config:
        env_file = ".env"

settings = Settings()
