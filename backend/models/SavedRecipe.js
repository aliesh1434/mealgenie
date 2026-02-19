const mongoose = require("mongoose");

const SavedRecipeSchema = new mongoose.Schema({
  userId: String,
  title: String,
  recipe: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SavedRecipe", SavedRecipeSchema);
