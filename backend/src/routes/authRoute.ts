import express from "express";
import authController from "../controllers/authController";

const router = express.Router();

router.post("/register", authController.register);

router.post("/login", authController.login);

router.post("/logout", authController.logout);

router.post("/refresh-token", authController.refreshToken);

router.post("/google", authController.googleLogin);

router.post("/github", authController.gitHubLogin);

export default router;
