// server.js
require("dotenv").config();
console.log("Gemini Key Loaded:", !!process.env.GEMINI_API_KEY);


const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const fetch = require("node-fetch").default || require("node-fetch");

// Gemini AI (single import, used everywhere)
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = process.env.GEMINI_API_KEY 
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const app = express();
app.use(cors());
app.use(express.json());

// --- Models ---
const User = require("./models/User");
const PantryItem = require("./models/PantryItem");
const GroceryItem = require("./models/GroceryItem");
const SavedRecipe = require("./models/SavedRecipe");

// --- Config ---
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/mealgenie";
const JWT_SECRET = process.env.JWT_SECRET || "secret123";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "7d";
const BASE_URL = process.env.BASE_URL || "http://localhost:5500/mealgenie/frontend";

// --- Connect MongoDB ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.error("MongoDB Error:", err));

// --- Auth Middleware ---
function auth(req, res, next) {
  const token = (req.headers.authorization || "").split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    req.userId = jwt.verify(token, JWT_SECRET).id;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid token" });
  }
}

// --- Email Sender ---
async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_EMAIL || !process.env.SMTP_PASSWORD)
    throw new Error("SMTP credentials missing");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  await transporter.sendMail({ from: `"MealGenie Support" <${process.env.SMTP_EMAIL}>`, to, subject, html });
}

// --- Reset Email Template ---
function resetEmailTemplate(name, resetUrl) {
  return `
  <div style="font-family: Arial; padding:20px; color:#333;">
    <div style="text-align:center;">
      <img src="https://i.postimg.cc/28d2Jw9p/mealgenie-logo-dark.png" 
      style="height:60px; margin-bottom:20px;" />
    </div>
    <h2 style="color:#16A34A;">Hello ${name},</h2>
    <p>You requested to reset your password.</p>
    <a href="${resetUrl}" style="background:#16A34A; padding:12px 22px; color:white; 
    border-radius:10px; text-decoration:none;">Reset Password 🔐</a>
    <p style="font-size:12px; opacity:0.8; margin-top:20px;">If not requested, ignore this email.</p>
  </div>`;
}

// ===============================================================
// ROUTES
// ===============================================================

app.get("/", (req, res) => res.send("MealGenie Backend Working"));

// ---------------- AUTH ----------------
app.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Other errors → safe fallback
    return res.json({
      title: "Recipe Unavailable",
      description: query,
      recipe: "AI temporarily unavailable. Try again later.",
      imageUrl: ""
    });
  }
});



// ---------- AI RECIPE ----------
app.post("/ai/recipe", auth, async (req, res) => {
  try {
    if (!genAI) return res.json({ recipe: "AI disabled" });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-pro" });
    const prompt = `Create an Indian recipe with: ${req.body.ingredients.join(", ")}.\nUse friendly tone.`;

    const result = await model.generateContent(prompt);

    res.json({ recipe: result.response.text() });
  } catch (err) {
    console.error("AI Recipe Error:", err);
    res.status(500).json({ message: "AI generation failed" });
  }
});

// ---------- AI SEARCH ----------
app.post("/ai/search", auth, async (req, res) => {
  try {
    if (!genAI) return res.json({ recipe: "AI disabled" });

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const prompt = `Provide JSON only:
{
"title": "",
"description": "",
"recipe": ""
}
Recipe for: ${req.body.query}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      const parsed = JSON.parse(text);
      return res.json({ ...parsed, imageUrl: "" });
    } catch {
      return res.json({
        title: "AI Recipe",
        description: req.body.query,
        recipe: text,
        imageUrl: ""
      });
    }
  } catch (err) {
    console.error("AI Search Error:", err);
    res.status(500).json({ message: "AI search failed" });
  }
});

// ===============================================================
// FORGOT PASSWORD
// ===============================================================
app.post("/forgot-password", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    const resetUrl = `${BASE_URL}/resetpassword.html?token=${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: "MealGenie Password Reset",
      html: resetEmailTemplate(user.name || "Friend", resetUrl),
    });

    res.json({ message: "Reset email sent!" });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ message: "Email failed" });
  }
});

// ===============================================================
// RESET PASSWORD
// ===============================================================
app.put("/reset-password/:token", async (req, res) => {
  try {
    const hashed = crypto.createHash("sha256").update(req.params.token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = await bcrypt.hash(req.body.password, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.json({ message: "Password reset successful!" });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ===============================================================
// START SERVER
// ===============================================================
app.listen(PORT, () =>
  console.log(`🚀 MealGenie Backend running on port ${PORT}`)
);
