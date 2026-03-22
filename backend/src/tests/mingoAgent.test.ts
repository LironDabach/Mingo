/// <reference types="jest" />

import path from "path";
import dotenv from "dotenv";
import request from "supertest";
import initApp from "../index";
import meetingsModel from "../models/meetingsModel";
import mingoAgentModel from "../models/mingoAgentModel";
import tasksModel from "../models/tasksModel";
import { Express } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.setTimeout(30000);

let app: Express;
let authToken: string;
let otherAuthToken: string;
const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
let createdMeetingId: string;
let createdChatId: string;
let createdReplyMeetingId: string;
let createdSummaryMeetingId: string;
let createdTopicsMeetingId: string;
let llmUser: string;
let llmPass: string;
let jwtSecret: string;
const createdTaskIds: string[] = [];
const suiteIssueSeed = Date.now();

async function createTask(issueId: number, repoName: string, ownerId = userId) {
  const task = await tasksModel.create({
    gitHubIssueId: suiteIssueSeed + issueId,
    gitHubRepoName: repoName,
    gitHubRepoOwner: ownerId,
  });

  createdTaskIds.push(task._id.toString());
  return task._id;
}

beforeAll(async () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../../.env.development"),
  });

  llmUser = process.env.LLM_USER || "";
  llmPass = process.env.LLM_PASS || "";
  jwtSecret = process.env.JWT_SECRET || "";

  if (!llmUser || !llmPass || !jwtSecret) {
    throw new Error(
      "Missing required parameters in .env.development: LLM_USER, LLM_PASS, or JWT_SECRET",
    );
  }

  app = await initApp();

  await tasksModel.deleteMany({
    gitHubIssueId: {
      $gte: suiteIssueSeed + 930001,
      $lte: suiteIssueSeed + 930007,
    },
  });

  const budgetTaskId = await createTask(930001, "send-budget-by-friday");
  const replyBudgetTaskId = await createTask(930002, "send-budget-by-friday");
  const replyTimelineTaskId = await createTask(930003, "confirm-timeline");
  const summaryBudgetTaskId = await createTask(930004, "review-budget");
  const summaryUpdatesTaskId = await createTask(930005, "share-updates");
  const topicsRoadmapTaskId = await createTask(930006, "align-roadmap");
  const topicsOwnersTaskId = await createTask(930007, "track-owners");

  const createdMeeting = (await meetingsModel.create({
    title: "Budget sync",
    date: new Date("2026-03-20T09:00:00.000Z"),
    duration: 45,
    organizerId: userId,
    participants: [userId, otherUserId],
    transcriptId: new mongoose.Types.ObjectId(),
    topics: ["Send budget by Friday"],
    tasks: [budgetTaskId],
  })) as any;
  createdMeetingId = createdMeeting._id.toString();

  const createdChat = await mingoAgentModel.create({
    meetingID: createdMeeting._id,
    messages: [
      {
        sender: "user",
        content: "What was decided?",
        timestamp: new Date("2026-03-20T09:10:00.000Z"),
      },
      {
        sender: "mingo",
        content: "The budget will be sent by Friday.",
        timestamp: new Date("2026-03-20T09:11:00.000Z"),
      },
    ],
  });
  createdChatId = createdChat._id.toString();

  const createdReplyMeeting = (await meetingsModel.create({
    title: "Action items review",
    date: new Date("2026-03-20T10:00:00.000Z"),
    duration: 30,
    organizerId: userId,
    participants: [userId],
    transcriptId: new mongoose.Types.ObjectId(),
    topics: ["Send budget by Friday", "Confirm timeline"],
    tasks: [replyBudgetTaskId, replyTimelineTaskId],
  })) as any;
  createdReplyMeetingId = createdReplyMeeting._id.toString();

  const createdSummaryMeeting = (await meetingsModel.create({
    title: "Weekly planning",
    date: new Date("2026-03-20T11:00:00.000Z"),
    duration: 60,
    organizerId: userId,
    participants: [userId, otherUserId],
    transcriptId: new mongoose.Types.ObjectId(),
    topics: ["Review budget", "Share updates"],
    tasks: [summaryBudgetTaskId, summaryUpdatesTaskId],
  })) as any;
  createdSummaryMeetingId = createdSummaryMeeting._id.toString();

  const createdTopicsMeeting = (await meetingsModel.create({
    title: "Roadmap alignment",
    date: new Date("2026-03-20T12:00:00.000Z"),
    duration: 50,
    organizerId: userId,
    participants: [userId, otherUserId],
    transcriptId: new mongoose.Types.ObjectId(),
    topics: ["Align roadmap", "Track owners"],
    tasks: [topicsRoadmapTaskId, topicsOwnersTaskId],
  })) as any;
  createdTopicsMeetingId = createdTopicsMeeting._id.toString();

  authToken = jwt.sign({ _id: userId }, jwtSecret, { expiresIn: "1h" });
  otherAuthToken = jwt.sign({ _id: otherUserId }, jwtSecret, {
    expiresIn: "1h",
  });
}, 30000);

