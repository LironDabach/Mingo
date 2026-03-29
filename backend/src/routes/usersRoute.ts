import express from "express";
import usersController from "../controllers/usersController";
import { authenticate } from "../middleware/authMiddleware";
import { uploadSingleImage } from "../services/Picture/uploadPictureService";

const router = express.Router();

/**
 * @openapi
 * /api/user:
 *   get:
 *     tags: [Users]
 *     summary: Get all users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       '401':
 *         description: Unauthorized
 */
router.get("/", authenticate, usersController.getAll.bind(usersController));

/**
 * @openapi
 * /api/user/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get a user by id
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
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: User not found
 */
router.get("/:id", authenticate, usersController.getById.bind(usersController));

/**
 * @openapi
 * /api/user:
 *   post:
 *     tags: [Users]
 *     summary: Create a user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/UserWriteRequest'
 *     responses:
 *       '201':
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '400':
 *         description: Invalid payload
 *       '401':
 *         description: Unauthorized
 */
router.post(
  "/",
  authenticate,
  uploadSingleImage,
  usersController.create.bind(usersController),
);

/**
 * @openapi
 * /api/user/{id}:
 *   put:
 *     tags: [Users]
 *     summary: Update a user
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
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/UserWriteRequest'
 *     responses:
 *       '200':
 *         description: User updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '400':
 *         description: Invalid payload
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: User not found
 */
router.put(
  "/:id",
  authenticate,
  uploadSingleImage,
  usersController.update.bind(usersController),
);

/**
 * @openapi
 * /api/user/{id}:
 *   delete:
 *     tags: [Users]
 *     summary: Delete a user
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
 *         description: User deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       '401':
 *         description: Unauthorized
 *       '403':
 *         description: Forbidden
 *       '404':
 *         description: User not found
 */
router.delete("/:id", authenticate, usersController.del.bind(usersController));

export default router;
