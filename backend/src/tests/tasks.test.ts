import path from "path";
import dotenv from "dotenv";
import request from "supertest";
import initApp from "../index";
import meetingsModel from "../models/meetingsModel";
import tasksModel from "../models/tasksModel";
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
const createdMeetingIds: string[] = [];
const createdTaskIds: string[] = [];
let meetingWithTasksId: string;
let otherMeetingId: string;
let taskOneId: string;
let taskTwoId: string;

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

  const createdTasks = await tasksModel.create([
    {
      gitHubIssueId: 910001,
      gitHubRepoName: "mingo-backend",
      gitHubRepoOwner: userId,
    },
    {
      gitHubIssueId: 910002,
      gitHubRepoName: "mingo-client",
      gitHubRepoOwner: otherUserId,
    },
  ]);

  taskOneId = createdTasks[0]!._id.toString();
  taskTwoId = createdTasks[1]!._id.toString();
  createdTaskIds.push(taskOneId, taskTwoId);

  const seededMeetings = await meetingsModel.create([
    {
      title: "Task Planning",
      date: new Date("2026-03-20T09:00:00.000Z"),
      duration: 45,
      organizerId: userId,
      participants: [userId, otherUserId],
      transcriptId: new mongoose.Types.ObjectId(),
      tasks: [taskOneId, taskTwoId],
    },
    {
      title: "Other Meeting",
      date: new Date("2026-03-20T11:00:00.000Z"),
      duration: 30,
      organizerId: otherUserId,
      participants: [otherUserId],
      transcriptId: new mongoose.Types.ObjectId(),
      tasks: [],
    },
  ]);

  meetingWithTasksId = seededMeetings[0]!._id.toString();
  otherMeetingId = seededMeetings[1]!._id.toString();
  createdMeetingIds.push(...seededMeetings.map((meeting) => meeting._id.toString()));
}, 30000);

afterAll(async () => {
  if (createdMeetingIds.length > 0) {
    await meetingsModel.deleteMany({ _id: { $in: createdMeetingIds } });
  }

  if (createdTaskIds.length > 0) {
    await tasksModel.deleteMany({ _id: { $in: createdTaskIds } });
  }

  await mongoose.connection.close();
});

