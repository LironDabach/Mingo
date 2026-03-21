import mongoose from "mongoose";

const transcriptSchema = new mongoose.Schema({
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
  content: {
    type: String,
    required: true,
  },
});

export default mongoose.model("transcript", transcriptSchema);
