import express from "express";
import {
  register,
  login,
  getUserCount
} from "../controllers/auth.controller.js";
import { saveUserInfo, getMyUserInfo, getUserStatus } from "../controllers/userinfo.controller.js";
import authMiddleware from "../middleware/auth.middleware.js";
import { uploadAcneImages } from "../controllers/acne.controller.js";
import { upload } from "../middleware/upload.middleware.js";

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);
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
