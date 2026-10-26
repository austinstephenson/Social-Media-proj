from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings
from pydantic import Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

class Settings(BaseSettings):
    mongodb_url: str = Field(..., alias="MONGODB_URL")
    project_name: str = Field(default="FastAPI Mongo Demo", alias="PROJECT_NAME")
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    jwt_expire_minutes: int = Field(default=30*60*60*7, alias="JWT_EXPIRE_MINUTES")  # optional

settings = Settings()