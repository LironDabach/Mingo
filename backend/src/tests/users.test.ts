/// <reference types="jest" />

import path from "path";
import dotenv from "dotenv";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Express } from "express";
import initApp from "../index";
import usersModel from "../models/usersModel";

jest.setTimeout(30000);

let app: Express;
let jwtSecret: string;
let ownerId: string;
let otherUserId: string;
let deleteUserId: string;
let authToken: string;
let otherAuthToken: string;
let deleteUserAuthToken: string;
const createdUserIds: string[] = [];

beforeAll(async () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../../.env.development"),
  });

  jwtSecret = process.env.JWT_SECRET || "";

  if (!jwtSecret) {
    throw new Error("Missing required parameter in .env.development: JWT_SECRET");
  }

  app = await initApp();

  const suffix = Date.now();
  const hashedPassword = await bcrypt.hash("Pass1234!", 10);

  const [ownerUser, otherUser, deleteUser] = await usersModel.create([
    {
      username: `users_owner_${suffix}`,
      fullname: `Users Owner ${suffix}`,
      email: `users_owner_${suffix}@example.com`,
      password: hashedPassword,
      refreshTokens: [],
    },
    {
      username: `users_other_${suffix}`,
      fullname: `Users Other ${suffix}`,
      email: `users_other_${suffix}@example.com`,
      password: hashedPassword,
      refreshTokens: [],
    },
    {
      username: `users_delete_${suffix}`,
      fullname: `Users Delete ${suffix}`,
      email: `users_delete_${suffix}@example.com`,
      password: hashedPassword,
      refreshTokens: [],
    },
  ]);

  ownerId = ownerUser!._id.toString();
  otherUserId = otherUser!._id.toString();
  deleteUserId = deleteUser!._id.toString();

  createdUserIds.push(ownerId, otherUserId, deleteUserId);

  authToken = jwt.sign({ _id: ownerId }, jwtSecret, { expiresIn: "1h" });
  otherAuthToken = jwt.sign({ _id: otherUserId }, jwtSecret, { expiresIn: "1h" });
  deleteUserAuthToken = jwt.sign({ _id: deleteUserId }, jwtSecret, {
    expiresIn: "1h",
  });
}, 30000);

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await usersModel.deleteMany({ _id: { $in: createdUserIds } });
  }

  await mongoose.connection.close();
});

