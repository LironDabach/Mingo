import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import llmChatController from "../controllers/llmChatController";

const router = express.Router();

router.get("/meetings/:meetingId/llmChat", authenticate, llmChatController.getByMeetingId.bind(llmChatController));

router.get("/meetings/:meetingId/llmChat/generateSummary", authenticate, llmChatController.generateSummary.bind(llmChatController));

router.post("/meetings/:meetingId/llmChat/generateReply", authenticate, llmChatController.generateReply.bind(llmChatController));

export default router;
