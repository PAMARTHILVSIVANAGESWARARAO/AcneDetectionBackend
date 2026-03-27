import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import authRoutes from "./src/routes/auth.routes.js";
import treatmentRoutes from "./src/routes/treatment.routes.js";
import connectDB from "./src/db/connection.js";

dotenv.config();

/**
 * ENVIRONMENT VALIDATION
 * These variables are required for production deployment
 */
const requiredEnvVars = [
  "JWT_SECRET",
  "MONGO_URI",
  "ML_API_URL",
  "GROQ_API_KEY",
  "ALLOWED_ORIGINS"
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

// Validate environment variable formats
if (!process.env.MONGO_URI.includes("mongodb")) {
  console.error("FATAL: MONGO_URI must be a valid MongoDB connection string");
  process.exit(1);
}

if (!process.env.ML_API_URL.startsWith("http")) {
  console.error("FATAL: ML_API_URL must be a valid HTTP(S) URL");
  process.exit(1);
}

const app = express();

/**
 * MIDDLEWARE SETUP
 */
// Remove Express fingerprinting header for basic hardening.
app.disable("x-powered-by");

// Trust reverse proxy (Render/NGINX/etc.) so secure cookies and rate-limit IPs work correctly.
const trustProxyEnv = (process.env.TRUST_PROXY || "1").trim();
const trustProxyValue =
  trustProxyEnv === "true"
    ? true
    : trustProxyEnv === "false"
      ? false
      : Number.isNaN(Number(trustProxyEnv))
        ? 1
        : Number(trustProxyEnv);
app.set("trust proxy", trustProxyValue);


// Body parser with size limits
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

// CORS configuration - Allow whitelisted origins (supports wildcards and localhost variants)
const NODE_ENV = process.env.NODE_ENV || "development";
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS
  .split(",")
  .map(origin => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

if (allowedOriginsEnv.length === 0) {
  console.error("FATAL: ALLOWED_ORIGINS must contain at least one valid origin");
  process.exit(1);
}

console.log(`🔐 CORS Configuration:`);
console.log(`   Environment: ${NODE_ENV}`);
console.log(`   Allowed Origins: ${allowedOriginsEnv.join(", ")}`);

// Helper function to check if origin matches allowed patterns
const isOriginAllowed = (origin, allowedOrigins) => {
  if (!origin) return true; // Allow requests without origin (CLI, mobile, etc.)
  
  return allowedOrigins.some(allowedOrigin => {
    // Exact match
    if (allowedOrigin === origin) return true;
    
    // localhost/127.0.0.1 variant matching (treat them as same for development)
    // e.g., http://localhost:5173 == http://127.0.0.1:5173
    const localhostVariants = (allowedOrigin) => {
      if (allowedOrigin.includes("localhost")) {
        return [
          allowedOrigin,
          allowedOrigin.replace("localhost", "127.0.0.1"),
          allowedOrigin.replace("localhost", "[::1]") // IPv6 localhost
        ];
      }
      if (allowedOrigin.includes("127.0.0.1")) {
        return [
          allowedOrigin,
          allowedOrigin.replace("127.0.0.1", "localhost"),
          allowedOrigin.replace("127.0.0.1", "[::1]")
        ];
      }
      return [allowedOrigin];
    };
    
    if (localhostVariants(allowedOrigin).includes(origin)) return true;
    
    // Wildcard match (e.g., https://*.onrender.com matches https://myapp.onrender.com)
    if (allowedOrigin.includes("*")) {
      const regexPattern = allowedOrigin
        .replace(/\./g, "\\.") // Escape dots
        .replace(/\*/g, ".*"); // Replace * with .*
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(origin);
    }
    
    return false;
  });
};

// CORS options
const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin, allowedOriginsEnv)) {
      callback(null, true);
    } else {
      // Log rejected origins for debugging
      console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
      console.warn(`📝 Allowed origins: ${allowedOriginsEnv.join(", ")}`);
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
  maxAge: 86400 // 24 hours
};

// In development, optionally allow all origins for easier debugging
// Uncomment the line below ONLY for development
// if (NODE_ENV === "development") corsOptions.origin = true;

// Allow all origins when explicitly enabled via environment (development/testing only)
if (process.env.ALLOW_ALL_ORIGINS === "true") {
  console.warn("⚠️  ALLOW_ALL_ORIGINS enabled — allowing requests from any origin (development only)");
  app.use(cors({ origin: true, credentials: true }));
} else {
  app.use(cors(corsOptions));
}

// Cookie parser
app.use(cookieParser());

/**
 * RATE LIMITING
 * Prevent brute force attacks and DoS
 */

// Strict limit for auth endpoints
const isDevelopment = NODE_ENV === "development";
const authRateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX) || (isDevelopment ? 200 : 50);
const generalRateLimitMax = Number(process.env.GENERAL_RATE_LIMIT_MAX) || (isDevelopment ? 2000 : 100);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: authRateLimitMax,
  message: { message: "Too many authentication attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for GET requests (status check, user count)
    return req.method === "GET";
  }
});

// General API limiter
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: generalRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Do not count preflight requests or lightweight auth status/profile GET checks.
    if (req.method === "OPTIONS") return true;

    if (req.method === "GET") {
      const path = (req.path || "").replace(/\/+$/, "");
      return path === "/auth/userinfo" || path === "/auth/user-status" || path === "/auth/users/count";
    }

    return false;
  }
});

// Apply limiters
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/", generalLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/treatment", treatmentRoutes);

/**
 * DATABASE CONNECTION
 */
connectDB();

/**
 * ROUTES
 */

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    environment: NODE_ENV
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    message: "AcneAI Backend API",
    version: "1.0.0",
    documentation: "/api/docs",
    status: "running"
  });
});

/**
 * ERROR HANDLING
 */

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    message: "Endpoint not found",
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  const errorMessage = err?.message || "Unknown error";
  console.error("Error:", errorMessage);
  
  // CORS error
  if (errorMessage.includes("Not allowed by CORS")) {
    return res.status(403).json({
      message: errorMessage,
      hint: "Check ALLOWED_ORIGINS in .env file"
    });
  }
  
  // Other errors
  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

/**
 * SERVER START
 */
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
  console.log(`🏥 Health Check: http://localhost:${PORT}/health\n`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    mongoose.connection.close();
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  server.close(() => {
    console.log("Server closed");
    mongoose.connection.close();
    process.exit(0);
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  process.exit(1);
});

export default app;
