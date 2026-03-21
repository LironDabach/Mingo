import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import transcriptController from "../controllers/transcriptController";
import transcriptMP3Service from "../services/Transcript/transcribeMP3Service";

const router = express.Router();

router.get(
  "/transcripts/:meetingId",
  authenticate,
  transcriptController.getByMeetingId.bind(transcriptController),
);

router.post(
  "/transcript/mp3",
  authenticate,
  transcriptMP3Service.upload.single("file"),
  transcriptController.transcribeAudio.bind(transcriptController),
);

router.post(
  "/transcript/text",
  authenticate,
  transcriptController.saveTranscriptTXT.bind(transcriptController),
);

export default router;
