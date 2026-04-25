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
  githubAccessToken: {
    type: String,
    required: false,
  },
  githubTokenType: {
    type: String,
    required: false,
  },
  githubTokenScope: {
    type: String,
    required: false,
  },
  googleId: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
  },
  googleAccessToken: {
    type: String,
    required: false,
  },
  googleTokenScope: {
    type: String,
    required: false,
  },
});

export default mongoose.model("user", userSchema);
