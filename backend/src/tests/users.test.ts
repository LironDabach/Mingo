import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { Express } from "express";
import initApp from "../index";
import usersModel from "../models/usersModel";
import { uploadsDir } from "../services/Picture/uploadPictureService";

jest.setTimeout(30000);

let app: Express;
let jwtSecret: string;
let ownerId: string;
let otherUserId: string;
let deleteUserId: string;
let userWithPictureId: string;
let authToken: string;
let otherAuthToken: string;
let deleteUserAuthToken: string;
let pictureUserAuthToken: string;
const createdUserIds: string[] = [];
const createdUploadPaths: string[] = [];
const suiteSeed = new mongoose.Types.ObjectId().toString();
const imageFixturePath = path.resolve(
  __dirname,
  "../../coverage/lcov-report/favicon.png",
);

const uniqueValue = (prefix: string) => `${prefix}_${suiteSeed}`;

beforeAll(async () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../../.env.development"),
  });

  jwtSecret = process.env.JWT_SECRET || "";

  if (!jwtSecret) {
    throw new Error("Missing required parameter in .env.development: JWT_SECRET");
  }

  app = await initApp();

  const hashedPassword = await bcrypt.hash("Pass1234!", 10);

  const [ownerUser, otherUser, deleteUser, pictureUser] = await usersModel.create([
    {
      username: uniqueValue("users_owner"),
      email: `${uniqueValue("users_owner")}@example.com`,
      password: hashedPassword,
      refreshTokens: [],
    },
    {
      username: uniqueValue("users_other"),
      email: `${uniqueValue("users_other")}@example.com`,
      password: hashedPassword,
      refreshTokens: [],
    },
    {
      username: uniqueValue("users_delete"),
      email: `${uniqueValue("users_delete")}@example.com`,
      password: hashedPassword,
      refreshTokens: [],
    },
    {
      username: uniqueValue("users_picture"),
      email: `${uniqueValue("users_picture")}@example.com`,
      password: hashedPassword,
      refreshTokens: [],
    },
  ]);

  ownerId = ownerUser!._id.toString();
  otherUserId = otherUser!._id.toString();
  deleteUserId = deleteUser!._id.toString();
  userWithPictureId = pictureUser!._id.toString();

  createdUserIds.push(ownerId, otherUserId, deleteUserId, userWithPictureId);

  authToken = jwt.sign({ _id: ownerId }, jwtSecret, { expiresIn: "1h" });
  otherAuthToken = jwt.sign({ _id: otherUserId }, jwtSecret, { expiresIn: "1h" });
  deleteUserAuthToken = jwt.sign({ _id: deleteUserId }, jwtSecret, {
    expiresIn: "1h",
  });
  pictureUserAuthToken = jwt.sign({ _id: userWithPictureId }, jwtSecret, {
    expiresIn: "1h",
  });
}, 30000);

