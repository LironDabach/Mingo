import mingoAgentModel from "../../models/mingoAgentModel";
import meetingsModel from "../../models/meetingsModel";
import llmService, { LlmService } from "./llmService";

export class MingoAgentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "MingoAgentError";
    this.statusCode = statusCode;
  }
}

type MessageSender = "user" | "mingo";

type ChatMessage = {
  sender: MessageSender;
  content: string;
  timestamp: Date;
};

type AgentReply = {
  chat: any;
  reply: string;
  messages: ChatMessage[];
};

class MingoAgentService {
  private static readonly MAX_USER_MESSAGE_LENGTH = 4000;
  private static readonly MAX_ASSISTANT_MESSAGE_LENGTH = 6000;
  private static readonly MAX_PROMPT_HISTORY_MESSAGES = 20;
  private static readonly MAX_PROMPT_HISTORY_CHARS = 8000;

  private meetings = meetingsModel;
  private chats = mingoAgentModel;
  private llm: LlmService;

  constructor(llm = llmService) {
    this.llm = llm;
  }

  private normalizeInput(message: string) {
    return (message || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MingoAgentService.MAX_USER_MESSAGE_LENGTH);
  }

  private normalizeAssistantResponse(message: string) {
    return (message || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MingoAgentService.MAX_ASSISTANT_MESSAGE_LENGTH);
  }

