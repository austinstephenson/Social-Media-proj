from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    mongodb_url: str = Field(..., alias="MONGODB_URL")
    project_name: str = Field(default="FastAPI Mongo Demo", alias="PROJECT_NAME")
    jwt_secret: str = Field(..., alias="JWT_SECRET")   # 👈 add this
    jwt_expire_minutes: int = Field(default=30*60*60*7, alias="JWT_EXPIRE_MINUTES")  # optional

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()