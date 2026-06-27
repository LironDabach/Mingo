import { Response } from "express";
import mingoAgentModel from "../models/mingoAgentModel";
import { AuthRequest } from "../middleware/authMiddleware";
import baseController from "./baseController";
import mingoAgentService from "../services/LLM/mingoAgentService";

class mingoAgentController extends baseController {
  constructor() {
    super(mingoAgentModel);
  }

  async getByMeetingId(req: AuthRequest, res: Response) {
    const meetingId = req.params.meetingId;
    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    try {
      const chats = await this.model.findOne({ meetingID: meetingId });
      res.json(chats);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't retrieve chats for the meeting");
    }
  }

  async generateReply(req: AuthRequest, res: Response) {
    const meetingId = req.params.meetingId;
    const { message, transcript } = req.body;

    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error:
          "Message body parameter is required and must be a non-empty string",
      });
    }

    try {
      const result = await mingoAgentService.generateReply(
        meetingId,
        message,
        req.user?._id,
        typeof transcript === "string" ? transcript : undefined,
      );
      res.json({ reply: result.reply });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't generate reply for the meeting");
    }
  }

  // Generate summary for the meeting
  async generateSummary(req: AuthRequest, res: Response) {
    const meetingId = req.params.meetingId;

    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    try {
      const result = await mingoAgentService.generateSummary(meetingId);
      res.json({ summary: result.summary });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't generate summary for the meeting");
    }
  }
}

export default new mingoAgentController();
