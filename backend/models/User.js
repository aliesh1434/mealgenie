const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  resetToken: String,
  resetTokenExpiry: Number,
  resetPasswordToken: String,
resetPasswordExpire: Date
});

module.exports = mongoose.model("User", UserSchema);
