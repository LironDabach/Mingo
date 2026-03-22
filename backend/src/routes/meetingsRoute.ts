import express from "express";
import { authenticate } from "../middleware/authMiddleware";
import meetingsController from "../controllers/meetingsController";

const router = express.Router();

router.get("/meetings", authenticate, meetingsController.getAll.bind(meetingsController));
router.get("/meetings/:id", authenticate, meetingsController.getById.bind(meetingsController));
router.get("/meetings/:userId", authenticate, meetingsController.getByUserId.bind(meetingsController));

router.get("/meetings/:userId/upcoming", authenticate, meetingsController.getUpcomingByUserId.bind(meetingsController));
router.get("/meetings/:userId/recent", authenticate, meetingsController.getRecentByUserId.bind(meetingsController));
router.get("/meetings/:userId/last-month", authenticate, meetingsController.getLastMonthByUserId.bind(meetingsController));
router.get("/meetings/:userId/average-duration", authenticate, meetingsController.getAverageDurationByUserId.bind(meetingsController));

router.post("/meetings", authenticate, meetingsController.create.bind(meetingsController));

router.put("/meetings/:id", authenticate, meetingsController.update.bind(meetingsController));

router.delete("/meetings/:id", authenticate, meetingsController.delete.bind(meetingsController));


export default router;