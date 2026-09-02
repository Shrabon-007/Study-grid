# Academic Radar React frontend

The static HTML frontend has been replaced by a React single-page application.

## Run locally

1. Start the backend in a separate terminal:

   ```powershell
   cd backend
   npm run dev
   ```

2. Start the React frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The Vite proxy forwards `/api` requests to the untouched Express backend at port `5000`.

For a separate production API host, copy `.env.example` to `.env` and set `VITE_API_BASE_URL`.
