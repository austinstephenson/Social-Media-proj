from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    mongodb_url: str = Field(..., alias="MONGODB_URL")
    project_name: str = Field(default="FastAPI Mongo Demo", alias="PROJECT_NAME")
    jwt_secret: str = Field(..., alias="JWT_SECRET")   # 👈 add this
    jwt_expire_minutes: int = Field(default=30*60*60*7, alias="JWT_EXPIRE_MINUTES")  # optional
    allowed_origins: list[str] = Field(default=["http://localhost:5173"], alias="ALLOWED_ORIGINS")
    webrtc_ice_servers: list[dict] = Field(
        default=[{"urls": "stun:stun.l.google.com:19302"}], alias="WEBRTC_ICE_SERVERS"
    )

    enable_docs: bool = Field(default=True, alias="ENABLE_DOCS")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

settings = Settings()
