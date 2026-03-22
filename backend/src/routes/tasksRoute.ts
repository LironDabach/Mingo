import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import tasksController from "../controllers/tasksController";

const router = express.Router();

router.get("/meetings/:meetingId/tasks", authenticate, tasksController.getByMeetingId.bind(tasksController));
router.get("/meetings/:meetingId/tasks/:taskId", authenticate, tasksController.getById.bind(tasksController));
router.get("/users/:userId/tasks", authenticate, tasksController.getByUserId.bind(tasksController));

router.put("/meetings/:meetingId/tasks/:taskId", authenticate, tasksController.update.bind(tasksController));

router.post("/meetings/:meetingId/tasks", authenticate, tasksController.create.bind(tasksController));

router.delete("/meetings/:meetingId/tasks/:taskId", authenticate, tasksController.delete.bind(tasksController));

export default router;
