
from typing import Optional, List

from pydantic import ConfigDict, BaseModel, Field, EmailStr
from pydantic.functional_validators import BeforeValidator

from typing_extensions import Annotated

from bson import ObjectId

# Represents an ObjectId field in the database.
# It will be represented as a `str` on the model so that it can be serialized to JSON.
PyObjectId = Annotated[str, BeforeValidator(str)]


class UserModel(BaseModel):
    """
    Container for a single user record.
    """
    # The primary key for the UserModel, stored as a `str` on the instance.
    # This will be aliased to ``_id`` when sent to MongoDB,
    # but provided as ``id`` in the API requests and responses.
    user_name: str = Field(...)
    email: EmailStr = Field(...)
    password: str = Field(...)
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_schema_extra={
            "example": {
                "user_name": "Jane Doe",
                "email": "jdoe@example.com",
                "password": "secret",
            }
        },
    )
class UserCreate(BaseModel):
     user_name: str = Field(..., min_length=3, max_length=30)
     email: EmailStr
     password: str = Field(..., min_length=8, max_length=72)
#This creates character limits to username and passwords


class UserLogin(BaseModel):
    """
    Container for a single user record.
    """
    # The primary key for the UserModel, stored as a `str` on the instance.
    # This will be aliased to ``_id`` when sent to MongoDB,
    # but provided as ``id`` in the API requests and responses.

    email: EmailStr = Field(...)
    password: str = Field(...)
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_schema_extra={
            "example": {
                "user_name": "Jane Doe",
                "email": "jdoe@example.com",
                "password": "secret",
            }
        },
    )

class UserOut(BaseModel):
    """
    Container for a user record to be returned in an API response.
    """
    # The primary key for the UserModel, stored as a `str` on the instance.
    # This will be aliased to ``_id`` when sent to MongoDB,
    # but provided as ``id`` in the API requests and responses.
    id: Optional[PyObjectId] = Field(alias="_id", default=None)
    user_name: str = Field(...)
    email: EmailStr = Field(...)


#create a model for updating a user record

class UpdateUserModel(BaseModel):
    """
    A set of optional updates to be made to a document in the database.
    """

    user_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(None, min_length=8, max_length=72)
    model_config = ConfigDict(
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str},
        json_schema_extra={
            "example": {
                "user_name": "Jane Doe",
                "email": "jdoe@example.com",
                "password": "secret",
            }
        },
    )


class UserCollection(BaseModel):
    """
    A container holding a list of `User Model` instances.

    This exists because providing a top-level array in a JSON response can be a [vulnerability](https://haacked.com/archive/2009/06/25/json-hijacking.aspx/)
    """

    users: List[UserModel]



