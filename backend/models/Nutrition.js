const mongoose = require("mongoose");

const NutritionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true },
  calories: { type: Number, default: 0 },
  protein: { type: Number, default: 0 },
  fat: { type: Number, default: 0 },
  carbs: { type: Number, default: 0 }
});

module.exports = mongoose.model("Nutrition", NutritionSchema);
