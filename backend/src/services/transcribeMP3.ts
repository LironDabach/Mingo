import { NextFunction, Request, Response } from "express";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

import multer from "multer";
import path from "path";

export const transcribeAudio = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "OpenAI API key not configured" });
    }

    const filePath = req.file.path;
    const fileStream = fs.createReadStream(filePath);

    const formData = new FormData();
    formData.append("file", fileStream);
    formData.append("model", "whisper-1");
    formData.append("language", "en");

    const response = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error("OpenAI API error:", errorData);
      return res.status(response.status).json({
        error: errorData.error?.message || "Transcription failed",
      });
    }

    const transcriptionData = await response.json();

    fs.unlink(filePath, (err: any) => {
      if (err) console.error("Error deleting file:", err);
    });

    res.json({
      transcription: transcriptionData.text,
      text: transcriptionData.text,
    });
  } catch (error: any) {
    console.error("Transcription error:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
    });
  }
};
