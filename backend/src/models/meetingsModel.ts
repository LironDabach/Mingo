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
  organizerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
    required: true,
  },
  participants: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
  ],
  transcriptId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "transcript",
    required: true,
  },
  topics: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "topic",
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