describe("Users API", () => {
  describe("GET /api/user", () => {
    test("get all users requires authentication", async () => {
      const response = await request(app).get("/api/user");

      expect(response.status).toBe(401);
    });

    test("gets all users without password fields", async () => {
      const response = await request(app)
        .get("/api/user")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const owner = response.body.find((user: { _id: string }) => user._id === ownerId);
      const other = response.body.find(
        (user: { _id: string }) => user._id === otherUserId,
      );

      expect(owner).toBeDefined();
      expect(other).toBeDefined();
      expect(owner).not.toHaveProperty("password");
      expect(owner).not.toHaveProperty("refreshTokens");
    });
  });

  describe("GET /api/user/:id", () => {
    test("get user by id requires authentication", async () => {
      const response = await request(app).get(`/api/user/${ownerId}`);

      expect(response.status).toBe(401);
    });

    test("gets a user by id", async () => {
      const response = await request(app)
        .get(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(ownerId);
      expect(response.body.username).toContain("users_owner_");
      expect(response.body.email).toContain("@example.com");
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("refreshTokens");
    });

    test("returns 404 for a non-existent user", async () => {
      const response = await request(app)
        .get(`/api/user/${new mongoose.Types.ObjectId().toString()}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: User not found");
    });
  });

  describe("POST /api/user", () => {
    test("create user requires authentication", async () => {
      const response = await request(app).post("/api/user").send({
        username: "created_without_auth",
        fullname: "Created Without Auth",
        email: "created_without_auth@example.com",
      });

      expect(response.status).toBe(401);
    });

    test("returns 400 when request body contains invalid fields", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: `invalid_fields_${Date.now()}`,
          fullname: `Invalid Fields ${Date.now()}`,
          email: `invalid_fields_${Date.now()}@example.com`,
          role: "admin",
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: Invalid fields in request");
    });

    test("creates a new user", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: `users_created_${Date.now()}`,
          fullname: `Users Created ${Date.now()}`,
          email: `users_created_${Date.now()}@example.com`,
          password: "Pass1234!",
        });

      expect(response.status).toBe(201);
      expect(response.body._id).toBeDefined();
      expect(response.body.username).toContain("users_created_");
      expect(response.body.fullname).toContain("Users Created");
      expect(response.body.email).toContain("@example.com");
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("refreshTokens");

      createdUserIds.push(response.body._id);

      const savedUser = await usersModel.findById(response.body._id);
      expect(savedUser).not.toBeNull();
      expect(savedUser?.password).not.toBe("Pass1234!");
    });

    test("returns 400 for duplicate username or email", async () => {
      const ownerUser = await usersModel.findById(ownerId);

      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: ownerUser!.username,
          fullname: `Duplicate Users ${Date.now()}`,
          email: `duplicate_users_${Date.now()}@example.com`,
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: username or email already exists");
    });
  });

  describe("PUT /api/user/:id", () => {
    test("update user requires authentication", async () => {
      const response = await request(app).put(`/api/user/${ownerId}`).send({
        username: "unauthorized_update",
      });

      expect(response.status).toBe(401);
    });

    test("returns 403 when trying to update another user", async () => {
      const response = await request(app)
        .put(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${otherAuthToken}`)
        .send({
          username: `forbidden_update_${Date.now()}`,
        });

      expect(response.status).toBe(403);
      expect(response.text).toBe("Forbidden: Not the user owner");
    });

    test("returns 400 when updating with invalid fields", async () => {
      const response = await request(app)
        .put(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          role: "admin",
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: Invalid fields in request");
    });

    test("updates the authenticated user", async () => {
      const response = await request(app)
        .put(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: `users_owner_updated_${Date.now()}`,
          fullname: `Users Owner Updated ${Date.now()}`,
          email: `users_owner_updated_${Date.now()}@example.com`,
          password: "NewPass1234!",
        });

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(ownerId);
      expect(response.body.username).toContain("users_owner_updated_");
      expect(response.body.fullname).toContain("Users Owner Updated");
      expect(response.body.email).toContain("@example.com");
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("refreshTokens");

      const savedUser = await usersModel.findById(ownerId);
      expect(savedUser?.email).toBe(response.body.email);
      expect(savedUser?.fullname).toBe(response.body.fullname);
      expect(savedUser?.password).not.toBe("NewPass1234!");
      expect(savedUser?.password).toBeDefined();
      expect(
        await bcrypt.compare("NewPass1234!", savedUser?.password || ""),
      ).toBe(true);
    });

    test("returns 400 when fullname is missing on create", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: `users_missing_fullname_${Date.now()}`,
          email: `users_missing_fullname_${Date.now()}@example.com`,
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe(
        "Error: username, fullname and email are required",
      );
    });
  });

  describe("DELETE /api/user/:id", () => {
    test("delete user requires authentication", async () => {
      const response = await request(app).delete(`/api/user/${deleteUserId}`);

      expect(response.status).toBe(401);
    });

    test("returns 403 when trying to delete another user", async () => {
      const response = await request(app)
        .delete(`/api/user/${deleteUserId}`)
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(403);
      expect(response.text).toBe("Forbidden: Not the user owner");
    });

    test("deletes the authenticated user", async () => {
      const response = await request(app)
        .delete(`/api/user/${deleteUserId}`)
        .set("Authorization", `Bearer ${deleteUserAuthToken}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(deleteUserId);
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("refreshTokens");

      const deletedUser = await usersModel.findById(deleteUserId);
      expect(deletedUser).toBeNull();
    });
  });
});
