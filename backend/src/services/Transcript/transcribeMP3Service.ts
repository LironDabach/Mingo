import fs from "fs";
import { promisify } from "util";
import { execFile } from "child_process";
import multer from "multer";
import path from "path";
import FormData from "form-data";
import fetch from "node-fetch";
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

  try {
    // Create form data with file stream
    const form = new FormData();
    const fileStream = fs.createReadStream(filePath);
    
    form.append("file", fileStream, fileName);
    form.append("model", "whisper-1");
    form.append("language", "en");

    console.log(`Sending ${fileName} to OpenAI for transcription...`);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...form.getHeaders(),
      },
      body: form as any,
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
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

    console.log(`Transcription successful: ${text.substring(0, 100)}...`);
    return text;
  } catch (error) {
    if (error instanceof TranscriptProcessingError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : "Failed to transcribe audio";
    console.error("Transcription error:", errorMessage);
    console.error("Full error:", error);
    
    throw new TranscriptProcessingError(errorMessage, 500);
  }
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
      source: 'upload',
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
