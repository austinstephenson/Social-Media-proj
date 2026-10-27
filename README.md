# Social-Media-proj
^^^
## Will's guide on how to run the connected front/back environment

## Backend setup
```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1  # Windows PowerShell
pip install -r requirements.txt
```
Create `backend/.env` (copy `.env.example`) and fill in:

MONGODB_URL=<your connection string>
JWT_SECRET=<Your generated secret>
```
Generate a secret with:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```
**Never commit `.env`.** Share credentials privately, not through GitHub.

Your public (NETWORK) IP address must be added to Atlas under **Network Access**, or the
backend can't connect to the database.

Run the backend:
```bash
uvicorn app:app --reload --port 8000
```
API docs are at http://localhost:8000/docs

## Frontend setup
```bash
cd frontend
npm install
npm run dev
```

The app runs at http://localhost:5173. The backend only allows requests
from this address EXCLUSIVELY, so make sure nothing else is using port 5173.

## Testing
1. Start both servers (backend and frontend, in separate terminals).
2. press f12, go to console and run 
```fetch("http://localhost:8000/docs").then(r => console.log("Connected! Status:", r.status)).catch(e => console.log("Not connected:", e)).```
3. Console will demonstrate front and backend connection

## Troubleshooting
- **PowerShell blocks npm or venv activation:** run
  using cmd prompt
- **CORS error in the browser console:** the frontend isn't on port 5173,
  or the backend isn't running.
- **Backend crashes with "Field required":** `backend/.env` is missing or
  incomplete.
- **Requests hang:** your IP isn't allowed in Atlas Network Access.