describe("Tasks API", () => {
  describe("GET /api/meetings/:meetingId/tasks", () => {
    test("get meeting tasks requires authentication", async () => {
      const response = await request(app).get(`/api/meetings/${meetingWithTasksId}/tasks`);

      expect(response.status).toBe(401);
    });

    test("gets all tasks for a meeting", async () => {
      const response = await request(app)
        .get(`/api/meetings/${meetingWithTasksId}/tasks`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);

      const returnedIds = response.body.map((task: { _id: string }) => task._id);
      expect(returnedIds).toContain(taskOneId);
      expect(returnedIds).toContain(taskTwoId);
    });

    test("returns 404 when the meeting does not exist", async () => {
      const response = await request(app)
        .get(`/api/meetings/${new mongoose.Types.ObjectId().toString()}/tasks`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Meeting not found");
    });
  });

  describe("GET /api/meetings/:meetingId/tasks/:taskId", () => {
    test("gets a task by id for a meeting", async () => {
      const response = await request(app)
        .get(`/api/meetings/${meetingWithTasksId}/tasks/${taskOneId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(taskOneId);
      expect(response.body.gitHubIssueId).toBe(910001);
      expect(response.body.gitHubRepoName).toBe("mingo-backend");
      expect(response.body.gitHubRepoOwner).toBe(userId);
    });

    test("returns 404 when the task is not part of the meeting", async () => {
      const response = await request(app)
        .get(`/api/meetings/${otherMeetingId}/tasks/${taskOneId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Task not found");
    });

    test("returns 404 when the meeting contains the task id but the task document is missing", async () => {
      const orphanTaskId = new mongoose.Types.ObjectId();
      const orphanMeeting = await meetingsModel.create({
        title: "Orphan Task Meeting",
        date: new Date("2026-03-20T13:00:00.000Z"),
        duration: 15,
        organizerId: userId,
        participants: [userId],
        transcriptId: new mongoose.Types.ObjectId(),
        tasks: [orphanTaskId],
      });

      createdMeetingIds.push(orphanMeeting._id.toString());

      const response = await request(app)
        .get(`/api/meetings/${orphanMeeting._id.toString()}/tasks/${orphanTaskId.toString()}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Task not found");
    });
  });

  describe("GET /api/users/:userId/tasks", () => {
    test("gets tasks by github repo owner", async () => {
      const response = await request(app)
        .get(`/api/users/${userId}/tasks`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(1);
      expect(response.body[0]._id).toBe(taskOneId);
      expect(response.body[0].gitHubRepoOwner).toBe(userId);
    });

    test("returns an empty list for a user with no tasks", async () => {
      const response = await request(app)
        .get(`/api/users/${new mongoose.Types.ObjectId().toString()}/tasks`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });
  });

  describe("POST /api/meetings/:meetingId/tasks", () => {
    test("create task requires authentication", async () => {
      const response = await request(app)
        .post(`/api/meetings/${otherMeetingId}/tasks`)
        .send({
          gitHubIssueId: 910003,
          gitHubRepoName: "mingo-worker",
          gitHubRepoOwner: userId,
        });

      expect(response.status).toBe(401);
    });

    test("creates a task and attaches it to the meeting", async () => {
      const response = await request(app)
        .post(`/api/meetings/${otherMeetingId}/tasks`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          gitHubIssueId: 910003,
          gitHubRepoName: "mingo-worker",
          gitHubRepoOwner: userId,
        });

      expect(response.status).toBe(201);
      expect(response.body._id).toBeDefined();
      expect(response.body.gitHubIssueId).toBe(910003);
      expect(response.body.gitHubRepoName).toBe("mingo-worker");
      expect(response.body.gitHubRepoOwner).toBe(userId);

      createdTaskIds.push(response.body._id);

      const updatedMeeting = await meetingsModel.findById(otherMeetingId);
      expect(updatedMeeting?.tasks.map((taskId) => taskId.toString())).toContain(
        response.body._id,
      );
    });

    test("returns 404 when creating a task for a missing meeting", async () => {
      const response = await request(app)
        .post(`/api/meetings/${new mongoose.Types.ObjectId().toString()}/tasks`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          gitHubIssueId: 910004,
          gitHubRepoName: "missing-meeting-task",
          gitHubRepoOwner: userId,
        });

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Meeting not found");
    });
  });

  describe("PUT /api/meetings/:meetingId/tasks/:taskId", () => {
    test("update task requires authentication", async () => {
      const response = await request(app)
        .put(`/api/meetings/${meetingWithTasksId}/tasks/${taskOneId}`)
        .send({
          gitHubRepoName: "mingo-backend-updated",
        });

      expect(response.status).toBe(401);
    });

    test("updates a task in the meeting", async () => {
      const response = await request(app)
        .put(`/api/meetings/${meetingWithTasksId}/tasks/${taskOneId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          gitHubRepoName: "mingo-backend-updated",
        });

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(taskOneId);
      expect(response.body.gitHubRepoName).toBe("mingo-backend-updated");

      const updatedTask = await tasksModel.findById(taskOneId);
      expect(updatedTask?.gitHubRepoName).toBe("mingo-backend-updated");
    });

    test("returns 404 when updating a task not attached to the meeting", async () => {
      const response = await request(app)
        .put(`/api/meetings/${otherMeetingId}/tasks/${taskOneId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          gitHubRepoName: "should-not-update",
        });

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Task not found");
    });

    test("returns 404 when the meeting contains the task id but the task document is missing", async () => {
      const orphanTaskId = new mongoose.Types.ObjectId();
      const orphanMeeting = await meetingsModel.create({
        title: "Orphan Update Meeting",
        date: new Date("2026-03-20T14:00:00.000Z"),
        duration: 20,
        organizerId: userId,
        participants: [userId],
        transcriptId: new mongoose.Types.ObjectId(),
        tasks: [orphanTaskId],
      });

      createdMeetingIds.push(orphanMeeting._id.toString());

      const response = await request(app)
        .put(`/api/meetings/${orphanMeeting._id.toString()}/tasks/${orphanTaskId.toString()}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          gitHubRepoName: "orphan-update",
        });

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Task not found");
    });
  });

  describe("DELETE /api/meetings/:meetingId/tasks/:taskId", () => {
    test("delete task requires authentication", async () => {
      const response = await request(app).delete(
        `/api/meetings/${meetingWithTasksId}/tasks/${taskTwoId}`,
      );

      expect(response.status).toBe(401);
    });

    test("deletes a task and removes it from the meeting", async () => {
      const response = await request(app)
        .delete(`/api/meetings/${meetingWithTasksId}/tasks/${taskTwoId}`)
        .set("Authorization", `Bearer ${otherAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(taskTwoId);

      const deletedTask = await tasksModel.findById(taskTwoId);
      expect(deletedTask).toBeNull();

      const updatedMeeting = await meetingsModel.findById(meetingWithTasksId);
      expect(updatedMeeting?.tasks.map((taskId) => taskId.toString())).not.toContain(taskTwoId);
    });

    test("returns 404 when deleting a task not attached to the meeting", async () => {
      const response = await request(app)
        .delete(`/api/meetings/${otherMeetingId}/tasks/${taskOneId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Task not found");
    });

    test("returns 404 when the meeting contains the task id but the task document is missing", async () => {
      const orphanTaskId = new mongoose.Types.ObjectId();
      const orphanMeeting = await meetingsModel.create({
        title: "Orphan Delete Meeting",
        date: new Date("2026-03-20T15:00:00.000Z"),
        duration: 25,
        organizerId: userId,
        participants: [userId],
        transcriptId: new mongoose.Types.ObjectId(),
        tasks: [orphanTaskId],
      });

      createdMeetingIds.push(orphanMeeting._id.toString());

      const response = await request(app)
        .delete(`/api/meetings/${orphanMeeting._id.toString()}/tasks/${orphanTaskId.toString()}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Task not found");
    });
  });
});
