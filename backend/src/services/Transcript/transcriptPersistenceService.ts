import mongoose from "mongoose";
import meetingsModel from "../../models/meetingsModel";
import transcriptModel from "../../models/transcriptModel";
import { TranscriptProcessingError } from "./transcribeMP3Service";

type CreateMeetingTranscriptInput = {
  organizerId: string;
  content: string;
  title?: string | undefined;
  date?: string | Date | undefined;
};

const parseMeetingDate = (value?: string | Date) => {
  if (!value) {
    return new Date();
  }

  const parsedDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new TranscriptProcessingError("Invalid meeting date", 400);
  }

  return parsedDate;
};

const buildMeetingTitle = (title?: string) => {
  const normalizedTitle = (title || "").trim();
  return normalizedTitle || "Untitled Meeting";
};

const normalizeTranscriptContent = (content?: string) => {
  const normalizedContent = (content || "").trim();

  if (!normalizedContent) {
    throw new TranscriptProcessingError("Transcript text is required", 400);
  }

  return normalizedContent;
};

const createMeetingTranscript = async ({
  organizerId,
  content,
  title,
  date,
}: CreateMeetingTranscriptInput) => {
  const meetingDate = parseMeetingDate(date);
  const transcriptContent = normalizeTranscriptContent(content);
  const meetingId = new mongoose.Types.ObjectId();

  const transcript = await transcriptModel.create({
    meetingID: meetingId,
    date: meetingDate,
    content: transcriptContent,
  });

  try {
    const meeting = await meetingsModel.create({
      _id: meetingId,
      title: buildMeetingTitle(title),
      date: meetingDate,
      organizerId,
      participants: [organizerId],
      transcriptId: transcript._id,
    });

    return {
      meeting,
      transcript,
      transcription: transcriptContent,
      text: transcriptContent,
    };
  } catch (error) {
    await transcriptModel.findByIdAndDelete(transcript._id);
    throw error;
  }
};

export default {
  createMeetingTranscript,
};
