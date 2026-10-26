#TODO, add password authentication for update user route

from fastapi import FastAPI

from typing_extensions import Annotated
from fastapi.middleware.cors import CORSMiddleware

import routes_auth

#CREDITS:
#https://www.mongodb.com/docs/languages/python/pymongo-driver/current/integrations/fastapi-integration/
#https://github.com/rajasami156/User-Authentication-with-FastAPI-and-MongoDB
#https://github.com/TAbhishek-Shukla/fastapi-mongo-auth

#UPDATE TO READ FROM ACTUAL ENV FILE USING DOTENV

app = FastAPI(
    title="Login and Account Creation API",
    summary="A sample application showing how to use FastAPI to add a ReST API to a MongoDB collection.",
)
app.include_router(routes_auth.router, prefix="/auth", tags=["auth"])


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
