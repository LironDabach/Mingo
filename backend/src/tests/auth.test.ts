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

var mockVerifyIdToken = jest.fn();

jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: (...args: any[]) => mockVerifyIdToken(...args),
  })),
}));

jest.setTimeout(30000);

let app: Express;
let jwtSecret: string;
let existingUserId: string;
let existingRefreshToken = "";
let githubUserId: string;
let existingUserAuthToken: string;
const createdUserIds: string[] = [];

beforeAll(async () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../../.env.development"),
  });

  jwtSecret = process.env.JWT_SECRET || "";

  if (!jwtSecret) {
    throw new Error("Missing required parameter in .env.development: JWT_SECRET");
  }

  process.env.GOOGLE_CLIENT_ID =
    process.env.GOOGLE_CLIENT_ID?.trim() || "test-google-client";

  app = await initApp();

  const suffix = Date.now();
  const hashedPassword = await bcrypt.hash("Pass1234!", 10);
  const seededExistingUserId = new mongoose.Types.ObjectId().toString();
  const seededRefreshToken = jwt.sign(
    { _id: seededExistingUserId, rand: 123 },
    jwtSecret,
    { expiresIn: "1h" },
  );

  const [existingUser, githubUser] = await usersModel.create([
    {
      _id: seededExistingUserId,
      username: `auth_existing_${suffix}`,
      fullname: `Auth Existing ${suffix}`,
      email: `auth_existing_${suffix}@example.com`,
      password: hashedPassword,
      refreshTokens: [seededRefreshToken],
    },
    {
      username: `auth_github_${suffix}`,
      fullname: `Auth Github ${suffix}`,
      email: `auth_github_${suffix}@example.com`,
      githubId: `github-${suffix}`,
      refreshTokens: [],
    },
  ]);

  existingUserId = existingUser!._id.toString();
  existingRefreshToken = seededRefreshToken;
  githubUserId = githubUser!._id.toString();
  existingUserAuthToken = jwt.sign({ _id: existingUserId }, jwtSecret, {
    expiresIn: "1h",
  });
  createdUserIds.push(existingUserId, githubUserId);
}, 30000);

beforeEach(() => {
  mockVerifyIdToken.mockReset();
});

afterAll(async () => {
  if (createdUserIds.length > 0) {
    await usersModel.deleteMany({ _id: { $in: createdUserIds } });
  }

  await mongoose.connection.close();
});

