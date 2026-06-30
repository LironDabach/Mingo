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

  createdInMeetingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "meeting",
    required: false,
  },

  completedInMeetingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "meeting",
    required: false,
  },

  completedAt: {
    type: Date,
    required: false,
  },
}, { timestamps: true });

taskSchema.index({ gitHubIssueId: 1, gitHubRepoName: 1 }, { unique: true, sparse: true });

export default mongoose.model("task", taskSchema);
