/// <reference types="jest" />

import path from "path";
import dotenv from "dotenv";
import request from "supertest";
import initApp from "../index";
import meetingsModel from "../models/meetingsModel";
import { Express } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

jest.setTimeout(30000);

let app: Express;
let authToken: string;
let jwtSecret: string;
const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();
const createdMeetingIds: string[] = [];
let upcomingMeetingId: string;
let oldMeetingId: string;
let noDurationMeetingId: string;

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

  const seededMeetings = await meetingsModel.create([
    {
      title: "Planning Sync",
      date: new Date("2026-03-20T09:00:00.000Z"),
      duration: 45,
      organizerId: userId,
      participants: [userId, otherUserId],
      transcriptId: new mongoose.Types.ObjectId(),
      topics: [],
      tasks: ["Review milestones"],
    },
    {
      title: "Retrospective",
      date: new Date("2026-03-20T11:00:00.000Z"),
      duration: 30,
      organizerId: otherUserId,
      participants: [otherUserId],
      transcriptId: new mongoose.Types.ObjectId(),
      topics: [],
      tasks: ["Capture action items"],
    },
    {
      title: "Upcoming Review",
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      duration: 90,
      organizerId: otherUserId,
      participants: [userId, otherUserId],
      transcriptId: new mongoose.Types.ObjectId(),
      topics: [],
      tasks: ["Prepare demo"],
    },
    {
      title: "Quarterly Kickoff",
      date: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
      duration: 120,
      organizerId: userId,
      participants: [userId],
      transcriptId: new mongoose.Types.ObjectId(),
      topics: [],
      tasks: ["Share quarterly goals"],
    },
    {
      title: "No Duration Meeting",
      date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      organizerId: userId,
      participants: [userId],
      transcriptId: new mongoose.Types.ObjectId(),
      topics: [],
      tasks: ["No timing recorded"],
    },
  ]);

  createdMeetingIds.push(...seededMeetings.map((meeting) => meeting._id.toString()));
  upcomingMeetingId = seededMeetings[2]!._id.toString();
  oldMeetingId = seededMeetings[3]!._id.toString();
  noDurationMeetingId = seededMeetings[4]!._id.toString();
}, 30000);

afterAll(async () => {
  if (createdMeetingIds.length > 0) {
    await meetingsModel.deleteMany({ _id: { $in: createdMeetingIds } });
  }

  await mongoose.connection.close();
});

