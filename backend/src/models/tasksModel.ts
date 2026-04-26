import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    trim: true,
  },

  description: {
    type: String,
    trim: true,
  },

  assigneeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: false,
  },

  assigneeName: {
    type: String,
    trim: true,
  },

  dueDate: {
    type: Date,
  },

  status: {
    type: String,
    enum: ["To Do", "In Progress", "Done"],
    default: "To Do",
  },

  gitHubIssueId: {
    type: Number,
    required: false,
    unique: true,
    sparse: true,
  },

  gitHubRepoName: {
    type: String,
    required: false,
    trim: true,
  },

  gitHubRepoOwner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: false,
  },
}, { timestamps: true });

export default mongoose.model("task", taskSchema);
