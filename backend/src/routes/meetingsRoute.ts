import express from "express";
import { authenticate } from "../middleware/authMiddleware";

const router = express.Router();

//router.post("/meetings/transcribe", authenticate, meetingsController.transcribeAudio.bind(meetingsController));

// router.post("/meetings/:meetingId", authenticate, meetingsController.createByPostId.bind(meetingsController));

export default router;