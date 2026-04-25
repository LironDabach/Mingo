import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import meetingsController from "../controllers/meetingsController";

const router = express.Router();

/**
 * @openapi
 * /api/meetings/meetings:
 *   get:
 *     tags: [Meetings]
 *     summary: Get all meetings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: List of meetings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Meeting'
 *       '401':
 *         description: Unauthorized
 *   post:
 *     tags: [Meetings]
 *     summary: Create a meeting
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MeetingWriteRequest'
 *     responses:
 *       '201':
 *         description: Meeting created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Meeting'
 */
router.get("/meetings", authenticate, meetingsController.getAll.bind(meetingsController));
router.post("/meetings", authenticate, meetingsController.create.bind(meetingsController));

/**
 * @openapi
 * /api/meetings/meetings/{id}:
 *   get:
 *     tags: [Meetings]
 *     summary: Get a meeting by id
 *     description: This route is ambiguous in the current Express router because `/meetings/:id` and `/meetings/:userId` share the same path shape. The controller may return a single meeting or a list of meetings for a user depending on the value provided.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Meeting or list of meetings returned
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/Meeting'
 *                 - type: array
 *                   items:
 *                     $ref: '#/components/schemas/Meeting'
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Meeting not found
 *   put:
 *     tags: [Meetings]
 *     summary: Update a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MeetingWriteRequest'
 *     responses:
 *       '200':
 *         description: Meeting updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Meeting'
 *   delete:
 *     tags: [Meetings]
 *     summary: Delete a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Meeting deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Meeting'
 */
router.get("/meetings/:id", authenticate, meetingsController.getById.bind(meetingsController));
router.put("/meetings/:id", authenticate, meetingsController.update.bind(meetingsController));
router.delete("/meetings/:id", authenticate, meetingsController.delete.bind(meetingsController));
router.post("/meetings/:id/send-summary-email", authenticate, meetingsController.sendSummaryEmail.bind(meetingsController));

/**
 * @openapi
 * /api/meetings/meetings/{userId}/upcoming:
 *   get:
 *     tags: [Meetings]
 *     summary: Get upcoming meetings for a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Upcoming meetings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Meeting'
 */
router.get("/meetings/:userId/upcoming", authenticate, meetingsController.getUpcomingByUserId.bind(meetingsController));

/**
 * @openapi
 * /api/meetings/meetings/{userId}/recent:
 *   get:
 *     tags: [Meetings]
 *     summary: Get recent meetings for a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Recent meetings
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Meeting'
 */
router.get("/meetings/:userId/recent", authenticate, meetingsController.getRecentByUserId.bind(meetingsController));

/**
 * @openapi
 * /api/meetings/meetings/{userId}/last-month:
 *   get:
 *     tags: [Meetings]
 *     summary: Get meetings from the last month for a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Meetings from the last month
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Meeting'
 */
router.get("/meetings/:userId/last-month", authenticate, meetingsController.getLastMonthByUserId.bind(meetingsController));

/**
 * @openapi
 * /api/meetings/meetings/{userId}/this-month:
 *   get:
 *     tags: [Meetings]
 *     summary: Get meetings from the current calendar month for a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Meetings from this month
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Meeting'
 */
router.get("/meetings/:userId/this-month", authenticate, meetingsController.getThisMonthByUserId.bind(meetingsController));

/**
 * @openapi
 * /api/meetings/meetings/{userId}/average-duration:
 *   get:
 *     tags: [Meetings]
 *     summary: Get average meeting duration for a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Average duration
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AverageDurationResponse'
 */
router.get("/meetings/:userId/average-duration", authenticate, meetingsController.getAverageDurationByUserId.bind(meetingsController));
router.get("/meetings/:userId", authenticate, meetingsController.getByUserId.bind(meetingsController));

export default router;
