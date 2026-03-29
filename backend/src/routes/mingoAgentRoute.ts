import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import mingoAgentController from "../controllers/mingoAgentController";

const router = express.Router();

/**
 * @openapi
 * /api/meetings/{meetingId}/mingoAgent:
 *   get:
 *     tags: [Mingo Agent]
 *     summary: Get agent chat history for a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Chat history
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MingoAgentChat'
 */
router.get("/meetings/:meetingId/mingoAgent", authenticate, mingoAgentController.getByMeetingId.bind(mingoAgentController));

/**
 * @openapi
 * /api/meetings/{meetingId}/mingoAgent/generateSummary:
 *   get:
 *     tags: [Mingo Agent]
 *     summary: Generate a meeting summary
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Summary generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateSummaryResponse'
 */
router.get("/meetings/:meetingId/mingoAgent/generateSummary", authenticate, mingoAgentController.generateSummary.bind(mingoAgentController));

/**
 * @openapi
 * /api/meetings/{meetingId}/mingoAgent/generateTopics:
 *   get:
 *     tags: [Mingo Agent]
 *     summary: Generate discussion topics for a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Topics generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateTopicsResponse'
 */
router.get("/meetings/:meetingId/mingoAgent/generateTopics", authenticate, mingoAgentController.generateTopics.bind(mingoAgentController));

/**
 * @openapi
 * /api/meetings/{meetingId}/mingoAgent/generateReply:
 *   post:
 *     tags: [Mingo Agent]
 *     summary: Generate a chat reply for a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateReplyRequest'
 *     responses:
 *       '200':
 *         description: Reply generated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GenerateReplyResponse'
 */
router.post("/meetings/:meetingId/mingoAgent/generateReply", authenticate, mingoAgentController.generateReply.bind(mingoAgentController));

export default router;
