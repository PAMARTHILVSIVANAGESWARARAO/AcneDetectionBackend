import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";


const OTP_EXPIRY_TIME = 5 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const mailConfig = {
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true",
  user: process.env.SMTP_USER,
  pass: process.env.SMTP_PASS
};
const mailConfigured = Boolean(mailConfig.host && mailConfig.user && mailConfig.pass);

if (!mailConfigured) {
  console.warn("Mail disabled: SMTP_HOST/SMTP_USER/SMTP_PASS is missing.");
}

const transporter = mailConfigured
  ? nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: {
        user: mailConfig.user,
        pass: mailConfig.pass
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000
    })
  : null;

const generateOTP = () =>
  crypto.randomInt(100000, 999999).toString();

const generateUserId = () =>
  `USR-${uuidv4()}`;

const safeSendMail = async (options) => {
  if (!transporter) return false;
  try {
    await transporter.sendMail(options);
    return true;
  } catch (err) {
    console.error("Mail Error:", err.message, err.code ? `(code: ${err.code})` : "");
    return false;
  }
};

export const register = async (req, res) => {
  try {
    let { username, email, password, retype_password } = req.body || {};

    // Normalize inputs to avoid duplicates caused by casing/whitespace
    username = username && String(username).trim();
    email = email && String(email).toLowerCase().trim();

    if (!username || !email || !password || !retype_password)
      return res.status(400).json({ message: "All fields are required" });

    if (password !== retype_password)
      return res.status(400).json({ message: "Passwords do not match" });

    if (password.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ message: "Password too short" });

    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      // If the account is already verified, reject new registration attempts
      if (existingUser.isVerified) {
        return res.status(409).json({ message: "Email or username already registered" });
      }

      // Account exists but not verified — instruct to use resend OTP instead
      return res.status(409).json({ message: "Account exists but not verified. Use resend OTP to verify." });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    const user = await User.create({
      userId: generateUserId(),
      username,
      email,
      password: hashedPassword,
      otp: hashedOtp,
      otpExpiry: new Date(Date.now() + OTP_EXPIRY_TIME)
    });

    const mailSent = await safeSendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Verify Your Account – Secure Access Code Inside 💚",

      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify Your AcnePilot Account</title>
</head>

<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0; background-color:#f3f4f6;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 15px 40px rgba(0,0,0,0.08);">

<!-- HEADER -->
<tr>
<td align="center" style="background:linear-gradient(135deg,#166534,#22c55e); padding:35px 25px;">
<h1 style="margin:0; font-size:26px; color:#ffffff; font-weight:700; letter-spacing:0.5px;">
AcnePilot
</h1>
<p style="margin:8px 0 0 0; font-size:14px; color:#d1fae5;">
AI-Powered Personalized Acne Care
</p>
</td>
</tr>

<!-- BODY -->
<tr>
<td style="padding:40px 40px 30px 40px; color:#1f2937;">

<h2 style="margin-top:0; font-size:22px; color:#166534;">
Verify Your Email Address
</h2>

<p style="font-size:15px; line-height:1.8; margin:18px 0;">
Thank you for registering with <strong>AcnePilot</strong>.  
To securely activate your account and begin your personalized acne assessment,  
please confirm your email address using the One-Time Password (OTP) below.
</p>

<p style="font-size:15px; line-height:1.8; margin:18px 0;">
This verification step ensures the protection of your personal health information 
and prevents unauthorized access to your account.
</p>

<!-- OTP SECTION -->
<div style="margin:35px 0; text-align:center;">
<div style="
display:inline-block;
padding:20px 40px;
background:#f0fdf4;
border:2px solid #22c55e;
border-radius:12px;
font-size:32px;
font-weight:700;
letter-spacing:8px;
color:#166534;
">
${otp}
</div>
</div>

<p style="text-align:center; font-size:14px; color:#6b7280; margin-top:-10px;">
This code will expire in <strong>5 minutes</strong>.
</p>

<hr style="border:none; border-top:1px solid #e5e7eb; margin:35px 0;">

<p style="font-size:14px; line-height:1.8; color:#374151;">
If you did not request this verification, please disregard this email.  
For security reasons, do not share this code with anyone.
</p>

<p style="font-size:15px; line-height:1.8; margin-top:25px;">
We’re excited to support you on your journey toward healthier, clearer skin.
</p>

<p style="margin-top:30px; font-size:15px;">
Warm regards,<br>
<strong style="color:#166534;">The AcnePilot Team</strong>
</p>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td align="center" style="background:#f9fafb; padding:25px; font-size:13px; color:#6b7280; line-height:1.6;">
© ${new Date().getFullYear()} AcnePilot. All rights reserved.<br>
This is an automated message. Please do not reply directly to this email.
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`
    });

    if (!mailSent) {
      await User.deleteOne({ _id: user._id });
      return res.status(503).json({ message: "Unable to send verification OTP email. Please try again." });
    }

    return res.status(200).json({ message: "OTP sent to email" });

  } catch (err) {
    console.error("Register Error:", err);
    return res.status(500).json({ message: "Registration failed" });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    let { email, otp } = req.body || {};
    email = email && String(email).toLowerCase().trim();

    if (!email || !otp)
      return res.status(400).json({ message: "Email and OTP required" });

    const user = await User.findOne({ email });

    if (!user || !user.otp)
      return res.status(400).json({ message: "Invalid OTP" });

    if (!user.otpExpiry || user.otpExpiry.getTime() < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.otp);
    if (!valid)
      return res.status(400).json({ message: "Invalid OTP" });

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;

    await user.save();

    await safeSendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Welcome to AcneAI – Your Journey Begins Today 💚",

      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to AcnePilot</title>
</head>

<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0; background-color:#f3f4f6;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 15px 40px rgba(0,0,0,0.08);">

<!-- HEADER -->
<tr>
<td align="center" style="background:linear-gradient(135deg,#166534,#22c55e); padding:35px 25px;">
<h1 style="margin:0; font-size:26px; color:#ffffff; font-weight:700; letter-spacing:0.5px;">
AcnePilot
</h1>
<p style="margin:8px 0 0 0; font-size:14px; color:#d1fae5;">
AI-Driven Personalized Acne Care
</p>
</td>
</tr>

<!-- BODY -->
<tr>
<td style="padding:40px; color:#1f2937;">

<h2 style="margin-top:0; font-size:22px; color:#166534;">
Welcome, ${user.username}
</h2>

<p style="font-size:16px; line-height:1.8; margin:20px 0;">
Your account has been successfully verified, and you are now part of the <strong>AcnePilot</strong> community.
</p>

<p style="font-size:15px; line-height:1.8; margin:20px 0;">
AcnePilot combines dermatological knowledge with advanced artificial intelligence 
to help you assess acne severity and receive adaptive, personalized treatment guidance.
</p>

<p style="font-size:15px; line-height:1.8; margin:20px 0;">
Here’s what you can do next:
</p>

<ul style="font-size:15px; line-height:1.8; padding-left:20px; color:#374151;">
<li>Complete your health questionnaire</li>
<li>Upload facial images for AI analysis</li>
<li>Receive a customized treatment plan</li>
<li>Track daily progress with adaptive recommendations</li>
</ul>

<div style="margin:35px 0; text-align:center;">

</div>

<hr style="border:none; border-top:1px solid #e5e7eb; margin:35px 0;">

<p style="font-size:14px; line-height:1.8; color:#4b5563;">
Your privacy and security are our top priorities. All assessments are processed securely 
and are designed to support — not replace — professional medical consultation.
</p>

<p style="font-size:15px; line-height:1.8; margin-top:25px;">
We’re excited to support your journey toward clearer, healthier skin.
</p>

<p style="margin-top:30px; font-size:15px;">
Best regards,<br>
<strong style="color:#166534;">The AcnePilot Team</strong>
</p>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td align="center" style="background:#f9fafb; padding:25px; font-size:13px; color:#6b7280; line-height:1.6;">
© ${new Date().getFullYear()} AcnePilot. All rights reserved.<br>
This is an automated message. Please do not reply directly to this email.
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`
    });

    return res.status(200).json({ message: "Account verified" });

  } catch (err) {
    console.error("Verify Error:", err);
    return res.status(500).json({ message: "Verification failed" });
  }
};

