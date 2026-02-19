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
    if (!name || !email || !password)
      return res.status(400).json({ message: "Missing fields" });

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email, password: hashed });

    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

    res.status(201).json({ message: "Registered", token, name, email });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: "User not found" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Wrong password" });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

    res.json({ message: "Login successful", token, name: user.name, email });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ---------------- PROFILE ----------------
app.get("/me", auth, async (req, res) => {
  res.json(await User.findById(req.userId).select("-password"));
});

app.put("/me", auth, async (req, res) => {
  res.json(await User.findByIdAndUpdate(req.userId, { name: req.body.name }, { new: true }).select("-password"));
});

// ---------------- STATS ----------------
app.get("/stats", auth, async (req, res) => {
  try {
    const savedRecipes = await SavedRecipe.countDocuments({ userId: req.userId });
    const pantry = await PantryItem.find({ userId: req.userId });

    const wasted = pantry.filter(i => i.expiresAt && new Date(i.expiresAt) < new Date()).length;
    const foodWasteSaved = wasted * 0.35;

    res.json({ recipesCooked: savedRecipes, savedRecipes, foodWasteSaved });
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ message: "Stats error" });
  }
});

// ---------------- PANTRY ----------------
app.get("/pantry", auth, async (req, res) => {
  res.json(await PantryItem.find({ userId: req.userId }));
});

app.post("/pantry", auth, async (req, res) => {
  res.json(await PantryItem.create({ userId: req.userId, ...req.body }));
});

app.delete("/pantry/:id", auth, async (req, res) => {
  await PantryItem.deleteOne({ _id: req.params.id, userId: req.userId });
  res.json({ message: "Deleted" });
});

// ---------------- GROCERY ----------------
app.get("/grocery", auth, async (req, res) => {
  res.json(await GroceryItem.find({ userId: req.userId }));
});

app.post("/grocery", auth, async (req, res) => {
  res.json(await GroceryItem.create({ userId: req.userId, ...req.body }));
});

app.patch("/grocery/:id/toggle", auth, async (req, res) => {
  const item = await GroceryItem.findOne({ _id: req.params.id, userId: req.userId });
  if (!item) return res.status(404).json({ message: "Not found" });

  item.bought = !item.bought;
  await item.save();
  res.json(item);
});

app.delete("/grocery/:id", auth, async (req, res) => {
  await GroceryItem.deleteOne({ _id: req.params.id, userId: req.userId });
  res.json({ message: "Deleted" });
});

// ---------------- NUTRITION ----------------
app.post("/nutrition", auth, async (req, res) => {
  try {
    const response = await fetch(
      `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(req.body.ingredient)}`,
      { headers: { "X-Api-Key": process.env.NUTRITION_API_KEY || "" } }
    );
    const json = await response.json();
    res.json(json[0] || {});
  } catch (err) {
    console.error("Nutrition error:", err);
    res.status(500).json({ message: "Nutrition error" });
  }
});

// ---------------- SAVE RECIPE ----------------
app.post("/recipe/save", auth, async (req, res) => {
  await SavedRecipe.create({ userId: req.userId, ...req.body });
  res.json({ message: "Saved!" });
});

// ===============================================================
// AI ROUTES — Gemini 2.0 fixed
// ===============================================================

// ---------- AI SUGGEST ----------
// ---------- AI SEARCH (Production Safe) ----------
app.post("/ai/search", auth, async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ message: "query required" });

    if (!genAI) {
      return res.json({
        title: "AI Unavailable",
        description: query,
        recipe: "Enable your AI key to generate full recipes.",
        imageUrl: ""
      });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `Provide JSON only:
{
"title": "",
"description": "",
"recipe": ""
}
Recipe for: ${query}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    try {
      const parsed = JSON.parse(text);
      return res.json({ ...parsed, imageUrl: "" });
    } catch {
      return res.json({
        title: "AI Recipe",
        description: query,
        recipe: text,
        imageUrl: ""
      });
    }

  } catch (error) {
    console.error("AI Search Error:", error);

    // ⭐ Fallback for QUOTA exceeded
    if (error.status === 429) {
      return res.json({
        title: `${req.body.query} (Quick Recipe)`,
        description: "AI quota exceeded — here is a smart offline fallback recipe.",
        recipe:
`1) Heat oil in a pan.
2) Add onions, ginger-garlic paste and sauté.
3) Add tomatoes, spices (salt, turmeric, chili).
4) Add your main ingredient: ${req.body.query}.
5) Cook for 10–15 minutes.
6) Garnish with coriander and serve.`,
        imageUrl: ""
      });
    }

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
