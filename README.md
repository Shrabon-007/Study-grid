# Study Grid

Study Grid is a full-stack academic management platform for students, teachers, advisors, and administrators. It provides course management, attendance, CT marks, semester CGPA tracking, advisor reports, notices, messaging, and a grounded academic assistant.

## Features

### Students

- Register and manage courses
- View published attendance and CT marks
- Calculate semester and cumulative CGPA
- View academic ranking and short-course/backlog indicators
- Read notices and message advisors
- Use the academic AI assistant

### Teachers

- Create and manage course offerings
- Take and publish attendance
- Enter and publish CT marks
- View student result sheets
- Publish course notices

### Advisors

- View assigned students and class ranking
- Open individual academic reports
- Review attendance, CT performance, semester history, and CGPA
- Access at-risk student watchlists
- Send advisor messages

### Administrators

- Manage accounts
- Assign advisors to student ranges
- Publish campus notices
- Use the administrator AI assistant

## Technology Stack

### Frontend

- React 19
- React Router
- Vite
- SheetJS (`xlsx`)
- Responsive shared CSS

### Backend

- Node.js
- Express
- MongoDB
- Mongoose
- JWT authentication
- bcrypt password hashing

### Deployment

- Ubuntu VPS
- Nginx
- systemd
- MongoDB Atlas
- Optional HTTPS through Certbot

## Project Structure

```text
Study-grid/
├── backend/
│   ├── scripts/
│   └── src/
│       ├── config/
│       ├── controllers/
│       ├── middleware/
│       ├── models/
│       ├── routes/
│       └── services/
├── frontend/
│   └── src/
│       ├── components/
│       ├── context/
│       ├── lib/
│       └── pages/
├── deployment/
├── DEPLOYMENT.md
└── README.md
```

## Prerequisites

- Node.js 20 or later
- npm
- MongoDB, or a MongoDB Atlas connection
- Git

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/Shrabon-007/Study-grid.git
cd Study-grid
```

### 2. Configure the backend

Copy the example environment file:

```bash
cp backend/.env.example backend/.env
```

On Windows PowerShell:

```powershell
Copy-Item backend/.env.example backend/.env
```

Set the values in `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/academicradar
JWT_SECRET=replace_with_a_secure_random_secret
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
GEMINI_API_KEY=
HF_API_TOKEN=
HF_MODEL=Qwen/Qwen2.5-72B-Instruct
HF_FALLBACK_MODEL=meta-llama/Llama-3.1-8B-Instruct
```

`backend/.env` is ignored by Git and must not be committed.

Generate a JWT secret:

```bash
openssl rand -base64 48
```

### 3. Install dependencies

```bash
cd backend
npm install
cd ../frontend
npm install
cd ..
```

### 4. Start the backend

Open one terminal:

```bash
cd backend
npm run dev
```

The backend normally runs at `http://localhost:5000`.

Health check:

```text
http://localhost:5000/api/health
```

### 5. Start the frontend

Open another terminal:

```bash
cd frontend
npm run dev
```

Open the Vite URL shown in the terminal, normally:

```text
http://localhost:5173
```

The Vite development server forwards `/api` requests to the backend.

## API Configuration

The frontend uses `VITE_API_BASE_URL` when it is set. Otherwise, it uses `/api` and the Vite proxy.

For a separate production API host, create `frontend/.env`:

```env
VITE_API_BASE_URL=https://your-domain.com/api
```

Do not add secrets to the frontend environment file.

## Available Commands

### Backend

```bash
cd backend
npm run dev
npm start
npm run db:refine
npm run verify:course-enrollment
npm test
```

### Frontend

```bash
cd frontend
npm run dev
npm run build
npm run preview
```

## Verification

Before committing:

```bash
git diff --check
node --check backend/src/controllers/portal.controller.js
cd frontend
npm run build
```

Backend verification scripts can be run from the `backend` directory:

```bash
npm run verify:course-enrollment
node scripts/verify-auth.js
node scripts/verify-portal.js
```

## Deployment

Production deployment instructions are in [DEPLOYMENT.md](./DEPLOYMENT.md).

The production layout uses:

- Express API on port `5000`
- Nginx serving the built frontend
- Nginx proxying `/api` to the local backend
- MongoDB Atlas or a separately configured MongoDB instance

Do not expose port `5000` publicly.

## Security

- Never commit `backend/.env`
- Never commit API keys, database passwords, JWT secrets, or tokens
- Rotate credentials immediately if they are exposed
- Use HTTPS for production
- Restrict MongoDB Atlas network access
- Keep production secrets on the VPS only
- Use least-privilege database accounts

## Contributing

1. Create a new working branch.
2. Make and test the required changes.
3. Verify the frontend build and relevant backend scripts.
4. Commit with a descriptive message.
5. Open a pull request for review.
