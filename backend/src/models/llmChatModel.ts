import mongoose from "mongoose";

const llmChatSchema = new mongoose.Schema({
  meetingID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "meeting",
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  messages: [
    {
      sender: {
        type: String,
        enum: ["user", "mingo"],
        required: true,
      },
      content: {
        type: String,
        required: true,
      },
      timestamp: {
        type: Date,
        default: Date.now,
        required: true,
      },
    },
  ],
});

export default mongoose.model("llmChat", llmChatSchema);
