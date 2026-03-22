import express from "express";
import usersController from "../controllers/usersController";
import { authenticate } from "../middleware/authMiddleware";
import { uploadSingleImage } from "../services/Picture/uploadPictureService";

const router = express.Router();

router.get("/", authenticate, usersController.getAll.bind(usersController));

router.get("/:id", authenticate, usersController.getById.bind(usersController));

router.post(
  "/",
  authenticate,
  uploadSingleImage,
  usersController.create.bind(usersController),
);

router.put(
  "/:id",
  authenticate,
  uploadSingleImage,
  usersController.update.bind(usersController),
);

router.delete("/:id", authenticate, usersController.del.bind(usersController));

export default router;
