import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import transcriptController from "../controllers/transcriptController";
import transcriptMP3Service from "../services/Transcript/transcribeMP3Service";

const router = express.Router();

/**
 * @openapi
 * /api/transcripts/{meetingId}:
 *   get:
 *     tags: [Transcripts]
 *     summary: Get a transcript by meeting id
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
 *         description: Transcript for the meeting
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Transcript'
 */
router.get(
  "/transcripts/:meetingId",
  authenticate,
  transcriptController.getByMeetingId.bind(transcriptController),
);

/**
 * @openapi
 * /api/transcript/mp3:
 *   post:
 *     tags: [Transcripts]
 *     summary: Upload an MP3 file for transcription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               title:
 *                 type: string
 *               date:
 *                 type: string
 *                 format: date-time
 *             required: [file]
 *     responses:
 *       '201':
 *         description: Audio transcribed and persisted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TranscriptCreateResponse'
 *       '400':
 *         description: Invalid file or request
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Transcription failed
 */
router.post(
  "/transcript/mp3",
  authenticate,
  transcriptMP3Service.upload.single("file"),
  transcriptController.transcribeAudio.bind(transcriptController),
);

/**
 * @openapi
 * /api/transcript/text:
 *   post:
 *     tags: [Transcripts]
 *     summary: Create a meeting and transcript from raw text
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TranscriptTextRequest'
 *     responses:
 *       '201':
 *         description: Meeting transcript created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TranscriptCreateResponse'
 */
router.post(
  "/transcript/text",
  authenticate,
  transcriptController.saveTranscriptTXT.bind(transcriptController),
);

export default router;