describe("Auth API", () => {
  describe("POST /api/auth/register", () => {
    test("returns 400 when required fields are missing", async () => {
      const response = await request(app).post("/api/auth/register").send({
        username: "onlyusername",
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "Username, email and password are required",
      );
    });

    test("returns 400 when username format is invalid", async () => {
      const response = await request(app).post("/api/auth/register").send({
        username: "invalid name",
        email: "invalid-name@example.com",
        password: "Pass1234!",
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(
        "Username can only contain English letters, numbers, dots, underscores, and hyphens",
      );
    });

    test("registers a new user", async () => {
      const response = await request(app).post("/api/auth/register").send({
        username: `registered_${Date.now()}`,
        fullname: `Registered User ${Date.now()}`,
        email: `registered_${Date.now()}@example.com`,
        password: "Pass1234!",
      });

      expect(response.status).toBe(201);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user._id).toBeDefined();
      expect(response.body.user.username).toContain("registered_");
      expect(response.body.user.fullname).toContain("Registered User");
      expect(response.body.user.email).toContain("@example.com");
      expect(response.body.user).not.toHaveProperty("password");

      createdUserIds.push(response.body.user._id);

      const savedUser = await usersModel.findById(response.body.user._id);
      expect(savedUser).not.toBeNull();
      expect(savedUser?.email).toBe(response.body.user.email);
      expect(savedUser?.fullname).toBe(response.body.user.fullname);
      expect(savedUser?.password).not.toBe("Pass1234!");
      expect(savedUser?.refreshTokens).toContain(response.body.refreshToken);
    });

    test("returns 400 when email already exists", async () => {
      const existingUser = await usersModel.findById(existingUserId);

      const response = await request(app).post("/api/auth/register").send({
        username: `new_name_${Date.now()}`,
        email: existingUser!.email,
        password: "Pass1234!",
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Email already exists");
    });

    test("returns 400 when username already exists", async () => {
      const existingUser = await usersModel.findById(existingUserId);

      const response = await request(app).post("/api/auth/register").send({
        username: existingUser!.username,
        email: `duplicate_username_${Date.now()}@example.com`,
        password: "Pass1234!",
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Username already exists");
    });
  });

  describe("POST /api/auth/login", () => {
    test("returns 400 when required fields are missing", async () => {
      const response = await request(app).post("/api/auth/login").send({
        username: "missing-password",
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Username and password are required");
    });

    test("logs in an existing user", async () => {
      const existingUser = await usersModel.findById(existingUserId);

      const response = await request(app).post("/api/auth/login").send({
        username: existingUser!.username,
        password: "Pass1234!",
      });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user._id).toBe(existingUserId);
      expect(response.body.user.username).toBe(existingUser!.username);
      expect(response.body.user.fullname).toBe(existingUser!.fullname);

      const savedUser = await usersModel.findById(existingUserId);
      expect(savedUser?.refreshTokens).toContain(response.body.refreshToken);
    });

    test("returns 401 for invalid credentials", async () => {
      const existingUser = await usersModel.findById(existingUserId);

      const response = await request(app).post("/api/auth/login").send({
        username: existingUser!.username,
        password: "wrong-password",
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid username or password");
    });

    test("returns 401 when password login is attempted for a github user", async () => {
      const githubUser = await usersModel.findById(githubUserId);

      const response = await request(app).post("/api/auth/login").send({
        username: githubUser!.username,
        password: "Pass1234!",
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Please use Google to sign in");
    });
  });

  describe("POST /api/auth/logout", () => {
    test("returns 400 when refresh token is missing", async () => {
      const response = await request(app).post("/api/auth/logout").send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Refresh token is required");
    });

    test("logs out an existing user and removes the refresh token", async () => {
      const response = await request(app).post("/api/auth/logout").send({
        refreshToken: existingRefreshToken,
      });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe("Logged out successfully");

      const savedUser = await usersModel.findById(existingUserId);
      expect(savedUser?.refreshTokens).not.toContain(existingRefreshToken);
    });

    test("returns 401 for a refresh token tied to a deleted user", async () => {
      const deletedUserId = new mongoose.Types.ObjectId().toString();
      const deletedUserRefreshToken = jwt.sign(
        { _id: deletedUserId, rand: 321 },
        jwtSecret,
        { expiresIn: "1h" },
      );

      const response = await request(app).post("/api/auth/logout").send({
        refreshToken: deletedUserRefreshToken,
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid refresh token");
    });
  });

  describe("POST /api/auth/refresh-token", () => {
    test("returns 400 when refresh token is missing", async () => {
      const response = await request(app).post("/api/auth/refresh-token").send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Refresh token is required");
    });

    test("returns 401 for an invalid refresh token", async () => {
      const response = await request(app).post("/api/auth/refresh-token").send({
        refreshToken: "not-a-valid-token",
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid refresh token");
    });

    test("refreshes tokens for a valid stored refresh token", async () => {
      const user = await usersModel.findById(existingUserId);
      const refreshToken = jwt.sign(
        { _id: existingUserId, rand: 999 },
        jwtSecret,
        { expiresIn: "1h" },
      );

      user!.refreshTokens.push(refreshToken);
      await user!.save();

      const response = await request(app).post("/api/auth/refresh-token").send({
        refreshToken,
      });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.refreshToken).not.toBe(refreshToken);

      const savedUser = await usersModel.findById(existingUserId);
      expect(savedUser?.refreshTokens).not.toContain(refreshToken);
      expect(savedUser?.refreshTokens).toContain(response.body.refreshToken);
    });

    test("returns 401 and clears stored tokens for a stolen refresh token", async () => {
      const user = await usersModel.findById(existingUserId);
      const stolenToken = jwt.sign(
        { _id: existingUserId, rand: 111 },
        jwtSecret,
        { expiresIn: "1h" },
      );

      user!.refreshTokens = ["keep-this-token"];
      await user!.save();

      const response = await request(app).post("/api/auth/refresh-token").send({
        refreshToken: stolenToken,
      });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe("Invalid refresh token");

      const savedUser = await usersModel.findById(existingUserId);
      expect(savedUser?.refreshTokens).toEqual([]);
    });
  });

  describe("POST /api/auth/github", () => {
    test("returns 400 when github authorization code is missing", async () => {
      const response = await request(app).post("/api/auth/github").send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("GitHub authorization code is required");
    });
  });

  describe("POST /api/auth/google", () => {
    test("returns 400 when google credential is missing", async () => {
      const response = await request(app).post("/api/auth/google").send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe("Google credential is required");
    });

    test("links a google account to an existing user by email", async () => {
      const existingUser = await usersModel.findById(existingUserId);
      const googleSub = `google-sub-${Date.now()}`;

      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: googleSub,
          email: existingUser!.email,
          name: existingUser!.fullname,
          picture: "https://example.com/google-avatar.png",
        }),
      });

      const response = await request(app).post("/api/auth/google").send({
        credential: "valid-google-credential",
      });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeDefined();
      expect(response.body.refreshToken).toBeDefined();
      expect(response.body.user._id).toBe(existingUserId);
      expect(response.body.user.email).toBe(existingUser!.email);

      const savedUser = await usersModel.findById(existingUserId);
      expect(savedUser?.googleId).toBe(googleSub);
      expect(savedUser?.refreshTokens).toContain(response.body.refreshToken);
    });

    test("links google to the signed-in user", async () => {
      const googleSub = `google-link-${Date.now()}`;
      const googleEmail = `different_google_${Date.now()}@example.com`;

      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          sub: googleSub,
          email: googleEmail,
          name: "Auth Existing Linked Google",
          picture: "https://example.com/google-linked-avatar.png",
        }),
      });

      const response = await request(app)
        .post("/api/auth/google")
        .set("Authorization", `Bearer ${existingUserAuthToken}`)
        .send({
          credential: "valid-google-link-credential",
        });

      expect(response.status).toBe(200);
      expect(response.body.user._id).toBe(existingUserId);

      const savedUser = await usersModel.findById(existingUserId);
      expect(savedUser?.googleId).toBe(googleSub);
      expect(savedUser?.email).toBe(googleEmail);
    });
  });
});