  private sanitizeContextValue(value: unknown): unknown {
    if (value === undefined || value === null) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeContextValue(item));
    }

    if (typeof value === "object") {
      const sanitizedObject: Record<string, unknown> = {};

      Object.entries(value as Record<string, unknown>).forEach(
        ([key, entryValue]) => {
          if (typeof entryValue === "function") {
            return;
          }

          sanitizedObject[key] = this.sanitizeContextValue(entryValue);
        },
      );

      return sanitizedObject;
    }

    return value;
  }

  private formatContextAsJson(value: unknown) {
    return JSON.stringify(this.sanitizeContextValue(value), null, 2);
  }

  private summarizeContextValue(value: unknown): string {
    if (value === undefined || value === null) {
      return "Not available";
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        return "None";
      }

      return value
        .map((item) => {
          if (item === undefined || item === null) {
            return "null";
          }

          if (item instanceof Date) {
            return item.toISOString();
          }

          if (
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"
          ) {
            return String(item);
          }

          return JSON.stringify(this.sanitizeContextValue(item));
        })
        .join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(this.sanitizeContextValue(value));
    }

    return String(value);
  }

  private serializeHistory(messages: ChatMessage[]) {
    if (!messages.length) {
      return "No previous messages.";
    }

    const selectedMessages = messages.slice(
      -MingoAgentService.MAX_PROMPT_HISTORY_MESSAGES,
    );
    const serializedMessages: string[] = [];
    let totalChars = 0;

    for (let index = selectedMessages.length - 1; index >= 0; index -= 1) {
      const message = selectedMessages[index];
      if (!message) {
        continue;
      }
      const serializedMessage = `[${message.timestamp.toISOString()}] ${message.sender}: ${message.content}`;

      if (
        serializedMessages.length > 0 &&
        totalChars + serializedMessage.length >
          MingoAgentService.MAX_PROMPT_HISTORY_CHARS
      ) {
        break;
      }

      serializedMessages.unshift(serializedMessage);
      totalChars += serializedMessage.length;
    }

    return serializedMessages.join("\n");
  }

  private buildPrompt(
    meeting: any,
    history: ChatMessage[],
    userMessage: string,
  ) {
    const meetingDate =
      meeting?.date instanceof Date
        ? meeting.date.toISOString()
        : meeting?.date
          ? new Date(meeting.date).toISOString()
          : "Not available";

    return [
      "You are Mingo, an AI assistant for meeting management.",
      "You are Mingo, the AI assistant of a meeting-management system.",
      "Answer the user's question using the meeting context below.",
      "Keep the answer clear, practical, and concise.",
      "Your scope is the meeting domain only: meetings, agendas, summaries, action items, decisions, blockers, follow-ups, participants, scheduling implications, tasks, and meeting-related questions.",
      "Be generic within that domain so you can handle many different meeting-oriented requests without needing custom code paths.",
      "Use only the provided meeting data and chat history as facts.",
      "If information is missing, say that clearly.",
      "If you offer a suggestion or inference, label it clearly as a suggestion or inference.",
      "If the user asks for something outside the meeting-management domain, briefly say that the request is outside Mingo's scope and steer the answer back to meeting-related help.",
      "Do not invent transcript details, participants, decisions, or tasks that are not present in the context.",
      "Prefer concise, useful answers. Use bullets only when they improve clarity.",
      "",
      "Meeting context summary:",
      `Title: ${this.summarizeContextValue(meeting?.title)}`,
      `Date: ${meetingDate}`,
      `Duration: ${this.summarizeContextValue(meeting?.duration)}`,
      `Organizer ID: ${this.summarizeContextValue(meeting?.organizerID)}`,
      `Participants: ${this.summarizeContextValue(meeting?.participants)}`,
      `Transcript ID: ${this.summarizeContextValue(meeting?.transcriptID)}`,
      `Topics: ${this.summarizeContextValue(meeting?.topics)}`,
      `Tasks: ${this.summarizeContextValue(meeting?.tasks)}`,
      "",
      "Meeting context JSON:",
      this.formatContextAsJson(meeting),
      "",
      "Recent chat history:",
      this.serializeHistory(history),
      "",
      `User message: ${userMessage}`,
      "",
      "Answer as Mingo:",
    ].join("\n");
  }

  private async getMeetingOrThrow(meetingId: string) {
    const meeting = await this.meetings.findById(meetingId).lean();

    if (!meeting) {
      throw new MingoAgentError("Meeting not found", 404);
    }

    return meeting;
  }

  private async getOrCreateChat(meetingId: string) {
    const existingMeeting = await this.meetings.findById(meetingId);
    if (!existingMeeting) {
      throw new MingoAgentError("Meeting not found", 404);
    }

    let chat = null;

    if (existingMeeting.mingoAgentId) {
      chat = await this.chats.findById(existingMeeting.mingoAgentId);
    }

    if (!chat) {
      chat = await this.chats.findOne({ meetingID: meetingId });
    }

    if (!chat) {
      chat = await this.chats.create({
        meetingID: meetingId,
        messages: [],
      });
    }

    const chatId = chat._id;
    if (
      !existingMeeting.mingoAgentId ||
      String(existingMeeting.mingoAgentId) !== String(chatId)
    ) {
      (existingMeeting as any).mingoAgentID = chatId;
      await existingMeeting.save();
    }

    return chat;
  }

  async getMeetingChat(meetingId: string) {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const chat = await this.getOrCreateChat(meetingId);
    return chat;
  }

  async generateReply(meetingId: string, message: string): Promise<AgentReply> {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const normalizedMessage = this.normalizeInput(message);
    if (!normalizedMessage) {
      throw new MingoAgentError("Message is required", 400);
    }

    const [meeting, chat] = await Promise.all([
      this.getMeetingOrThrow(meetingId),
      this.getOrCreateChat(meetingId),
    ]);

    const existingMessages = Array.isArray(chat.messages)
      ? (chat.messages as ChatMessage[])
      : [];
    const recentHistory = existingMessages.slice(-10).map((entry) => ({
      sender: entry.sender,
      content: entry.content,
      timestamp: new Date(entry.timestamp),
    }));

    const userMessage: ChatMessage = {
      sender: "user",
      content: normalizedMessage,
      timestamp: new Date(),
    };

    const prompt = this.buildPrompt(meeting, recentHistory, normalizedMessage);

    let reply = "";
    try {
      const response = await this.llm.generate({
        prompt,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 400,
        },
      });

      reply = this.normalizeAssistantResponse(response.response);
    } catch (error) {
      if (error instanceof MingoAgentError) {
        throw error;
      }

      throw new MingoAgentError("Failed to generate Mingo response", 503);
    }

    if (!reply) {
      throw new MingoAgentError("The LLM returned an empty response", 502);
    }

    const assistantMessage: ChatMessage = {
      sender: "mingo",
      content: reply,
      timestamp: new Date(),
    };

    const updatedMessages = [
      ...existingMessages,
      userMessage,
      assistantMessage,
    ];
    (chat as any).messages = updatedMessages;
    await chat.save();

    return {
      chat,
      reply,
      messages: updatedMessages,
    };
  }

  async generateSummary(meetingId: string): Promise<{ summary: string }> {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const meeting = await this.getMeetingOrThrow(meetingId);

    const summaryPrompt = [
      "You are Mingo, an AI assistant for meeting management.",
      "Generate a concise summary of the key points, decisions, action items, and topics from the meeting based on the following context.",
      "Use only the provided meeting data as facts. Do not invent details that are not present in the context.",
      "",
      "Meeting context summary:",
      `Title: ${this.summarizeContextValue(meeting?.title)}`,
      `Date: ${
        meeting?.date instanceof Date
          ? meeting.date.toISOString()
          : meeting?.date
            ? new Date(meeting.date).toISOString()
            : "Not available"
      }`,
      `Duration: ${this.summarizeContextValue(meeting?.duration)}`,
      `Organizer ID: ${this.summarizeContextValue(meeting?.organizerId)}`,
      `Participants: ${this.summarizeContextValue(meeting?.participants)}`,
      `Transcript ID: ${this.summarizeContextValue(meeting?.transcriptId)}`,
      `Topics: ${this.summarizeContextValue(meeting?.topics)}`,
      `Tasks: ${this.summarizeContextValue(meeting?.tasks)}`,
      "",
      "Meeting context JSON:",
      this.formatContextAsJson(meeting),
      "",
      "Summary as Mingo:",
    ].join("\n");

    let summary = "";
    try {
      const response = await this.llm.generate({
        prompt: summaryPrompt,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 400,
        },
      });

      summary = this.normalizeAssistantResponse(response.response);
    } catch (error) {
      if (error instanceof MingoAgentError) {
        throw error;
      }

      throw new MingoAgentError("Failed to generate Mingo summary", 503);
    }

    if (!summary) {
      throw new MingoAgentError("The LLM returned an empty summary", 502);
    }

    return { summary };
  }

  async generateTopics(meetingId: string): Promise<{ topics: string[] }> {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const meeting = await this.getMeetingOrThrow(meetingId);

    const topicsPrompt = [
      "You are Mingo, an AI assistant for meeting management.",
      "Based on the following meeting context, generate a list of concise topics that were discussed in the meeting.",
      "Use only the provided meeting data as facts. Do not invent details that are not present in the context.",
      "",
      "Meeting context summary:",
      `Title: ${this.summarizeContextValue(meeting?.title)}`,
      `Date: ${
        meeting?.date instanceof Date
          ? meeting.date.toISOString()
          : meeting?.date
            ? new Date(meeting.date).toISOString()
            : "Not available"
      }`,
      `Duration: ${this.summarizeContextValue(meeting?.duration)}`,
      `Organizer ID: ${this.summarizeContextValue(meeting?.organizerId)}`,
      `Participants: ${this.summarizeContextValue(meeting?.participants)}`,
      `Transcript ID: ${this.summarizeContextValue(meeting?.transcriptId)}`,
      `Topics: ${this.summarizeContextValue(meeting?.topics)}`,
      `Tasks: ${this.summarizeContextValue(meeting?.tasks)}`,
      "",
      "Meeting context JSON:",
      this.formatContextAsJson(meeting),
      "",
      "Topics as Mingo (return as a JSON array of strings):",
    ].join("\n");

    let topicsResponse = "";
    try {
      const response = await this.llm.generate({
        prompt: topicsPrompt,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 400,
        },
      });

      topicsResponse = this.normalizeAssistantResponse(response.response);
    } catch (error) {
      if (error instanceof MingoAgentError) {
        throw error;
      }

      throw new MingoAgentError("Failed to generate Mingo topics", 503);
    }

    if (!topicsResponse) {
      throw new MingoAgentError(
        "The LLM returned an empty topics response",
        502,
      );
    }

    let topics: string[] = [];
    try {
      const parsed = JSON.parse(topicsResponse);
      if (
        Array.isArray(parsed) &&
        parsed.every((item) => typeof item === "string")
      ) {
        topics = parsed;
      } else {
        throw new Error("Parsed topics is not an array of strings");
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new MingoAgentError(
        "Failed to parse topics response from LLM: " + message,
        502,
      );
    }

    return { topics };
  }
}

export default new MingoAgentService();
export { MingoAgentService };
