# AcneDetectionBackendREST

Backend REST API for acne assessment and AI-guided treatment planning.

## Current Auth Flow (No OTP)

This project now uses a simple authentication flow:
- Register with `username`, `email`, `password`
- Login with `email`, `password`
- Use JWT token in `Authorization: Bearer <token>` for protected routes

Removed from codebase:
- OTP verification
- Resend OTP
- Forgot password / reset password OTP flow

## Base URL

- Local: `http://localhost:5000`
- All API routes are prefixed with: `/api`

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- Multer (memory uploads)
- External ML API for acne classification
- Groq API for treatment plan generation

## Environment Variables

Create a `.env` file with:

```env
PORT=5000
NODE_ENV=development

JWT_SECRET=your_jwt_secret
MONGO_URI=mongodb://localhost:27017/acne_db
ML_API_URL=https://your-ml-api/predict
GROQ_API_KEY=your_groq_api_key

# Comma-separated allowed origins
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Optional
TRUST_PROXY=1
ALLOW_ALL_ORIGINS=false
AUTH_RATE_LIMIT_MAX=200
GENERAL_RATE_LIMIT_MAX=2000
```

## Setup

```bash
npm install
npm run dev
```

Health check:

```bash
curl http://localhost:5000/health
```

## Authentication

### Register
`POST /api/auth/register`

Request body:

```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "StrongPass123"
}
```

Success (`201`):

```json
{
  "message": "Registration successful",
  "token": "<jwt>",
  "user": {
    "userId": "USR-...",
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

Errors:
- `400` missing required fields or short password
- `409` email/username already registered

### Login
`POST /api/auth/login`

Request body:

```json
{
  "email": "john@example.com",
  "password": "StrongPass123"
}
```

Success (`200`):

```json
{
  "token": "<jwt>"
}
```

Errors:
- `400` invalid credentials or missing fields

### User Count
`GET /api/auth/users/count`

Success (`200`):

```json
{
  "totalUsers": 42
}
```

## Protected Endpoints

Pass token:

```http
Authorization: Bearer <jwt>
```

### Save Questionnaire
`POST /api/auth/userinfo`

Notes:
- Saves questionnaire once per user
- Returns `409` if already submitted

Success (`201`):

```json
{
  "message": "Questionnaire saved successfully",
  "questionnaire_id": "..."
}
```

### Get My User Info
`GET /api/auth/userinfo`

Success (`200`): returns user account, questionnaire (or `null`), acne analysis (or `null`).

### Get User Status
`GET /api/auth/user-status`

Success (`200`):

```json
{
  "questionnaire_completed": true,
  "acne_analysis_completed": false,
  "both_completed": false,
  "next_step": "Upload acne images for analysis"
}
```

### Upload Acne Images
`POST /api/auth/upload-acne`

- Content type: `multipart/form-data`
- Allowed image type: JPG/JPEG only
- Max file size: 10MB each
- Requires questionnaire completion first
- One image per body-area field

Supported form fields:
- `forehead`
- `leftCheek`
- `rightCheek`
- `chin`
- `neck`
- `back`
- `fullFace`

Success (`201`):

```json
{
  "message": "Acne analysis completed",
  "areas": [
    {
      "area": "fullFace",
      "prediction": "mild",
      "confidence": 87.5
    }
  ]
}
```

Common errors:
- `400` no image / invalid flow (questionnaire missing)
- `409` acne analysis already completed
- `502` ML API failed or invalid ML response

## Treatment Endpoints

All require JWT.

### Start Day 1 Plan
`POST /api/treatment/start`

Requirements:
- Questionnaire completed
- Acne analysis completed
- No existing treatment plan

Success (`200`): returns Day 1 plan.

### Submit Day Review
`POST /api/treatment/review`

Request body:

```json
{
  "day": 1,
  "feedback": "positive",
  "notes": "Skin felt less irritated today"
}
```

Rules:
- `feedback` must be `positive` or `negative`
- Cannot skip days
- Cannot review same day twice

Success (`200`): returns generated next-day plan.

### Get Treatment Status
`GET /api/treatment/status`

Success (`200`): returns current day, severity, progress counts, and `days` history.

## Global Routes

- `GET /` root metadata
- `GET /health` server + DB health

## Rate Limiting

- Auth limiter applied to:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
- General limiter applied to `/api/*` (with exemptions for selected GET routes and OPTIONS)

## Error Format

Typical error response:

```json
{
  "message": "Human-readable error message"
}
```

## Quick cURL Flow

### 1) Register

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "StrongPass123"
  }'
```

### 2) Login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "StrongPass123"
  }'
```

### 3) Save Questionnaire (replace `<TOKEN>`)

```bash
curl -X POST http://localhost:5000/api/auth/userinfo \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "ageGroup": "18-25",
    "sex": "Male",
    "skinType": "Oily"
  }'
```

### 4) Upload Acne Image Example

```bash
curl -X POST http://localhost:5000/api/auth/upload-acne \
  -H "Authorization: Bearer <TOKEN>" \
  -F "fullFace=@/path/to/image.jpg"
```

### 5) Start Treatment

```bash
curl -X POST http://localhost:5000/api/treatment/start \
  -H "Authorization: Bearer <TOKEN>"
```
