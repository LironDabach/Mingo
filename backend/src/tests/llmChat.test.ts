/// <reference types="jest" />

import { Response } from "express";
import mingoAgentController from "../controllers/mingoAgentController";
import mingoAgentModel from "../models/mingoAgentModel";
import mingoAgentService from "../services/LLM/mingoAgentService";
import { AuthRequest } from "../middleware/authMiddleware";

jest.mock("../models/mingoAgentModel", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

jest.mock("../services/LLM/mingoAgentService", () => ({
  __esModule: true,
  default: {
    generateReply: jest.fn(),
    generateSummary: jest.fn(),
    generateTopics: jest.fn(),
  },
}));

type MockResponse = Response & {
  status: jest.Mock;
  json: jest.Mock;
  send: jest.Mock;
};

const mockedmingoAgentModel = mingoAgentModel as unknown as {
  findOne: jest.Mock;
};

const mockedMingoAgentService = mingoAgentService as unknown as {
  generateReply: jest.Mock;
  generateSummary: jest.Mock;
  generateTopics: jest.Mock;
};

const createMockResponse = () => {
  const res = {} as MockResponse;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

const createAuthRequest = (overrides: Partial<AuthRequest> = {}) =>
  ({
    params: {},
    body: {},
    headers: {},
    ...overrides,
  }) as AuthRequest;

describe("LLM Chat controller", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe("getByMeetingId", () => {
    it("returns 400 when meetingId is missing", async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      await mingoAgentController.getByMeetingId(req, res);

      expect(mockedmingoAgentModel.findOne).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Meeting ID is required",
      });
    });

    it("returns the meeting chat when one exists", async () => {
      const chat = {
        _id: "chat-1",
        meetingID: "meeting-1",
        messages: [{ sender: "user", content: "What was decided?" }],
      };
      mockedmingoAgentModel.findOne.mockResolvedValue(chat);
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
      });
      const res = createMockResponse();

      await mingoAgentController.getByMeetingId(req, res);

      expect(mockedmingoAgentModel.findOne).toHaveBeenCalledWith({
        meetingID: "meeting-1",
      });
      expect(res.json).toHaveBeenCalledWith(chat);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("returns 500 when the chat lookup fails", async () => {
      mockedmingoAgentModel.findOne.mockRejectedValue(new Error("db failure"));
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
      });
      const res = createMockResponse();

      await mingoAgentController.getByMeetingId(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        "Error: Can't retrieve chats for the meeting",
      );
    });
  });

  describe("generateReply", () => {
    it("returns 400 when meetingId is missing", async () => {
      const req = createAuthRequest({
        body: { message: "Summarize the action items" },
      });
      const res = createMockResponse();

      await mingoAgentController.generateReply(req, res);

      expect(mockedMingoAgentService.generateReply).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Meeting ID is required",
      });
    });

    it("returns 400 when message is missing", async () => {
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
        body: {},
      });
      const res = createMockResponse();

      await mingoAgentController.generateReply(req, res);

      expect(mockedMingoAgentService.generateReply).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error:
          "Message body parameter is required and must be a non-empty string",
      });
    });

    it("returns 400 when message is blank", async () => {
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
        body: { message: "   " },
      });
      const res = createMockResponse();

      await mingoAgentController.generateReply(req, res);

      expect(mockedMingoAgentService.generateReply).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error:
          "Message body parameter is required and must be a non-empty string",
      });
    });

    it("returns the generated reply", async () => {
      mockedMingoAgentService.generateReply.mockResolvedValue({
        reply: "The main action item is to send the budget by Friday.",
      });
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
        body: { message: "What are the action items?" },
      });
      const res = createMockResponse();

      await mingoAgentController.generateReply(req, res);

      expect(mockedMingoAgentService.generateReply).toHaveBeenCalledWith(
        "meeting-1",
        "What are the action items?",
      );
      expect(res.json).toHaveBeenCalledWith({
        reply: "The main action item is to send the budget by Friday.",
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it("returns 500 when the agent service throws", async () => {
      mockedMingoAgentService.generateReply.mockRejectedValue(
        new Error("llm failure"),
      );
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
        body: { message: "Give me the blockers" },
      });
      const res = createMockResponse();

      await mingoAgentController.generateReply(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        "Error: Can't generate reply for the meeting",
      );
    });
  });

  describe("generateSummary", () => {
    it("returns 400 when meetingId is missing", async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      await mingoAgentController.generateSummary(req, res);

      expect(mockedMingoAgentService.generateSummary).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Meeting ID is required",
      });
    });

    it("returns the generated summary", async () => {
      mockedMingoAgentService.generateSummary.mockResolvedValue({
        summary:
          "The meeting covered budget status, assigned follow-ups, and agreed on Friday delivery.",
      });
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
      });
      const res = createMockResponse();

      await mingoAgentController.generateSummary(req, res);

      expect(mockedMingoAgentService.generateSummary).toHaveBeenCalledWith(
        "meeting-1",
      );
      expect(res.json).toHaveBeenCalledWith({
        summary:
          "The meeting covered budget status, assigned follow-ups, and agreed on Friday delivery.",
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it("returns 500 when the summary generation fails", async () => {
      mockedMingoAgentService.generateSummary.mockRejectedValue(
        new Error("summary failure"),
      );
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
      });
      const res = createMockResponse();

      await mingoAgentController.generateSummary(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        "Error: Can't generate summary for the meeting",
      );
    });
  });

  describe("generateTopics", () => {
    it("returns 400 when meetingId is missing", async () => {
      const req = createAuthRequest();
      const res = createMockResponse();

      await mingoAgentController.generateTopics(req, res);

      expect(mockedMingoAgentService.generateTopics).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: "Meeting ID is required",
      });
    });

    it("returns the generated topics", async () => {
      mockedMingoAgentService.generateTopics.mockResolvedValue({
        topics: ["Budget", "Timeline", "Action items"],
      });
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
      });
      const res = createMockResponse();

      await mingoAgentController.generateTopics(req, res);

      expect(mockedMingoAgentService.generateTopics).toHaveBeenCalledWith(
        "meeting-1",
      );
      expect(res.json).toHaveBeenCalledWith({
        topics: ["Budget", "Timeline", "Action items"],
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it("returns 500 when the topics generation fails", async () => {
      mockedMingoAgentService.generateTopics.mockRejectedValue(
        new Error("topics failure"),
      );
      const req = createAuthRequest({
        params: { meetingId: "meeting-1" },
      });
      const res = createMockResponse();

      await mingoAgentController.generateTopics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.send).toHaveBeenCalledWith(
        "Error: Can't generate topics for the meeting",
      );
    });
  });
});
