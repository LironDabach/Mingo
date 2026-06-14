import mongoose from "mongoose";
import meetingsModel from "../../models/meetingsModel";
import transcriptModel from "../../models/transcriptModel";
import usersModel from "../../models/usersModel";
import { TranscriptProcessingError } from "./transcribeMP3Service";

type CreateMeetingTranscriptInput = {
  organizerId: string;
  content: string;
  title?: string | undefined;
  date?: string | Date | undefined;
  gitHubRepoName?: string | undefined;
  attendeeEmails?: string[] | undefined;
  source?: 'upload' | 'planned' | 'live';
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
  gitHubRepoName,
  attendeeEmails = [],
  source = 'upload',
}: CreateMeetingTranscriptInput) => {
  const meetingDate = parseMeetingDate(date);
  const transcriptContent = normalizeTranscriptContent(content);
  const meetingId = new mongoose.Types.ObjectId();
  const normalizedEmails = attendeeEmails
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const registeredUsers = normalizedEmails.length
    ? await usersModel.find({ email: { $in: normalizedEmails } }, "_id email")
    : [];
  const registeredEmails = new Set(
    registeredUsers
      .map((user) => user.email?.toLowerCase?.())
      .filter((email): email is string => Boolean(email)),
  );
  const inviteEmails = normalizedEmails.filter((email) => !registeredEmails.has(email));
  const participantIds = [
    organizerId,
    ...registeredUsers.map((user) => user._id.toString()),
  ].filter((value, index, array) => array.indexOf(value) === index);

  const transcript = await transcriptModel.create({
    meetingID: meetingId,
    date: meetingDate,
    content: transcriptContent,
  });

  try {
    const meetingPayload: Record<string, unknown> = {
      _id: meetingId,
      title: buildMeetingTitle(title),
      date: meetingDate,
      status: "completed",
      organizerId,
      participants: participantIds,
      transcriptId: transcript._id,
      inviteEmails,
      endedAt: new Date(),
      source,
    };
    if (gitHubRepoName?.trim()) {
      meetingPayload.gitHubRepoName = gitHubRepoName.trim();
    }

    const meeting = await meetingsModel.create(meetingPayload);

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
