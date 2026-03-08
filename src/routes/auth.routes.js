import express from "express";
import {
  register,
  verifyOtp,
  resendOtp,
  login,
  forgotPassword,
  resetPassword,
  getUserCount
} from "../controllers/auth.controller.js";
import { saveUserInfo, getMyUserInfo, getUserStatus } from "../controllers/userinfo.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { uploadAcneImages } from "../controllers/acne.controller.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/verify-otp", verifyOtp);
router.post("/resend-otp", resendOtp);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/users/count", getUserCount);

// Protected routes
router.post("/userinfo", authMiddleware, saveUserInfo);
router.get("/userinfo", authMiddleware, getMyUserInfo);
router.get("/user-status", authMiddleware, getUserStatus);

router.post(
  "/upload-acne",
  authMiddleware,
  upload.fields([
    { name: "forehead" },
    { name: "leftCheek" },
    { name: "rightCheek" },
    { name: "chin" },
    { name: "neck" },
    { name: "back" },
    { name: "fullFace", maxCount: 1 }
  ]),
  uploadAcneImages
);

export default router;
