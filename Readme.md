# AcneDetectionBackendREST

Backend REST API for acne assessment and AI-guided treatment planning.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Setup & Running](#setup--running)
- [Authentication Flow](#authentication-flow)
- [Rate Limiting](#rate-limiting)
- [CORS Configuration](#cors-configuration)
- [API Reference](#api-reference)
  - [Global Routes](#global-routes)
  - [Auth Routes](#auth-routes)
  - [Treatment Routes](#treatment-routes)
- [Data Models](#data-models)
- [Error Format](#error-format)
- [Quick cURL Flow](#quick-curl-flow)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js + Express 5 |
| Database | MongoDB + Mongoose |
| Auth | JWT (jsonwebtoken) |
| File Uploads | Multer (memory storage) |
| ML Classification | External ML REST API |
| AI Treatment Plans | Groq API (LLaMA 3.1) |
| Password Hashing | bcrypt |
| Rate Limiting | express-rate-limit |

---

## Project Structure

```
AcneDetectionBackendREST/
├── server.js                        # Entry point, middleware, rate limiting, CORS
├── src/
│   ├── db/
│   │   └── connection.js            # MongoDB connection with pool config
│   ├── models/
│   │   ├── user.model.js            # User account schema
│   │   ├── userinfo.model.js        # Questionnaire / health info schema
│   │   ├── useracnelevel.model.js   # Per-area acne analysis results schema
│   │   └── treatmentplan.model.js   # Daily AI-generated treatment plan schema
│   ├── controllers/
│   │   ├── auth.controller.js       # Register, Login, User count
│   │   ├── userinfo.controller.js   # Save/get questionnaire, user status
│   │   ├── acne.controller.js       # Acne image upload + ML API integration
│   │   └── treatment.controller.js  # Generate Day 1 plan, submit reviews, status
│   ├── middleware/
│   │   ├── auth.middleware.js       # JWT Bearer token validation
│   │   └── upload.middleware.js     # Multer config (JPG only, 10MB, memory)
│   ├── routes/
│   │   ├── auth.routes.js           # /api/auth/* routes
│   │   └── treatment.routes.js      # /api/treatment/* routes
│   └── utils/
│       ├── groq.utils.js            # Groq API call + JSON parsing + validation
│       └── severity.util.js         # Derives overall severity from area predictions
```

---

## Environment Variables

Create a `.env` file in the project root:

```env
# Server
PORT=5000
NODE_ENV=development          # or production

# Security
JWT_SECRET=your_random_32_plus_char_secret
TRUST_PROXY=1                 # Set to 1 for Render/NGINX reverse proxy

# Database
MONGO_URI=mongodb://localhost:27017/acne_db

# External Services
ML_API_URL=https://your-ml-service.example.com/predict
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.1-8b-instant     # Optional, defaults to llama-3.1-8b-instant

# CORS — comma-separated origins, wildcards supported (e.g. https://*.onrender.com)
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
ALLOW_ALL_ORIGINS=false             # Set true only in development to bypass CORS

# Rate Limiting (defaults shown; production defaults are stricter)
AUTH_RATE_LIMIT_MAX=200             # Default dev: 200 | prod: 50  (per 15 min)
GENERAL_RATE_LIMIT_MAX=2000         # Default dev: 2000 | prod: 100 (per 15 min)

# SMTP (currently installed but not used in active routes)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_app_password
SMTP_SECURE=false
SMTP_FROM=AcneAI <no-reply@example.com>
SMTP_DOMAIN=gmail.com
```

**Required at startup** — server exits if any of these are missing:
`JWT_SECRET`, `MONGO_URI`, `ML_API_URL`, `GROQ_API_KEY`, `ALLOWED_ORIGINS`

---

## Setup & Running

```bash
# Install dependencies
npm install

# Development (with nodemon auto-restart)
npm run dev

# Production
npm start
```

**Health check:**
```bash
curl http://localhost:5000/health
```

---

## Authentication Flow

1. **Register** → receive JWT token immediately (no OTP required)
2. **Login** → receive JWT token
3. Include token in all protected requests:

```http
Authorization: Bearer <jwt_token>
```

JWT tokens expire after **1 day**.

> **Removed from codebase:** OTP verification, resend OTP, forgot/reset password OTP flow

---

## Rate Limiting

All limits apply per IP address over a **15-minute window**.

| Limiter | Applied To | Dev Default | Prod Default |
|---|---|---|---|
| Auth Limiter | `POST /api/auth/login`, `POST /api/auth/register` | 200 req | 50 req |
| General Limiter | All `/api/*` routes | 2000 req | 100 req |

**Exempt from General Limiter:**
- `OPTIONS` (preflight)
- `GET /api/auth/userinfo`
- `GET /api/auth/user-status`
- `GET /api/auth/users/count`

**Auth Limiter skips:** All `GET` requests

---

## CORS Configuration

Origins are whitelisted via `ALLOWED_ORIGINS`. Features:
- Exact match
- `localhost` ↔ `127.0.0.1` ↔ `[::1]` auto-equivalence
- Wildcard support: `https://*.onrender.com`
- Requests with no `Origin` header are allowed (CLI tools, mobile apps)

Set `ALLOW_ALL_ORIGINS=true` to bypass all CORS checks (development only).

---

## API Reference

### Base URL

```
Local:      http://localhost:5000
API prefix: /api
```

---

### Global Routes

#### `GET /`
Root metadata.

**Response `200`:**
```json
{
  "message": "AcneAI Backend API",
  "version": "1.0.0",
  "documentation": "/api/docs",
  "status": "running"
}
```

---

#### `GET /health`
Server and database health check.

**Response `200`:**
```json
{
  "status": "OK",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "database": "connected",
  "environment": "development"
}
```

`database` will be `"disconnected"` if MongoDB is unreachable.

---

### Auth Routes

All auth routes are prefixed with `/api/auth`.

---

#### `POST /api/auth/register`
Register a new user account. Returns a JWT token on success.

**Request Body:**
```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "StrongPass123"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | ✅ | Trimmed, must be unique |
| `email` | string | ✅ | Lowercased, must be unique |
| `password` | string | ✅ | Minimum 8 characters |

**Response `201` — Success:**
```json
{
  "message": "Registration successful",
  "token": "<jwt>",
  "user": {
    "userId": "USR-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "username": "john_doe",
    "email": "john@example.com"
  }
}
```

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `400` | `"Username, email and password are required"` | Missing any field |
| `400` | `"Password too short"` | Password < 8 characters |
| `409` | `"Email or username already registered"` | Duplicate email or username |
| `500` | `"Registration failed"` | Unexpected server error |

---

#### `POST /api/auth/login`
Authenticate and receive a JWT token.

**Request Body:**
```json
{
  "email": "john@example.com",
  "password": "StrongPass123"
}
```

**Response `200` — Success:**
```json
{
  "token": "<jwt>"
}
```

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `400` | `"Email and password required"` | Missing field |
| `400` | `"Invalid credentials"` | Wrong email or password |
| `500` | `"Login failed"` | Unexpected server error |

---

#### `GET /api/auth/users/count`
Returns the total number of registered users. Public endpoint, no auth required.

**Response `200`:**
```json
{
  "totalUsers": 42
}
```

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `500` | `"Failed to fetch user count"` | DB error |

---

#### `POST /api/auth/userinfo` 🔒
Save the user's health questionnaire. Each user may submit **only once**.

**Headers:** `Authorization: Bearer <token>`

**Request Body** (all fields optional except enforced by questionnaire logic):
```json
{
  "ageGroup": "18-25",
  "sex": "Male",
  "skinType": "Oily",
  "acneDuration": "6 months",
  "acneLocation": ["forehead", "chin"],
  "acneDescription": "Small whiteheads and blackheads",
  "medicationAllergy": "No",
  "allergyReactionTypes": [],
  "acneMedicationReaction": [],
  "sensitiveSkin": "Yes",
  "foodAllergy": "No",
  "allergyFoods": [],
  "foodTriggersAcne": "Yes",
  "usingAcneProducts": "Yes",
  "currentProducts": ["Salicylic acid wash"],
  "stoppedDueToSideEffects": "No",
  "dairyConsumption": "Moderate",
  "stressLevel": "High",
  "sleepHours": "6-7",
  "additionalFeelings": "Feeling self-conscious"
}
```

**Response `201` — Success:**
```json
{
  "message": "Questionnaire saved successfully",
  "questionnaire_id": "<mongodb_object_id>"
}
```

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `401` | `"Authorization token required"` | Missing/invalid token |
| `401` | `"Unauthorized: Invalid user context"` | Token has no userId |
| `409` | `"Questionnaire already submitted"` | Already submitted once |
| `500` | `"Failed to save questionnaire"` | DB error |

---

#### `GET /api/auth/userinfo` 🔒
Retrieve the authenticated user's full profile: account info, questionnaire, and acne analysis.

**Headers:** `Authorization: Bearer <token>`

**Response `200` — Success:**
```json
{
  "message": "User info fetched successfully",
  "user": {
    "userId": "USR-...",
    "username": "john_doe",
    "email": "john@example.com",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "questionnaire": { ...questionnaire fields... },
  "acne_analysis": { ...acne areas results... }
}
```

`questionnaire` and `acne_analysis` are `null` if not yet completed.

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `401` | `"Authorization token required"` | Missing/invalid token |
| `404` | `"User not found"` | userId in token doesn't match any user |
| `500` | `"Failed to fetch user info"` | DB error |

---

#### `GET /api/auth/user-status` 🔒
Check which onboarding steps the user has completed.

**Headers:** `Authorization: Bearer <token>`

**Response `200`:**
```json
{
  "questionnaire_completed": true,
  "acne_analysis_completed": false,
  "both_completed": false,
  "next_step": "Upload acne images for analysis"
}
```

| `next_step` value | Condition |
|---|---|
| `"Complete the health questionnaire"` | Questionnaire not done |
| `"Upload acne images for analysis"` | Questionnaire done, acne analysis not done |
| `"All steps completed - proceed to dashboard"` | Both done |

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `401` | `"Authorization token required"` | Missing/invalid token |
| `500` | `"Failed to fetch user status"` | DB error |

---

#### `POST /api/auth/upload-acne` 🔒
Upload acne images for ML-based classification. Images are streamed directly to the ML API (stored in memory, not disk).

**Headers:** `Authorization: Bearer <token>`  
**Content-Type:** `multipart/form-data`

**Constraints:**
- File format: **JPG/JPEG only**
- Max file size: **10MB per file**
- Max total files: **10**
- **One image per body-area field**
- Questionnaire must be completed first
- Can only be submitted once per user

**Supported Form Fields:**

| Field | Body Area |
|---|---|
| `forehead` | Forehead |
| `leftCheek` | Left cheek |
| `rightCheek` | Right cheek |
| `chin` | Chin |
| `neck` | Neck |
| `back` | Back |
| `fullFace` | Full face (max 1) |

**Response `201` — Success:**
```json
{
  "message": "Acne analysis completed",
  "areas": [
    {
      "area": "fullFace",
      "imageName": "face.jpg",
      "imageUrl": "https://...",
      "prediction": "mild",
      "confidence": 87.5,
      "probabilities": {
        "cleanskin": 5.2,
        "mild": 87.5,
        "moderate": 6.1,
        "severe": 0.9,
        "unknown": 0.3
      },
      "predictionId": 1
    }
  ]
}
```

**Prediction values:** `cleanskin` | `mild` | `moderate` | `severe` | `unknown`

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `400` | `"Complete questionnaire before uploading acne images"` | No questionnaire found |
| `400` | `"At least one image required"` | No files in request |
| `400` | `"Only one image allowed for <fieldname>"` | Multiple files for same area |
| `401` | `"Authorization token required"` | Missing/invalid token |
| `409` | `"Acne analysis already completed for this user"` | Already submitted (inc. race condition) |
| `500` | `"Server configuration error"` | `ML_API_URL` not configured |
| `502` | `"ML API failed for area: <fieldname>"` | ML API request failed/timeout |
| `502` | `"Invalid ML response for area: <fieldname>"` | Missing required fields in ML response |
| `502` | `"Invalid prediction value for area: <fieldname>..."` | Unknown prediction label |
| `502` | `"Invalid probabilities structure for area: <fieldname>"` | NaN or missing probability keys |
| `502` | `"Invalid probabilities for area: <fieldname> (sum must be 100...)"` | Probabilities don't sum to ~100 |
| `502` | `"Invalid confidence value for area: <fieldname>"` | Confidence outside 0–100 range |
| `500` | `"Failed to process acne images"` | Unexpected server error |

---

### Treatment Routes

All treatment routes are prefixed with `/api/treatment` and require authentication.

---

#### `POST /api/treatment/start` 🔒
Generate the Day 1 AI treatment plan. Requires both questionnaire and acne analysis to be completed. Can only be called once per user.

**Headers:** `Authorization: Bearer <token>`

**Prerequisites:**
- ✅ Questionnaire submitted
- ✅ Acne analysis completed
- ❌ No existing treatment plan

**Response `200` — Success:**
```json
{
  "message": "Day 1 treatment generated",
  "day": 1,
  "overallSeverity": "mild",
  "plan": {
    "morning": "Gentle face wash with salicylic acid 1%...",
    "afternoon": "Use blotting papers if oily...",
    "evening": "Apply adapalene 0.1% on alternate nights...",
    "motivation": "Starting your journey to clearer skin!"
  }
}
```

**Overall Severity Derivation Logic** (from `severity.util.js`):

| Condition | Derived Severity |
|---|---|
| Any area is `severe` | `severe` |
| More than half of areas are `moderate` | `moderate-severe` |
| At least one area is `moderate` | `moderate` |
| At least one area is `mild` | `mild` |
| All areas `cleanskin` or `unknown` | `cleanskin` |

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `400` | `"Complete questionnaire first"` | No questionnaire found |
| `400` | `"Complete acne analysis first"` | No acne analysis found |
| `401` | `"Unauthorized"` | Missing/invalid token |
| `409` | `"Treatment plan already started"` + `currentDay` | Plan exists (inc. race condition) |
| `502` | `"AI service unavailable. Try again."` | Groq API call failed |
| `500` | `"Failed to generate treatment plan"` | Unexpected server error |

---

#### `POST /api/treatment/review` 🔒
Submit feedback for the current day and receive the next day's AI-generated plan.

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "day": 1,
  "feedback": "positive",
  "notes": "Skin felt less irritated today"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `day` | number | ✅ | Must be a positive integer matching `currentDay` |
| `feedback` | string | ✅ | Must be `"positive"` or `"negative"` |
| `notes` | string | ❌ | Optional user notes |

**Rules:**
- Cannot skip days — `day` must equal `currentDay`
- Cannot review the same day twice
- Maximum plan length: 365 days

**Response `200` — Success:**
```json
{
  "message": "Day 1 reviewed. Day 2 plan generated.",
  "day": 2,
  "plan": {
    "morning": "Continue with salicylic acid wash...",
    "afternoon": "Stay hydrated, avoid sun exposure...",
    "evening": "Apply adapalene 0.1% tonight...",
    "motivation": "Great progress! Keep going!",
    "adjustment_reason": "Positive feedback — continuing similar plan with progression."
  }
}
```

**How `feedback` affects the next plan (from `treatment.controller.js`):**

| Feedback | AI Instruction |
|---|---|
| `"positive"` | Continue similar plan with minor progression; increase motivation |
| `"negative"` | Reduce product concentration ~25%, use gentler alternatives, explain the change |

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `400` | `"day and feedback are required"` | Missing fields |
| `400` | `"day must be a valid positive integer"` | Non-integer or negative day |
| `400` | `"feedback must be 'positive' or 'negative'"` | Invalid feedback value |
| `400` | `"Cannot review Day X. Current day is Y."` | Day mismatch (skipping) |
| `400` | `"Day X plan not found"` | Day data missing in plan |
| `400` | `"Treatment plan duration has reached 365 days maximum"` | Exceeded max days |
| `401` | `"Unauthorized"` | Missing/invalid token |
| `404` | `"No treatment plan found. Generate Day 1 first."` | No plan exists |
| `409` | `"Day X already reviewed"` | Already reviewed this day |
| `409` | `"Day already reviewed or plan modified. Refresh and try again."` | Race condition on update |
| `502` | `"AI service unavailable. Try again."` | Groq API call failed |
| `500` | `"Failed to submit review"` | Unexpected server error |

---

#### `GET /api/treatment/status` 🔒
Get the full treatment plan status, history, and current day.

**Headers:** `Authorization: Bearer <token>`

**Response `200`:**
```json
{
  "userId": "USR-...",
  "overallSeverity": "mild",
  "currentDay": 3,
  "questionnaire_completed": true,
  "acne_analysis_completed": true,
  "totalDaysCompleted": 2,
  "days": [
    {
      "day": 1,
      "morning": { "treatment": "...", "completed": true },
      "afternoon": { "treatment": "...", "completed": true },
      "evening": { "treatment": "...", "completed": true },
      "motivation": "...",
      "adjustment_reason": "Initial plan based on assessment",
      "feedback": "positive",
      "notes": "Felt better",
      "review": "Day 1 feedback: positive. Notes: Felt better"
    },
    {
      "day": 2,
      "morning": { "treatment": "...", "completed": true },
      "afternoon": { "treatment": "...", "completed": true },
      "evening": { "treatment": "...", "completed": true },
      "motivation": "...",
      "adjustment_reason": "...",
      "feedback": "negative",
      "notes": "Slight dryness",
      "review": "Day 2 feedback: negative. Notes: Slight dryness"
    },
    {
      "day": 3,
      "morning": { "treatment": "...", "completed": false },
      "afternoon": { "treatment": "...", "completed": false },
      "evening": { "treatment": "...", "completed": false },
      "motivation": "...",
      "adjustment_reason": "...",
      "feedback": null,
      "notes": "",
      "review": ""
    }
  ]
}
```

**Error Responses:**

| Status | Message | Cause |
|---|---|---|
| `401` | `"Unauthorized"` | Missing/invalid token |
| `404` | `"No treatment plan found"` | No plan exists for user |
| `500` | `"Failed to fetch treatment status"` | Unexpected server error |

---

## Data Models

### User (`user.model.js`)

| Field | Type | Notes |
|---|---|---|
| `userId` | String | `USR-<uuid>`, unique, immutable, indexed |
| `username` | String | Unique, trimmed, indexed |
| `email` | String | Unique, lowercase, trimmed, indexed |
| `password` | String | bcrypt-hashed, excluded from default queries |
| `createdAt` | Date | Auto-managed |
| `updatedAt` | Date | Auto-managed |

---

### UserInfo / Questionnaire (`userinfo.model.js`)

| Field | Type | Notes |
|---|---|---|
| `userId` | String | Unique, indexed |
| `ageGroup` | String | e.g. `"18-25"` |
| `sex` | String | e.g. `"Male"`, `"Female"` |
| `skinType` | String | e.g. `"Oily"`, `"Dry"`, `"Combination"` |
| `acneDuration` | String | |
| `acneLocation` | [String] | e.g. `["forehead", "chin"]` |
| `acneDescription` | String | |
| `medicationAllergy` | String | `"Yes"` / `"No"` |
| `allergyReactionTypes` | [String] | |
| `acneMedicationReaction` | [String] | |
| `sensitiveSkin` | String | `"Yes"` / `"No"` |
| `foodAllergy` | String | `"Yes"` / `"No"` |
| `allergyFoods` | [String] | |
| `foodTriggersAcne` | String | `"Yes"` / `"No"` |
| `usingAcneProducts` | String | `"Yes"` / `"No"` |
| `currentProducts` | [String] | |
| `stoppedDueToSideEffects` | String | `"Yes"` / `"No"` |
| `dairyConsumption` | String | |
| `stressLevel` | String | |
| `sleepHours` | String | |
| `additionalFeelings` | String | |

---

### UserAcneLevel (`useracnelevel.model.js`)

| Field | Type | Enum / Notes |
|---|---|---|
| `userId` | String | Unique, indexed |
| `areas` | Array | Per-area results |
| `areas[].area` | String | `forehead`, `leftCheek`, `rightCheek`, `chin`, `neck`, `back`, `fullFace` |
| `areas[].imageName` | String | Original filename |
| `areas[].imageUrl` | String | URL returned by ML API |
| `areas[].prediction` | String | `cleanskin`, `mild`, `moderate`, `severe`, `unknown` |
| `areas[].confidence` | Number | 0–100 |
| `areas[].probabilities` | Object | `{ cleanskin, mild, moderate, severe, unknown }` each 0–100, summing to ~100 |
| `areas[].predictionId` | Number | Numeric label from ML API |

---

### TreatmentPlan (`treatmentplan.model.js`)

| Field | Type | Notes |
|---|---|---|
| `userId` | String | Unique, indexed |
| `overallSeverity` | String | `cleanskin`, `mild`, `moderate`, `moderate-severe`, `severe` |
| `questionnaire_completed` | Boolean | Always `true` when plan exists |
| `acne_analysis_completed` | Boolean | Always `true` when plan exists |
| `currentDay` | Number | Starts at 1, increments on each review |
| `days` | Array | Max 365 entries |
| `days[].day` | Number | Day number (1, 2, 3, ...) |
| `days[].morning.treatment` | String | AI-generated morning routine |
| `days[].morning.completed` | Boolean | Set to `true` on review |
| `days[].afternoon.treatment` | String | AI-generated afternoon routine |
| `days[].afternoon.completed` | Boolean | Set to `true` on review |
| `days[].evening.treatment` | String | AI-generated evening routine |
| `days[].evening.completed` | Boolean | Set to `true` on review |
| `days[].motivation` | String | AI motivational message |
| `days[].adjustment_reason` | String | Explains plan changes from previous day |
| `days[].feedback` | String | `"positive"`, `"negative"`, or `null` (pending) |
| `days[].notes` | String | User-provided notes |
| `days[].review` | String | Summary string of feedback and notes |

---

## Error Format

All error responses follow this shape:

```json
{
  "message": "Human-readable error message"
}
```

In `development` mode, some responses also include:

```json
{
  "message": "...",
  "error": "Detailed error message (dev only)"
}
```

---

## Quick cURL Flow

### 1. Register
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"john_doe","email":"john@example.com","password":"StrongPass123"}'
```

### 2. Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"john@example.com","password":"StrongPass123"}'
```

### 3. Save Questionnaire
```bash
curl -X POST http://localhost:5000/api/auth/userinfo \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"ageGroup":"18-25","sex":"Male","skinType":"Oily","sensitiveSkin":"No","medicationAllergy":"No"}'
```

### 4. Check Status
```bash
curl http://localhost:5000/api/auth/user-status \
  -H "Authorization: Bearer <TOKEN>"
```

### 5. Upload Acne Image
```bash
curl -X POST http://localhost:5000/api/auth/upload-acne \
  -H "Authorization: Bearer <TOKEN>" \
  -F "fullFace=@/path/to/face.jpg"
```

### 6. Start Treatment (Day 1)
```bash
curl -X POST http://localhost:5000/api/treatment/start \
  -H "Authorization: Bearer <TOKEN>"
```

### 7. Submit Day 1 Review
```bash
curl -X POST http://localhost:5000/api/treatment/review \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"day":1,"feedback":"positive","notes":"Skin felt less irritated"}'
```

### 8. Get Treatment Status
```bash
curl http://localhost:5000/api/treatment/status \
  -H "Authorization: Bearer <TOKEN>"
```

---

## Groq AI Integration

Treatment plans are generated via the [Groq API](https://groq.com) using the `llama-3.1-8b-instant` model (configurable via `GROQ_MODEL` env var).

**System prompt enforces:**
- Strict JSON-only output (no markdown, no prose)
- Required fields: `morning`, `afternoon`, `evening`, `motivation`, `adjustment_reason`
- Safety rules: never suggest isotretinoin or hormonal pills without supervision
- Mandatory warning for severe acne about dermatologist supervision

**Dermatology protocols by severity** (built into prompts):

| Severity | Key Ingredients Used |
|---|---|
| `cleanskin` | Gentle cleanser, light moisturizer, SPF |
| `mild` | Salicylic acid 0.5–2%, Adapalene 0.1% (or Azelaic acid for sensitive) |
| `moderate` | Clindamycin 1%, Adapalene 0.1% or Tretinoin 0.025%, BP 2.5% |
| `moderate-severe` | BP 2.5% wash, Clindamycin 1% (max 12 weeks), Adapalene/Tretinoin, oral Doxycycline (doctor only) |
| `severe` | Non-comedogenic cleanser, BP 2.5% spot treatment, Adapalene/Azelaic acid — with mandatory dermatologist warning |