export const resendOtp = async (req, res) => {
  try {
    let { email } = req.body || {};
    email = email && String(email).toLowerCase().trim();

    if (!email)
      return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });

    if (!user)
      return res.status(200).json({ message: "If account exists, OTP resent" });

    if (user.isVerified)
      return res.status(409).json({ message: "Account already verified" });

    if (user.otpExpiry && user.otpExpiry.getTime() > Date.now())
      return res.status(400).json({ message: "OTP still valid" });

    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.otp = hashedOtp;
    user.otpExpiry = new Date(Date.now() + OTP_EXPIRY_TIME);

    await user.save();

    const mailSent = await safeSendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Your New OTP – Verification Code Inside 💚",

      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verify Your AcnePilot Account</title>
</head>

<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0; background-color:#f3f4f6;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 15px 40px rgba(0,0,0,0.08);">

<!-- HEADER -->
<tr>
<td align="center" style="background:linear-gradient(135deg,#166534,#22c55e); padding:35px 25px;">
<h1 style="margin:0; font-size:24px; color:#ffffff; font-weight:700;">
AcnePilot
</h1>
<p style="margin:8px 0 0 0; font-size:14px; color:#d1fae5;">
Secure Account Verification
</p>
</td>
</tr>

<!-- BODY -->
<tr>
<td style="padding:40px; color:#1f2937;">

