import path from "path";
import dotenv from "dotenv";
import request from "supertest";
import initApp from "../index";
import meetingsModel from "../models/meetingsModel";
import transcriptModel from "../models/transcriptModel";
import { Express } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.setTimeout(30000);

let app: Express;
let authToken: string;
let otherAuthToken: string;
let jwtSecret: string;
const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
let createdMeetingId: string;
let createdTranscriptId: string;
const createdMeetingIds: string[] = [];
const createdTranscriptIds: string[] = [];

beforeAll(async () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../../.env.development"),
  });

  jwtSecret = process.env.JWT_SECRET || "";

  if (!jwtSecret) {
    throw new Error("Missing required parameter in .env.development: JWT_SECRET");
  }

  app = await initApp();
  authToken = jwt.sign({ _id: userId }, jwtSecret, { expiresIn: "1h" });
  otherAuthToken = jwt.sign({ _id: otherUserId }, jwtSecret, { expiresIn: "1h" });
}, 30000);

afterAll(async () => {
  if (createdTranscriptIds.length > 0) {
    await transcriptModel.deleteMany({ _id: { $in: createdTranscriptIds } });
  }

  if (createdMeetingIds.length > 0) {
    await transcriptModel.deleteMany({ meetingID: { $in: createdMeetingIds } });
    await meetingsModel.deleteMany({ _id: { $in: createdMeetingIds } });
  }

  await mongoose.connection.close();
});

describe("Transcript API", () => {
  describe("POST /api/transcript/text", () => {
    test("save transcript text requires authentication", async () => {
      const response = await request(app).post("/api/transcript/text").send({
        title: "Weekly sync",
        content: "We agreed to finalize the roadmap next week.",
        date: "2026-03-20T09:00:00.000Z",
      });

      expect(response.status).toBe(401);
    });

    test("returns 400 when transcript text is missing", async () => {
      const response = await request(app)
        .post("/api/transcript/text")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          title: "Weekly sync",
          content: "   ",
          date: "2026-03-20T09:00:00.000Z",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Transcript text is required");
    });

    test("returns 400 when meeting date is invalid", async () => {
      const response = await request(app)
        .post("/api/transcript/text")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          title: "Weekly sync",
          content: "We agreed to finalize the roadmap next week.",
          date: "not-a-date",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Invalid meeting date");
    });

    test("creates a meeting and transcript from transcript text", async () => {
      const response = await request(app)
        .post("/api/transcript/text")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          title: "Weekly sync",
          content: "We agreed to finalize the roadmap next week.",
          date: "2026-03-20T09:00:00.000Z",
        });

      expect(response.status).toBe(201);
      expect(response.body.text).toBe(
        "We agreed to finalize the roadmap next week.",
      );
      expect(response.body.transcription).toBe(
        "We agreed to finalize the roadmap next week.",
      );
      expect(response.body.meeting._id).toBeDefined();
      expect(response.body.meeting.title).toBe("Weekly sync");
      expect(response.body.transcript._id).toBeDefined();
      expect(response.body.transcript.content).toBe(
        "We agreed to finalize the roadmap next week.",
      );

      createdMeetingId = response.body.meeting._id;
      createdTranscriptId = response.body.transcript._id;
      createdMeetingIds.push(createdMeetingId);
      createdTranscriptIds.push(createdTranscriptId);

      const savedMeeting = await meetingsModel.findById(createdMeetingId);
      const savedTranscript = await transcriptModel.findById(createdTranscriptId);

      expect(savedMeeting).not.toBeNull();
      expect(savedMeeting?.title).toBe("Weekly sync");
      expect(savedMeeting?.organizerId.toString()).toBe(userId);
      expect(savedMeeting?.participants.map((participant) => participant.toString())).toEqual([
        userId,
      ]);
      expect(savedMeeting?.transcriptId).toBeDefined();
      expect(savedMeeting?.transcriptId?.toString()).toBe(createdTranscriptId);

      expect(savedTranscript).not.toBeNull();
      expect(savedTranscript?.meetingID.toString()).toBe(createdMeetingId);
      expect(savedTranscript?.content).toBe(
        "We agreed to finalize the roadmap next week.",
      );
    });

    test("creates a meeting with default title and current date when omitted", async () => {
      const beforeRequest = Date.now();

      const response = await request(app)
        .post("/api/transcript/text")
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .send({
          content: "Notes without an explicit title.",
        });

      expect(response.status).toBe(201);
      expect(response.body.meeting.title).toBe("Untitled Meeting");
      expect(response.body.text).toBe("Notes without an explicit title.");

      createdMeetingIds.push(response.body.meeting._id);
      createdTranscriptIds.push(response.body.transcript._id);

      const savedTranscript = await transcriptModel.findById(response.body.transcript._id);
      expect(savedTranscript).not.toBeNull();
      expect(savedTranscript?.date.getTime()).toBeGreaterThanOrEqual(beforeRequest - 1000);
    });
  });

  describe("GET /api/transcripts/:meetingId", () => {
    test("get transcript by meeting ID requires authentication", async () => {
      const response = await request(app).get(`/api/transcripts/${createdMeetingId}`);

      expect(response.status).toBe(401);
    });

    test("gets the transcript for a specific meeting", async () => {
      const response = await request(app)
        .get(`/api/transcripts/${createdMeetingId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(createdTranscriptId);
      expect(response.body.meetingID).toBe(createdMeetingId);
      expect(response.body.content).toBe(
        "We agreed to finalize the roadmap next week.",
      );
    });

    test("returns null when the meeting has no transcript", async () => {
      const response = await request(app)
        .get(`/api/transcripts/${new mongoose.Types.ObjectId().toString()}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
    });
  });

  describe("POST /api/transcript/mp3", () => {
    test("returns 400 when no audio file is uploaded", async () => {
      const response = await request(app)
        .post("/api/transcript/mp3")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          title: "Audio without file",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe("No file uploaded");
    });
  });
});
