import multer from "multer";
import fs from "fs";
import path from "path";
import { NextFunction, Request, Response } from "express";

export const uploadsDir = "public/uploads";

const uploadsAbsDir = path.resolve(process.cwd(), uploadsDir);
fs.mkdirSync(uploadsAbsDir, { recursive: true });

const sanitizeBaseName = (name: string): string => {
  const sanitized = name
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "file";
};

const sanitizeUsername = (username: string): string =>
  username.replace(/[^a-zA-Z0-9_-]/g, "__");

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadsAbsDir);
  },
  filename: function (req, file, cb) {
    const lastDotIndex = file.originalname.lastIndexOf(".");
    const hasExtension =
      lastDotIndex > 0 && lastDotIndex < file.originalname.length - 1;
    const rawBaseName = hasExtension
      ? file.originalname.slice(0, lastDotIndex)
      : file.originalname;
    const ext = hasExtension ? file.originalname.slice(lastDotIndex + 1) : "";

    const sanitizedOriginalName = sanitizeBaseName(rawBaseName);
    const username =
      typeof req.body?.username === "string" ? req.body.username : "";
    const sanitizedUsername = sanitizeUsername(username);

    const now = new Date();
    const formattedDate =
      String(now.getDate()).padStart(2, "0") +
      "_" +
      String(now.getMonth() + 1).padStart(2, "0") +
      "_" +
      now.getFullYear();

    const nameParts = [];
    if (sanitizedUsername) {
      nameParts.push(sanitizedUsername);
    }
    nameParts.push(sanitizedOriginalName, formattedDate);

    const fileName = nameParts.join("-") + (ext ? `.${ext}` : "");
    cb(null, fileName);
  },
});

const upload = multer({ storage });

const uploadImage = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
      return;
    }
    cb(new Error("Unsupported file type"));
  },
});

export const uploadSingle = upload.single("file");

export const uploadSingleImage = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  uploadImage.single("file")(req, res, (err: any) => {
    if (err) {
      return res.status(400).send({ message: err.message || "Invalid file" });
    }
    next();
  });
};

export const buildUploadedFileUrl = (req: Request, fileName: string): string =>
  `${req.protocol}://${req.get("host")}/api/upload/${fileName}`;

const extractUploadFileNameFromUrl = (url: string): string | null => {
  try {
    const parsed = new URL(url, "http://localhost");
    const prefix = "/api/upload/";
    if (!parsed.pathname.startsWith(prefix)) {
      return null;
    }
    return path.basename(
      decodeURIComponent(parsed.pathname.slice(prefix.length)),
    );
  } catch (_err) {
    return null;
  }
};

export const deleteUploadedFileByUrl = async (
  url?: string | null,
): Promise<void> => {
  if (!url) return;
  const fileName = extractUploadFileNameFromUrl(url);
  if (!fileName) return;

  const absolutePath = path.resolve(uploadsAbsDir, fileName);
  if (!absolutePath.startsWith(uploadsAbsDir)) return;

  try {
    await fs.promises.unlink(absolutePath);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      throw err;
    }
  }
};
