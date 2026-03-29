import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/usersModel";
import { AuthRequest } from "../middleware/authMiddleware";
import {
  buildUploadedFileUrl,
  deleteUploadedFileByUrl,
} from "../services/Picture/uploadPictureService";

type UploadRequest = Request & { file?: Express.Multer.File | undefined };
type AuthUploadRequest = AuthRequest & {
  file?: Express.Multer.File | undefined;
};

const userProjection = "-password -refreshTokens";
const toSafeUserObject = (user: any) => {
  const userObj = user?.toObject ? user.toObject() : { ...user };
  delete userObj.password;
  delete userObj.refreshTokens;
  return userObj;
};

const allowedFields = [
  "username",
  "fullname",
  "email",
  "password",
  "profilePicture",
  "removeProfilePicture",
  "githubId",
  "googleId",
];

const hasOnlyAllowedFields = (body: any) =>
  Object.keys(body || {}).every((key) => allowedFields.includes(key));

const sanitizeUserPayload = (body: any) => {
  const allowed = allowedFields;
  const payload: Record<string, any> = {};
  for (const key of allowed) {
    if (body[key] !== undefined) {
      payload[key] = body[key];
    }
  }
  return payload;
};

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getDuplicateFieldErrorMessage = (field?: string) => {
  switch (field) {
    case "githubId":
      return "Error: githubId already exists";
    case "googleId":
      return "Error: googleId already exists";
    case "fullname":
      return "Error: fullname already exists";
    default:
      return "Error: username or email already exists";
  }
};

class UsersController {
  async getAll(_req: Request, res: Response) {
    try {
      const users = await User.find({}, userProjection);
      return res.json(users);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve users");
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const user = await User.findById(req.params.id, userProjection);
      if (!user) {
        return res.status(404).send("Error: User not found");
      }
      return res.json(user);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve user by ID");
    }
  }

  async create(req: UploadRequest, res: Response) {
    try {
      if (!hasOnlyAllowedFields(req.body)) {
        return res.status(400).send("Error: Invalid fields in request");
      }
      const payload = sanitizeUserPayload(req.body);
      if (req.file?.filename) {
        payload.profilePicture = buildUploadedFileUrl(req, req.file.filename);
      }

      if (!payload.username || !payload.fullname || !payload.email) {
        return res
          .status(400)
          .send("Error: username, fullname and email are required");
      }
      if (!isValidEmail(payload.email)) {
        return res.status(400).send("Error: invalid email");
      }

      if (payload.password) {
        const salt = await bcrypt.genSalt(10);
        payload.password = await bcrypt.hash(payload.password, salt);
      }

      const created = await User.create(payload);
      return res.status(201).json(toSafeUserObject(created));
    } catch (err: any) {
      if (err?.code === 11000) {
        const duplicateField = Object.keys(err.keyPattern || {})[0];
        return res
          .status(400)
          .send(getDuplicateFieldErrorMessage(duplicateField));
      }
      console.error(err);
      return res.status(500).send("Error: Can't create user");
    }
  }

  async update(req: AuthUploadRequest, res: Response) {
    const userId = req.params.id;
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).send("Error: User not found");
      }
      if (!req.user || req.user._id !== userId) {
        return res.status(403).send("Forbidden: Not the user owner");
      }

      const oldProfilePicture = user.profilePicture;
      if (!hasOnlyAllowedFields(req.body)) {
        return res.status(400).send("Error: Invalid fields in request");
      }
      const payload = sanitizeUserPayload(req.body);

      // Handle remove profile picture request
      const shouldRemovePic =
        req.body.removeProfilePicture === "true" ||
        req.body.removeProfilePicture === true;
      delete payload.removeProfilePicture;

      if (payload.email && !isValidEmail(payload.email)) {
        return res.status(400).send("Error: invalid email");
      }

      if ("password" in payload && !payload.password) {
        delete payload.password;
      }

      if (req.file?.filename) {
        payload.profilePicture = buildUploadedFileUrl(req, req.file.filename);
      } else if (shouldRemovePic) {
        // Will unset profilePicture below
      }

      if (payload.password) {
        const salt = await bcrypt.genSalt(10);
        payload.password = await bcrypt.hash(payload.password, salt);
      }

      let updated;
      if (shouldRemovePic && !req.file?.filename) {
        // Remove profile picture: unset field and apply other updates
        updated = await User.findByIdAndUpdate(
          userId,
          { ...payload, $unset: { profilePicture: 1 } },
          { new: true },
        );
      } else {
        updated = await User.findByIdAndUpdate(userId, payload, {
          new: true,
        });
      }

      if (!updated) {
        return res.status(404).send("Error: User not found");
      }

      // Clean up old profile picture file
      if (
        oldProfilePicture &&
        (shouldRemovePic ||
          (req.file?.filename && oldProfilePicture !== updated.profilePicture))
      ) {
        await deleteUploadedFileByUrl(oldProfilePicture);
      }

      return res.json(toSafeUserObject(updated));
    } catch (err: any) {
      if (err?.code === 11000) {
        const duplicateField = Object.keys(err.keyPattern || {})[0];
        return res
          .status(400)
          .send(getDuplicateFieldErrorMessage(duplicateField));
      }
      console.error(err);
      return res.status(500).send("Error: Can't update user");
    }
  }

  async del(req: AuthRequest, res: Response) {
    const userId = req.params.id;
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).send("Error: User not found");
      }
      if (!req.user || req.user._id !== userId) {
        return res.status(403).send("Forbidden: Not the user owner");
      }

      const deleted = await User.findByIdAndDelete(userId);
      if (!deleted) {
        return res.status(404).send("Error: User not found");
      }

      await deleteUploadedFileByUrl(deleted.profilePicture);
      return res.status(200).json(toSafeUserObject(deleted));
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't delete user");
    }
  }
}

export default new UsersController();
