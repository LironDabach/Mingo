import mongoose from "mongoose";

const meetingSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  Date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  duration: {
    type: Number,
  },
  organizerID: {
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
  transcriptID: {
    ref: "transcript",
    required: true,
  },
  topics: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "topic",
    },
  ],
  llmChatID: {
    ref: "llmChat",
  },
});

export default mongoose.model("meeting", meetingSchema);
