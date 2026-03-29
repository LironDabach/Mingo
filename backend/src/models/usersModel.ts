import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
  },

  password: {
    type: String,
    required: false,
  },

  refreshTokens: {
    type: [String],
    default: [],
  },

  fullname: {
    type: String,
    required: true,
    unique: true,
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
    sparse: true,
  },
  googleId: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
  },
});

export default mongoose.model("user", userSchema);