<h2 style="margin-top:0; font-size:20px; color:#166534;">
New Verification Code Requested
</h2>

<p style="font-size:15px; line-height:1.8; margin:20px 0;">
We received a request to resend your verification code.  
Please use the One-Time Password (OTP) below to complete your account verification.
</p>

<p style="font-size:15px; line-height:1.8;">
This step ensures your account remains protected and accessible only to you.
</p>

<!-- OTP BOX -->
<div style="margin:35px 0; text-align:center;">
<div style="
display:inline-block;
padding:18px 40px;
background:#f0fdf4;
border:2px solid #22c55e;
border-radius:12px;
font-size:30px;
font-weight:700;
letter-spacing:8px;
color:#166534;
">
${otp}
</div>
</div>

<p style="text-align:center; font-size:14px; color:#6b7280; margin-top:-10px;">
This code is valid for <strong>5 minutes</strong>.
</p>

<hr style="border:none; border-top:1px solid #e5e7eb; margin:35px 0;">

<p style="font-size:14px; line-height:1.8; color:#374151;">
If you did not request this code, no further action is required.  
For your security, never share your verification code with anyone.
</p>

<p style="margin-top:30px; font-size:15px;">
Sincerely,<br>
<strong style="color:#166534;">The AcnePilot Team</strong>
</p>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td align="center" style="background:#f9fafb; padding:25px; font-size:13px; color:#6b7280; line-height:1.6;">
© ${new Date().getFullYear()} AcnePilot. All rights reserved.<br>
This is an automated message. Please do not reply directly to this email.
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`
    });

    if (!mailSent) {
      return res.status(503).json({ message: "Unable to send OTP email right now. Please try again later." });
    }

    return res.status(200).json({ message: "OTP resent" });

  } catch (err) {
    console.error("Resend Error:", err);
    return res.status(500).json({ message: "Resend failed" });
  }
};

export const login = async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = email && String(email).toLowerCase().trim();

    if (!email || !password)
      return res.status(400).json({ message: "Email and password required" });

    const user = await User.findOne({ email }).select("+password");

    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified)
      return res.status(403).json({ message: "Verify account first" });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(400).json({ message: "Invalid credentials" });

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

export const forgotPassword = async (req, res) => {
  try {
    let { email } = req.body || {};
    email = email && String(email).toLowerCase().trim();

    if (!email)
      return res.status(400).json({ message: "Email required" });

    const user = await User.findOne({ email });

    if (!user)
      return res.status(200).json({ message: "If account exists, OTP sent" });

    const otp = generateOTP();
    const hashedOtp = await bcrypt.hash(otp, 10);

    user.resetOtp = hashedOtp;
    user.resetOtpExpiry = new Date(Date.now() + OTP_EXPIRY_TIME);

    await user.save();

    const mailSent = await safeSendMail({
      from: process.env.SMTP_FROM,
      to: email,
      subject: "Reset Your Password – Secure OTP Inside 💚",

      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset Your AcnePilot Password</title>
</head>

<body style="margin:0; padding:0; background-color:#f3f4f6; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0; background-color:#f3f4f6;">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:16px; overflow:hidden; box-shadow:0 15px 40px rgba(0,0,0,0.08);">

<!-- HEADER -->
<tr>
<td align="center" style="background:linear-gradient(135deg,#166534,#22c55e); padding:35px 25px;">
<h1 style="margin:0; font-size:24px; color:#ffffff; font-weight:700;">
AcnePilot
</h1>
<p style="margin:8px 0 0 0; font-size:14px; color:#d1fae5;">
Secure Password Recovery
</p>
</td>
</tr>

<!-- BODY -->
<tr>
<td style="padding:40px; color:#1f2937;">

<h2 style="margin-top:0; font-size:20px; color:#166534;">
Password Reset Verification
</h2>

<p style="font-size:15px; line-height:1.8; margin:20px 0;">
We received a request to reset the password associated with your AcnePilot account.
To proceed securely, please use the One-Time Password (OTP) provided below.
</p>

<p style="font-size:15px; line-height:1.8;">
This verification step ensures that only you can modify your account credentials.
</p>

<!-- OTP BOX -->
<div style="margin:35px 0; text-align:center;">
<div style="
display:inline-block;
padding:18px 40px;
background:#f0fdf4;
border:2px solid #22c55e;
border-radius:12px;
font-size:30px;
font-weight:700;
letter-spacing:8px;
color:#166534;
">
${otp}
</div>
</div>

<p style="text-align:center; font-size:14px; color:#6b7280; margin-top:-10px;">
This code will expire in <strong>5 minutes</strong>.
</p>

<hr style="border:none; border-top:1px solid #e5e7eb; margin:35px 0;">

<p style="font-size:14px; line-height:1.8; color:#374151;">
If you did not request a password reset, you can safely ignore this email.
No changes will be made to your account without this verification code.
</p>

<p style="margin-top:30px; font-size:15px;">
Regards,<br>
<strong style="color:#166534;">The AcnePilot Team</strong>
</p>

</td>
</tr>

<!-- FOOTER -->
<tr>
<td align="center" style="background:#f9fafb; padding:25px; font-size:13px; color:#6b7280; line-height:1.6;">
© ${new Date().getFullYear()} AcnePilot. All rights reserved.<br>
This is an automated security message. Please do not reply to this email.
</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`
    });

    if (!mailSent) {
      return res.status(503).json({ message: "Unable to send reset OTP email right now. Please try again later." });
    }

    return res.status(200).json({ message: "If account exists, OTP sent" });

  } catch (err) {
    console.error("Forgot Error:", err);
    return res.status(500).json({ message: "Reset request failed" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    let { email, otp, newPassword } = req.body || {};
    email = email && String(email).toLowerCase().trim();

    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "All fields required" });

    const user = await User.findOne({ email }).select("+password");

    if (!user || !user.resetOtp)
      return res.status(400).json({ message: "Invalid OTP" });

    if (!user.resetOtpExpiry || user.resetOtpExpiry.getTime() < Date.now())
      return res.status(400).json({ message: "OTP expired" });

    const valid = await bcrypt.compare(otp, user.resetOtp);
    if (!valid)
      return res.status(400).json({ message: "Invalid OTP" });

    if (newPassword.length < MIN_PASSWORD_LENGTH)
      return res.status(400).json({ message: "Password too short" });

    user.password = await bcrypt.hash(newPassword, 12);
    user.resetOtp = null;
    user.resetOtpExpiry = null;

    await user.save();

    return res.status(200).json({ message: "Password reset successful" });

  } catch (err) {
    console.error("Reset Error:", err);
    return res.status(500).json({ message: "Password reset failed" });
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
