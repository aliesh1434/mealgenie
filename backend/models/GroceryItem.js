const mongoose = require("mongoose");

const groceryItemSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  quantity: String,
  bought: { type: Boolean, default: false }
});

module.exports = mongoose.model("GroceryItem", groceryItemSchema);
