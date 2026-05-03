import fs from "fs";
import { promisify } from "util";
import { execFile } from "child_process";
import FormData from "form-data";
import fetch from "node-fetch";
import multer from "multer";
import path from "path";
import transcriptPersistenceService from "./transcriptPersistenceService";

const execFileAsync = promisify(execFile);

export class TranscriptProcessingError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "TranscriptProcessingError";
    this.statusCode = statusCode;
  }
}

type TranscribeAudioInput = {
  file: Express.Multer.File;
  organizerId: string;
  title?: string;
  date?: string | Date;
  gitHubRepoName?: string;
  attendeeEmails?: string[];
};

const upload = multer({
  dest: path.join(process.cwd(), "tmp", "uploads"),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const isMp3Mime =
      file.mimetype === "audio/mpeg" || file.mimetype === "audio/mp3";
    const isMp3File = path.extname(file.originalname).toLowerCase() === ".mp3";

    if (!isMp3Mime && !isMp3File) {
      return cb(new TranscriptProcessingError("Only MP3 files are allowed", 400));
    }

    cb(null, true);
  },
});

const buildMeetingTitle = (title: string | undefined, fileName: string) => {
  const normalizedTitle = (title || "").trim();
  if (normalizedTitle) {
    return normalizedTitle;
  }

  return path.parse(fileName).name.trim() || "Untitled Meeting";
};

const deleteFileIfExists = async (filePath: string) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.error("Error deleting uploaded file:", error);
    }
  }
};

const getAudioDurationInSeconds = async (filePath: string) => {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    const duration = Number.parseFloat(stdout.trim());
    return Number.isFinite(duration) ? Math.round(duration) : undefined;
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.error("Failed to extract MP3 duration:", error);
    }

    return undefined;
  }
};

const requestTranscription = async (filePath: string, fileName: string) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new TranscriptProcessingError("OpenAI API key not configured", 500);
  }

  const fileStream = fs.createReadStream(filePath);
  const formData = new FormData();
  formData.append("file", fileStream, fileName);
  formData.append("model", "whisper-1");
  formData.append("language", "en");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new TranscriptProcessingError(
      errorData.error?.message || "Transcription failed",
      response.status,
    );
  }

  const transcriptionData = (await response.json()) as { text?: string };
  const text = (transcriptionData.text || "").trim();

  if (!text) {
    throw new TranscriptProcessingError("OpenAI returned an empty transcription", 502);
  }

  return text;
};

const transcribeAudio = async ({
  file,
  organizerId,
  title,
  date,
  gitHubRepoName,
  attendeeEmails,
}: TranscribeAudioInput) => {
  const filePath = file.path;

  try {
    const [transcriptionText, duration] = await Promise.all([
      requestTranscription(filePath, file.originalname),
      getAudioDurationInSeconds(filePath),
    ]);
    const result = await transcriptPersistenceService.createMeetingTranscript({
      organizerId,
      content: transcriptionText,
      title: buildMeetingTitle(title, file.originalname),
      date,
      gitHubRepoName,
      attendeeEmails,
    });

    if (typeof duration === "number") {
      await result.meeting.updateOne({ duration });
      result.meeting.duration = duration;
    }

    return result;
  } finally {
    await deleteFileIfExists(filePath);
  }
};

export default {
  upload,
  transcribeAudio,
};