describe("Meetings API", () => {
  describe("GET /api/meetings/meetings", () => {
    test("get all meetings requires authentication", async () => {
      const response = await request(app).get("/api/meetings/meetings");

      expect(response.status).toBe(401);
    });

    test("gets all meetings", async () => {
      const response = await request(app)
        .get("/api/meetings/meetings")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      const returnedIds = response.body.map((meeting: { _id: string }) => meeting._id);
      expect(returnedIds).toContain(createdMeetingIds[0]);
      expect(returnedIds).toContain(createdMeetingIds[1]);
    });

    test("filters meetings by query parameters", async () => {
      const response = await request(app)
        .get("/api/meetings/meetings")
        .query({ title: "Planning Sync" })
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0]._id).toBe(createdMeetingIds[0]);
      expect(response.body[0].title).toBe("Planning Sync");
    });
  });

  describe("GET /api/meetings/meetings/:id", () => {
    test("get meeting by id requires authentication", async () => {
      const response = await request(app).get(
        `/api/meetings/meetings/${createdMeetingIds[0]}`,
      );

      expect(response.status).toBe(401);
    });

    test("gets a meeting by id", async () => {
      const response = await request(app)
        .get(`/api/meetings/meetings/${createdMeetingIds[0]}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(createdMeetingIds[0]);
      expect(response.body.title).toBe("Planning Sync");
      expect(response.body.organizerId).toBe(userId);
      expect(response.body.duration).toBe(45);
    });

    test("returns 404 for a non-existent meeting", async () => {
      const response = await request(app)
        .get(`/api/meetings/meetings/${new mongoose.Types.ObjectId().toString()}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Not found");
    });
  });

  describe("GET /api/meetings/meetings/:userId", () => {
    test("gets meetings where the user is organizer or participant", async () => {
      const response = await request(app)
        .get(`/api/meetings/meetings/${userId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const returnedIds = response.body.map((meeting: { _id: string }) => meeting._id);
      expect(returnedIds).toContain(createdMeetingIds[0]);
      expect(returnedIds).toContain(upcomingMeetingId);
      expect(returnedIds).toContain(oldMeetingId);
      expect(returnedIds).toContain(noDurationMeetingId);
      expect(returnedIds).not.toContain(createdMeetingIds[1]);
    });
  });

  describe("GET /api/meetings/meetings/:userId/upcoming", () => {
    test("gets upcoming meetings for a user", async () => {
      const response = await request(app)
        .get(`/api/meetings/meetings/${userId}/upcoming`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.map((meeting: { _id: string }) => meeting._id)).toEqual([
        upcomingMeetingId,
      ]);
    });
  });

  describe("GET /api/meetings/meetings/:userId/recent", () => {
    test("gets past meetings for a user ordered from newest to oldest", async () => {
      const response = await request(app)
        .get(`/api/meetings/meetings/${userId}/recent`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const returnedIds = response.body.map((meeting: { _id: string }) => meeting._id);
      expect(returnedIds).toContain(createdMeetingIds[0]);
      expect(returnedIds).toContain(oldMeetingId);
      expect(returnedIds).toContain(noDurationMeetingId);
      expect(returnedIds).not.toContain(upcomingMeetingId);
      expect(new Date(response.body[0].date).getTime()).toBeGreaterThanOrEqual(
        new Date(response.body[1].date).getTime(),
      );
    });
  });

  describe("GET /api/meetings/meetings/:userId/last-month", () => {
    test("gets only meetings from the last month for a user", async () => {
      const response = await request(app)
        .get(`/api/meetings/meetings/${userId}/last-month`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const returnedIds = response.body.map((meeting: { _id: string }) => meeting._id);
      expect(returnedIds).toContain(createdMeetingIds[0]);
      expect(returnedIds).toContain(noDurationMeetingId);
      expect(returnedIds).not.toContain(oldMeetingId);
      expect(returnedIds).not.toContain(upcomingMeetingId);
    });
  });

  describe("GET /api/meetings/meetings/:userId/average-duration", () => {
    test("gets the average duration for meetings tied to a user", async () => {
      const response = await request(app)
        .get(`/api/meetings/meetings/${userId}/average-duration`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.averageDuration).toBeCloseTo((45 + 90 + 120) / 3);
    });
  });

  describe("POST /api/meetings/meetings", () => {
    test("create meeting requires authentication", async () => {
      const response = await request(app).post("/api/meetings/meetings").send({
        title: "Design Review",
        date: "2026-03-21T09:00:00.000Z",
        duration: 60,
        organizerId: userId,
        participants: [userId],
        transcriptId: new mongoose.Types.ObjectId().toString(),
        topics: [],
        tasks: ["Share decisions"],
      });

      expect(response.status).toBe(401);
    });

    test("creates a meeting", async () => {
      const response = await request(app)
        .post("/api/meetings/meetings")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          title: "Design Review",
          date: "2026-03-21T09:00:00.000Z",
          duration: 60,
          organizerId: userId,
          participants: [userId, otherUserId],
          transcriptId: new mongoose.Types.ObjectId().toString(),
          topics: [],
          tasks: ["Share decisions"],
        });

      expect(response.status).toBe(201);
      expect(response.body._id).toBeDefined();
      expect(response.body.title).toBe("Design Review");
      expect(response.body.organizerId).toBe(userId);
      expect(response.body.participants).toEqual([userId, otherUserId]);
      expect(response.body.tasks).toEqual(["Share decisions"]);

      createdMeetingIds.push(response.body._id);

      const savedMeeting = await meetingsModel.findById(response.body._id);
      expect(savedMeeting).not.toBeNull();
      expect(savedMeeting?.title).toBe("Design Review");
    });
  });

  describe("PUT /api/meetings/meetings/:id", () => {
    test("update meeting requires authentication", async () => {
      const response = await request(app)
        .put(`/api/meetings/meetings/${createdMeetingIds[0]}`)
        .send({
          title: "Updated Planning Sync",
          duration: 50,
        });

      expect(response.status).toBe(401);
    });

    test("updates a meeting", async () => {
      const response = await request(app)
        .put(`/api/meetings/meetings/${createdMeetingIds[0]}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          title: "Updated Planning Sync",
          duration: 50,
          tasks: ["Review milestones", "Confirm owners"],
        });

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(createdMeetingIds[0]);
      expect(response.body.title).toBe("Updated Planning Sync");
      expect(response.body.duration).toBe(50);
      expect(response.body.tasks).toEqual([
        "Review milestones",
        "Confirm owners",
      ]);

      const updatedMeeting = await meetingsModel.findById(createdMeetingIds[0]);
      expect(updatedMeeting?.title).toBe("Updated Planning Sync");
      expect(updatedMeeting?.duration).toBe(50);
    });
  });

  describe("DELETE /api/meetings/meetings/:id", () => {
    test("delete meeting requires authentication", async () => {
      const response = await request(app).delete(
        `/api/meetings/meetings/${createdMeetingIds[1]}`,
      );

      expect(response.status).toBe(401);
    });

    test("deletes a meeting", async () => {
      const meetingToDelete = await meetingsModel.create({
        title: "Delete Me",
        date: new Date("2026-03-21T13:00:00.000Z"),
        duration: 20,
        organizerId: userId,
        participants: [userId],
        transcriptId: new mongoose.Types.ObjectId(),
        topics: [],
        tasks: ["Remove this record"],
      });

      const meetingToDeleteId = meetingToDelete._id.toString();

      const response = await request(app)
        .delete(`/api/meetings/meetings/${meetingToDeleteId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(meetingToDeleteId);
      expect(response.body.title).toBe("Delete Me");

      const deletedMeeting = await meetingsModel.findById(meetingToDeleteId);
      expect(deletedMeeting).toBeNull();
    });
  });
});
