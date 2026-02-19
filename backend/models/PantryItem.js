const mongoose = require("mongoose");

const pantryItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  quantity: String,
  expiresAt: String
});

module.exports = mongoose.model("PantryItem", pantryItemSchema);