afterAll(async () => {
  createdUploadPaths.forEach((uploadPath) => {
    if (fs.existsSync(uploadPath)) {
      fs.unlinkSync(uploadPath);
    }
  });

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
        email: "created_without_auth@example.com",
      });

      expect(response.status).toBe(401);
    });

    test("returns 400 when request body contains invalid fields", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: uniqueValue("invalid_fields"),
          email: `${uniqueValue("invalid_fields")}@example.com`,
          role: "admin",
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: Invalid fields in request");
    });

    test("returns 400 when username or email is missing", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: "",
          email: "",
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: username and email are required");
    });

    test("returns 400 when email is invalid", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: uniqueValue("users_invalid_email"),
          email: "not-an-email",
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: invalid email");
    });

    test("creates a new user", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: uniqueValue("users_created"),
          email: `${uniqueValue("users_created")}@example.com`,
          password: "Pass1234!",
        });

      expect(response.status).toBe(201);
      expect(response.body._id).toBeDefined();
      expect(response.body.username).toContain("users_created_");
      expect(response.body.email).toContain("@example.com");
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("refreshTokens");

      createdUserIds.push(response.body._id);

      const savedUser = await usersModel.findById(response.body._id);
      expect(savedUser).not.toBeNull();
      expect(savedUser?.password).not.toBe("Pass1234!");
    });

    test("creates a user with a profile picture upload", async () => {
      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .field("username", uniqueValue("users_uploaded"))
        .field("email", `${uniqueValue("users_uploaded")}@example.com`)
        .attach("file", imageFixturePath);

      expect(response.status).toBe(201);
      expect(response.body.profilePicture).toContain("/api/upload/");

      createdUserIds.push(response.body._id);

      const savedUser = await usersModel.findById(response.body._id);
      expect(savedUser?.profilePicture).toBe(response.body.profilePicture);

      const fileName = response.body.profilePicture.split("/api/upload/")[1];
      const uploadPath = path.resolve(process.cwd(), uploadsDir, fileName);
      createdUploadPaths.push(uploadPath);
      expect(fs.existsSync(uploadPath)).toBe(true);
    });

    test("returns 400 for duplicate username or email", async () => {
      const ownerUser = await usersModel.findById(ownerId);

      const response = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: ownerUser!.username,
          email: `duplicate_users_${Date.now()}@example.com`,
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: username or email already exists");
    });

    test("returns 400 for duplicate githubId", async () => {
      const duplicateGithubId = uniqueValue("shared-github");

      const firstResponse = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: uniqueValue("users_github_one"),
          email: `${uniqueValue("users_github_one")}@example.com`,
          githubId: duplicateGithubId,
        });

      expect(firstResponse.status).toBe(201);
      createdUserIds.push(firstResponse.body._id);

      const secondResponse = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: uniqueValue("users_github_two"),
          email: `${uniqueValue("users_github_two")}@example.com`,
          githubId: duplicateGithubId,
        });

      expect(secondResponse.status).toBe(400);
      expect(secondResponse.text).toBe("Error: githubId already exists");
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
          username: uniqueValue("forbidden_update"),
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

    test("returns 404 when updating a non-existent user", async () => {
      const missingUserId = new mongoose.Types.ObjectId().toString();
      const missingUserToken = jwt.sign({ _id: missingUserId }, jwtSecret, {
        expiresIn: "1h",
      });

      const response = await request(app)
        .put(`/api/user/${missingUserId}`)
        .set("Authorization", `Bearer ${missingUserToken}`)
        .send({
          username: uniqueValue("users_missing"),
        });

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: User not found");
    });

    test("returns 400 when updating with an invalid email", async () => {
      const response = await request(app)
        .put(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          email: "bad-email",
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: invalid email");
    });

    test("updates the authenticated user", async () => {
      const response = await request(app)
        .put(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: uniqueValue("users_owner_updated"),
          email: `${uniqueValue("users_owner_updated")}@example.com`,
          password: "NewPass1234!",
        });

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(ownerId);
      expect(response.body.username).toContain("users_owner_updated_");
      expect(response.body.email).toContain("@example.com");
      expect(response.body).not.toHaveProperty("password");
      expect(response.body).not.toHaveProperty("refreshTokens");

      const savedUser = await usersModel.findById(ownerId);
      expect(savedUser?.email).toBe(response.body.email);
      expect(savedUser?.password).not.toBe("NewPass1234!");
      expect(savedUser?.password).toBeDefined();
      expect(
        await bcrypt.compare("NewPass1234!", savedUser?.password || ""),
      ).toBe(true);
    });

    test("updates a user profile picture and removes the previous file on replacement", async () => {
      const initialResponse = await request(app)
        .put(`/api/user/${userWithPictureId}`)
        .set("Authorization", `Bearer ${pictureUserAuthToken}`)
        .field("username", uniqueValue("users_picture_first"))
        .attach("file", imageFixturePath);

      expect(initialResponse.status).toBe(200);
      expect(initialResponse.body.profilePicture).toContain("/api/upload/");

      const firstFileName = initialResponse.body.profilePicture.split("/api/upload/")[1];
      const firstUploadPath = path.resolve(process.cwd(), uploadsDir, firstFileName);
      expect(fs.existsSync(firstUploadPath)).toBe(true);

      const replacementResponse = await request(app)
        .put(`/api/user/${userWithPictureId}`)
        .set("Authorization", `Bearer ${pictureUserAuthToken}`)
        .field("username", uniqueValue("users_picture_second"))
        .attach("file", imageFixturePath);

      expect(replacementResponse.status).toBe(200);
      expect(replacementResponse.body.profilePicture).toContain("/api/upload/");
      expect(replacementResponse.body.profilePicture).not.toBe(
        initialResponse.body.profilePicture,
      );
      expect(fs.existsSync(firstUploadPath)).toBe(false);

      const secondFileName =
        replacementResponse.body.profilePicture.split("/api/upload/")[1];
      const secondUploadPath = path.resolve(process.cwd(), uploadsDir, secondFileName);
      createdUploadPaths.push(secondUploadPath);
      expect(fs.existsSync(secondUploadPath)).toBe(true);
    });

    test("removes the existing profile picture when requested", async () => {
      const currentUser = await usersModel.findById(userWithPictureId);
      const currentProfilePicture = currentUser?.profilePicture || "";
      const currentFileName =
        currentProfilePicture.split("/api/upload/")[1] || "";
      const currentUploadPath = path.resolve(process.cwd(), uploadsDir, currentFileName);

      const response = await request(app)
        .put(`/api/user/${userWithPictureId}`)
        .set("Authorization", `Bearer ${pictureUserAuthToken}`)
        .send({
          removeProfilePicture: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.profilePicture).toBeUndefined();
      expect(fs.existsSync(currentUploadPath)).toBe(false);

      const updatedUser = await usersModel.findById(userWithPictureId);
      expect(updatedUser?.profilePicture).toBeUndefined();
    });

    test("ignores an empty password on update", async () => {
      const userBeforeUpdate = await usersModel.findById(ownerId);

      const response = await request(app)
        .put(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          password: "",
        });

      expect(response.status).toBe(200);

      const userAfterUpdate = await usersModel.findById(ownerId);
      expect(userAfterUpdate?.password).toBe(userBeforeUpdate?.password);
    });

    test("returns 400 when updating to a duplicate githubId", async () => {
      const duplicateGithubId = uniqueValue("update-github");

      const seedResponse = await request(app)
        .post("/api/user")
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          username: uniqueValue("users_dup_github_seed"),
          email: `${uniqueValue("users_dup_github_seed")}@example.com`,
          githubId: duplicateGithubId,
        });

      expect(seedResponse.status).toBe(201);
      createdUserIds.push(seedResponse.body._id);

      const response = await request(app)
        .put(`/api/user/${ownerId}`)
        .set("Authorization", `Bearer ${authToken}`)
        .send({
          githubId: duplicateGithubId,
        });

      expect(response.status).toBe(400);
      expect(response.text).toBe("Error: githubId already exists");
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

    test("returns 404 when deleting a non-existent user", async () => {
      const missingUserId = new mongoose.Types.ObjectId().toString();
      const missingUserToken = jwt.sign({ _id: missingUserId }, jwtSecret, {
        expiresIn: "1h",
      });

      const response = await request(app)
        .delete(`/api/user/${missingUserId}`)
        .set("Authorization", `Bearer ${missingUserToken}`);

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: User not found");
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
