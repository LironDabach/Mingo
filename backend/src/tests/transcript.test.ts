/// <reference types="jest" />

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
let jwtSecret: string;
const userId = new mongoose.Types.ObjectId().toString();
let createdMeetingId: string;
let createdTranscriptId: string;

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
}, 30000);

afterAll(async () => {
  if (createdTranscriptId) {
    await transcriptModel.deleteMany({ _id: createdTranscriptId });
  }

  if (createdMeetingId) {
    await transcriptModel.deleteMany({ meetingID: createdMeetingId });
    await meetingsModel.deleteMany({ _id: createdMeetingId });
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

      const savedMeeting = await meetingsModel.findById(createdMeetingId);
      const savedTranscript = await transcriptModel.findById(createdTranscriptId);

      expect(savedMeeting).not.toBeNull();
      expect(savedMeeting?.title).toBe("Weekly sync");
      expect(savedMeeting?.organizerId.toString()).toBe(userId);
      expect(savedMeeting?.participants.map((participant) => participant.toString())).toEqual([
        userId,
      ]);
      expect(savedMeeting?.transcriptId.toString()).toBe(createdTranscriptId);

      expect(savedTranscript).not.toBeNull();
      expect(savedTranscript?.meetingID.toString()).toBe(createdMeetingId);
      expect(savedTranscript?.content).toBe(
        "We agreed to finalize the roadmap next week.",
      );
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
  });
});
