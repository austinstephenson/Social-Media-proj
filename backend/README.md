
# Backend

## To run:
- Ensure you have a .env (/Backend/.env) that contains the following information:
    * MONGODB_URL: Should be in the following format: "mongodb+srv://<username>:<password>@cluster.example.mongodb.net/?retryWrites=true&w=majority" 
    
        Obtain this by navigating to your mongoDB clusters, clicking "Connect" on the desired cluster, and then choosing "MongoDB for VSCode" 

    * JWT_SECRET: This can be any string of your choosing

- run with the command: uvicorn: app:app --reload
    * after server startup, go to http://127.0.0.1:8000/docs

The backend contains the following files:


__app.py__ - Starts the app and mounts the router 

__Enpoints/routes_auth.py__ - Holds all endpoints and database calls

__AppSettings/schemas.py__ - Defines the user data models

__AppSettings/config.py__ - loads settings from the .env file

__Security/validate_password.py__ - Hashes and checks passwords

__Security/jwt.py__ - Creates and decodes tokens


__requirements.txt__ - Includes all libraries used and their model number


# API Routes:
routes_auth.py contains the implementations of following endpoints:

__POST /register/__ - Creates an account

__POST /login/__ - Checks the email and password and returns a JWT

__GET /me__ - Returns the logged in users id and email if their access token from login is valid

__GET /Users/__ - Lists users up to 1000

__GET /Users/{id}__ - Returns 1 user if they exist

__PUT /users/{id}__ - Updates changed fields

__DELETE /users/{id}__ - Deletes an account of a logged in user


