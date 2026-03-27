import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";

dotenv.config();

const MIN_PASSWORD_LENGTH = 8;
const JWT_SECRET = process.env.JWT_SECRET;

const generateUserId = () => `USR-${uuidv4()}`;

export const register = async (req, res) => {
  try {
    let { username, email, password } = req.body || {};

    username = username && String(username).trim();
    email = email && String(email).toLowerCase().trim();

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email and password are required" });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: "Password too short" });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(409).json({ message: "Email or username already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      userId: generateUserId(),
      username,
      email,
      password: hashedPassword
    });

    const token = jwt.sign({ id: user._id, userId: user.userId }, JWT_SECRET, {
      expiresIn: "1d"
    });

    return res.status(201).json({
      message: "Registration successful",
      token,
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email
      }
    });
  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
};

export const login = async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = email && String(email).toLowerCase().trim();

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, userId: user.userId },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    return res.status(200).json({ token });
  } catch (err) {
    console.error("Login Error:", err);
    return res.status(500).json({ message: "Login failed" });
  }
};

export const getUserCount = async (req, res) => {
  try {
    const count = await User.countDocuments();
    return res.status(200).json({ totalUsers: count });
  } catch (err) {
    console.error("Count Error:", err);
    return res.status(500).json({ message: "Failed to fetch user count" });
  }
};
