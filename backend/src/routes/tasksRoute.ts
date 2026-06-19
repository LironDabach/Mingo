import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import tasksController from "../controllers/tasksController";

const router = express.Router();

/**
 * @openapi
 * /api/meetings/{meetingId}/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: Get all tasks for a meeting
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
 *         description: Tasks for the meeting
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task for a meeting
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
 *             $ref: '#/components/schemas/TaskWriteRequest'
 *     responses:
 *       '201':
 *         description: Task created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 */
router.get("/meetings/:meetingId/tasks", authenticate, tasksController.getByMeetingId.bind(tasksController));
router.post("/meetings/:meetingId/tasks", authenticate, tasksController.create.bind(tasksController));
router.post("/meetings/:meetingId/suggest-tasks", authenticate, tasksController.suggestFromTranscript.bind(tasksController));

/**
 * @openapi
 * /api/meetings/{meetingId}/tasks/{taskId}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get a task by id for a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Task found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *   put:
 *     tags: [Tasks]
 *     summary: Update a task for a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TaskWriteRequest'
 *     responses:
 *       '200':
 *         description: Task updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task from a meeting
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: meetingId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: taskId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Task deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Task'
 */
router.get("/meetings/:meetingId/tasks/:taskId", authenticate, tasksController.getById.bind(tasksController));
router.put("/meetings/:meetingId/tasks/:taskId", authenticate, tasksController.update.bind(tasksController));
router.delete("/meetings/:meetingId/tasks/:taskId", authenticate, tasksController.delete.bind(tasksController));

/**
 * @openapi
 * /api/users/{userId}/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: Get tasks for a user from linked or selected GitHub repositories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: repo
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional repository name or owner/name to sync issues from.
 *     responses:
 *       '200':
 *         description: Tasks for the user
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Task'
 */
router.get("/users/:userId/tasks", authenticate, tasksController.getByUserId.bind(tasksController));

export default router;
