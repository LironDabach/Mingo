import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  gitHubIssueId: {
    type: Number,
    required: true,
    unique: true,
  },

  gitHubRepoName: {
    type: String,
    required: true,
  },

  gitHubRepoOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
});

export default mongoose.model("task", taskSchema);
