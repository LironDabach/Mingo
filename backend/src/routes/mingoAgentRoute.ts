import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import mingoAgentController from "../controllers/mingoAgentController";

const router = express.Router();

router.get("/meetings/:meetingId/mingoAgent", authenticate, mingoAgentController.getByMeetingId.bind(mingoAgentController));

router.get("/meetings/:meetingId/mingoAgent/generateSummary", authenticate, mingoAgentController.generateSummary.bind(mingoAgentController));

router.get("/meetings/:meetingId/mingoAgent/generateTopics", authenticate, mingoAgentController.generateTopics.bind(mingoAgentController));

router.post("/meetings/:meetingId/mingoAgent/generateReply", authenticate, mingoAgentController.generateReply.bind(mingoAgentController));

export default router;