afterAll(async () => {
  const meetingIds = [
    createdMeetingId,
    createdReplyMeetingId,
    createdSummaryMeetingId,
    createdTopicsMeetingId,
  ].filter(Boolean);

  if (createdChatId) {
    await mingoAgentModel.deleteMany({ _id: createdChatId });
  }

  if (meetingIds.length > 0) {
    await mingoAgentModel.deleteMany({ meetingID: { $in: meetingIds } });
    await meetingsModel.deleteMany({ _id: { $in: meetingIds } });
  }

  if (createdTaskIds.length > 0) {
    await tasksModel.deleteMany({ _id: { $in: createdTaskIds } });
  }

  await mongoose.connection.close();
});

describe("Mingo Agent API", () => {
  // ── GET /api/meetings/:meetingId/mingoAgent ──

  test("get meeting chat requires authentication", async () => {
    const response = await request(app).get(
      `/api/meetings/${createdMeetingId}/mingoAgent`,
    );

    expect(response.status).toBe(401);
  });

  test("gets the chat for a specific meeting", async () => {
    const response = await request(app)
      .get(`/api/meetings/${createdMeetingId}/mingoAgent`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(response.body._id).toBe(createdChatId);
    expect(response.body.meetingID).toBe(createdMeetingId);
    expect(Array.isArray(response.body.messages)).toBe(true);
    expect(response.body.messages.length).toBe(2);
  });

  // ── POST /api/meetings/:meetingId/mingoAgent/generateReply ──

  test("generate reply requires authentication", async () => {
    const response = await request(app)
      .post(`/api/meetings/${createdReplyMeetingId}/mingoAgent/generateReply`)
      .send({ message: "What are the action items?" });

    expect(response.status).toBe(401);
  });

  test("generate reply returns 400 when message is missing", async () => {
    const response = await request(app)
      .post(`/api/meetings/${createdReplyMeetingId}/mingoAgent/generateReply`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe(
      "Message body parameter is required and must be a non-empty string",
    );
  });

  test("generates a reply for the meeting", async () => {
    const response = await request(app)
      .post(`/api/meetings/${createdReplyMeetingId}/mingoAgent/generateReply`)
      .set("Authorization", `Bearer ${authToken}`)
      .send({ message: "What are the action items?" });

    expect(response.status).toBe(200);
    expect(typeof response.body.reply).toBe("string");
    expect(response.body.reply.length).toBeGreaterThan(0);
    expect(response.body.reply.toLowerCase()).not.toContain("can't");

    const savedChat = await mingoAgentModel.findOne({
      meetingID: createdReplyMeetingId,
    });

    expect(savedChat).not.toBeNull();
    expect(savedChat?.messages.length).toBe(2);
    expect(savedChat?.messages[0]?.sender).toBe("user");
    expect(savedChat?.messages[0]?.content).toBe("What are the action items?");
    expect(savedChat?.messages[1]?.sender).toBe("mingo");
    expect(savedChat?.messages[1]?.content).toBe(response.body.reply);
  });

  // ── GET /api/meetings/:meetingId/mingoAgent/generateSummary ──

  test("generate summary requires authentication", async () => {
    const response = await request(app).get(
      `/api/meetings/${createdSummaryMeetingId}/mingoAgent/generateSummary`,
    );

    expect(response.status).toBe(401);
  });

  test("gets a generated summary for a meeting", async () => {
    const response = await request(app)
      .get(`/api/meetings/${createdSummaryMeetingId}/mingoAgent/generateSummary`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(typeof response.body.summary).toBe("string");
    expect(response.body.summary.length).toBeGreaterThan(0);
    expect(response.body.summary.toLowerCase()).toContain("weekly planning");
    expect(response.body.summary.toLowerCase()).toContain("review budget");
  });

  // ── GET /api/meetings/:meetingId/mingoAgent/generateTopics ──

  test("generate topics requires authentication", async () => {
    const response = await request(app).get(
      `/api/meetings/${createdTopicsMeetingId}/mingoAgent/generateTopics`,
    );

    expect(response.status).toBe(401);
  });

  test("gets generated topics for a meeting", async () => {
    const response = await request(app)
      .get(`/api/meetings/${createdTopicsMeetingId}/mingoAgent/generateTopics`)
      .set("Authorization", `Bearer ${authToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.topics)).toBe(true);
    expect(response.body.topics.length).toBeGreaterThan(0);
    response.body.topics.forEach((topic: unknown) => {
      expect(topic).toHaveProperty("title");
      expect(topic).toHaveProperty("description");
      expect(typeof (topic as { title: string }).title).toBe("string");
      expect(typeof (topic as { description: string }).description).toBe(
        "string",
      );
      expect((topic as { title: string }).title.trim().length).toBeGreaterThan(
        0,
      );
      expect(
        (topic as { description: string }).description.trim().length,
      ).toBeGreaterThan(0);
    });
  });
});
