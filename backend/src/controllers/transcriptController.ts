import { Response } from "express";
import transcriptModel from "../models/transcriptModel";
import { AuthRequest } from "../middleware/authMiddleware";
import baseController from "./baseController";
import transcriptMP3Service, {
  TranscriptProcessingError,
} from "../services/Transcript/transcribeMP3Service";
import transcriptPersistenceService from "../services/Transcript/transcriptPersistenceService";

class transcriptController extends baseController {
  constructor() {
    super(transcriptModel);
  }

  async getByMeetingId(req: AuthRequest, res: Response) {
    const meetingId = req.params.meetingId;
    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    try {
      const transcripts = await this.model.findOne({ meetingID: meetingId });
      res.json(transcripts);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't retrieve transcripts for the meeting");
    }
  }

  async transcribeAudio(req: AuthRequest, res: Response) {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      const result = await transcriptMP3Service.transcribeAudio({
        file: req.file,
        organizerId: req.user._id,
        title: req.body?.title,
        date: req.body?.date,
        gitHubRepoName: req.body?.gitHubRepoName,
        attendeeEmails: Array.isArray(req.body?.attendeeEmails)
          ? req.body.attendeeEmails
          : typeof req.body?.attendeeEmails === "string"
            ? req.body.attendeeEmails.split(",")
            : [],
      });

      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof TranscriptProcessingError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error("Error during transcription:", error);
      return res.status(500).json({ error: "Transcription failed" });
    }
  }

  async saveTranscriptTXT(req: AuthRequest, res: Response) {
    if (!req.user?._id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const result = await transcriptPersistenceService.createMeetingTranscript({
        organizerId: req.user._id,
        content: req.body?.content,
        title: req.body?.title,
        date: req.body?.date,
      });

      return res.status(201).json(result);
    } catch (error) {
      if (error instanceof TranscriptProcessingError) {
        return res.status(error.statusCode).json({ error: error.message });
      }

      console.error("Error saving transcript text:", error);
      return res.status(500).json({ error: "Saving transcript text failed" });
    }
  }
}

export default new transcriptController();
