import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  duration: {
    type: Number,
  },
  status: {
    type: String,
    enum: ["upcoming", "live", "completed"],
    default: "upcoming",
  },
  summary: {
    type: String,
    trim: true,
  },
  endedAt: {
    type: Date,
  },
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
  ],
  transcriptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "transcript",
    required: false,
  },
  gitHubRepoName: {
    type: String,
    required: false,
    trim: true,
  },
  googleCalendarEventId: {
    type: String,
    required: false,
  },
  inviteEmails: [
    {
      type: String,
      trim: true,
      lowercase: true,
    },
  ],
  topics: [
    {
      type: String,
    },
  ],
  tasks: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "task",
    },
  ],
  mingoAgentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "mingoAgent",
  },
});

export default mongoose.model("meeting", meetingSchema);
