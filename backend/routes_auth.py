import os

from fastapi import APIRouter, FastAPI, Body, HTTPException, status
from fastapi.responses import Response

from bson import ObjectId
from pymongo import AsyncMongoClient
from pymongo import ReturnDocument

from security import hash_password, verify_password
from schemas import UserModel, UpdateUserModel, UserCollection


from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from schemas import UserModel, UserLogin, UserOut, UserCreate
from security import hash_password, verify_password
from jwt import create_access_token
from config import settings

router = APIRouter()
security = HTTPBearer()


client = AsyncMongoClient(settings.mongodb_url)
db = client.SocialMedia
user_collection = db.get_collection("Users")


#add a route to create a new user record in the database
@router.post(
    "/register/",
    response_description="Add new user",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=False,
)

#Changed from UserModel to UserCreate because model uses hashed/encryption may exceed character limit
async def create_user(user: UserCreate = Body(...)):
    """
    Insert a new user record.

    A unique `id` will be created and provided in the response.
    new_user = user.model_dump(by_alias=True, exclude=["id"])
    result = await user_collection.insert_one(new_user)
    new_user["_id"] = result.inserted_id
    """
    existing_user = await user_collection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = hash_password(user.password)
    result = await user_collection.insert_one(
        {
            "user_name": user.user_name,
            "email": user.email,
            "password": hashed_password,
        }
    )
    return UserOut(id=str(result.inserted_id), user_name=user.user_name, email=user.email)
#LOGIN
@router.post(
    "/login/",
    response_description="Login user",
)
async def login(user: UserLogin):
    db_user = await user_collection.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": db_user["email"], "id": str(db_user["_id"])})
    return {"access_token": token, "token_type": "bearer"}

#LIST ALL USERS
@router.get(
    "/Users/",
    response_description="List all users",
    response_model=UserCollection,
    response_model_by_alias=False,
)
async def list_users():
    """
    List all of the user data in the database.

    The response is unpaginated and limited to 1000 results.
    """
    return UserCollection(users=await user_collection.find().to_list(1000))

#FIND A USER BY ID

@router.get(
    "/Users/{id}",
    response_description="Get a single user by id",
    response_model=UserModel,
    response_model_by_alias=False,
)
async def show_user(id: str):
    """
    Get the record for a specific user, looked up by `id`.
    """
    if (
        user := await user_collection.find_one({"_id": ObjectId(id)})
    ) is not None:
        return user

    raise HTTPException(status_code=404, detail=f"User {id} not found")

@router.put(
    "/Users/{id}",
    response_description="Update a user record",
    response_model=UserModel,
    response_model_by_alias=False,
)
async def update_user(id: str, user: UpdateUserModel = Body(...)):
    """
    Update individual fields of an existing user record.

    Only the provided fields will be updated.
    Any missing or `null` fields will be ignored.
    """
    user = {
        k: v for k, v in user.model_dump(by_alias=True).items() if v is not None
    }

    if "password" in user:
        user["password"] = hash_password(user["password"])

    if len(user) >= 1:
        update_result = await user_collection.find_one_and_update(
            {"_id": ObjectId(id)},
            {"$set": user},
            return_document=ReturnDocument.AFTER,
        )
        if update_result is not None:
            return update_result
        else:
            raise HTTPException(status_code=404, detail=f"User {id} not found")

    # The update is empty, but we should still return the matching document:
    if (existing_user := await user_collection.find_one({"_id": ObjectId(id)})) is not None:
        return existing_user

    raise HTTPException(status_code=404, detail=f"User {id} not found")

@router.post(
    "/login/",
    response_description="Login user",
)
async def login(user: UserLogin):
    db_user = await user_collection.find_one({"email": user.email})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token({"sub": db_user["email"], "id": str(db_user["_id"])})
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me")
async def read_users_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        email: str = payload.get("sub")
        user_id = payload.get("id")
        if email is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"id": user_id, "email": email}
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


@router.delete("/users/{id}", response_description="Delete a user")
async def delete_user(id: str, user: UserLogin, auth = Depends(read_users_me)):
    """
    Remove a single user record from the database.
    """
    db_user = await user_collection.find_one({"_id": ObjectId(auth["id"])})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    delete_result = await user_collection.delete_one({"_id": db_user["_id"]})

    if delete_result.deleted_count == 1:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    raise HTTPException(status_code=404, detail=f"User {id} not found")