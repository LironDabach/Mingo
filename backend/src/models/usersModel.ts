import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    required: false, // Not required for GitHub OAuth users
  },

  refreshTokens: {
    type: [String],
    default: [],
  },

  profilePicture: {
    type: String,
    required: false,
  },

  email: {
    type: String,
    required: true,
    unique: true,
  },

  githubId: {
    type: String,
    required: false,
    unique: true,
    sparse: true, // Allows multiple null values
  },
});

export default mongoose.model("user", userSchema);
