import path from "path";
import dotenv from "dotenv";
import express, { Express } from "express";
import request from "supertest";
import mongoose from "mongoose";
import initApp from "../index";
import BaseController from "../controllers/baseController";

jest.setTimeout(30000);

const suiteSeed = new mongoose.Types.ObjectId().toString();
const modelName = `base_controller_entity_${suiteSeed}`;

let app: Express;
let entityModel: mongoose.Model<any>;
const createdIds: string[] = [];
const userId = new mongoose.Types.ObjectId().toString();
const otherUserId = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  dotenv.config({
    path: path.resolve(__dirname, "../../../.env.development"),
  });

  await initApp();

  const entitySchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      unique: true,
    },
    userID: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    count: {
      type: Number,
      required: true,
    },
    postID: {
      type: String,
    },
  });

  entityModel = mongoose.models[modelName] || mongoose.model(modelName, entitySchema);
  const controller = new BaseController(entityModel);

  app = express();
  app.use(express.json());
  app.get("/entities", controller.getAll.bind(controller));
  app.get("/entities/:id", controller.getById.bind(controller));
  app.get("/users/:userId/entities", controller.getByUserId.bind(controller));
  app.post("/entities", controller.create.bind(controller));
  app.post("/posts/:postId/entities", controller.create.bind(controller));
  app.put("/entities/:id", controller.update.bind(controller));
  app.delete("/entities/:id", controller.delete.bind(controller));

  const seeded = await entityModel.create([
    {
      name: `base-entity-a-${suiteSeed}`,
      userID: userId,
      count: 1,
    },
    {
      name: `base-entity-b-${suiteSeed}`,
      userID: otherUserId,
      count: 2,
    },
  ]);

  createdIds.push(...seeded.map((item: any) => item._id.toString()));
}, 30000);

afterAll(async () => {
  if (createdIds.length > 0) {
    await entityModel.deleteMany({ _id: { $in: createdIds } });
  }

  await mongoose.connection.close();
});

describe("BaseController", () => {
  describe("GET /entities", () => {
    test("gets all entities through query-based lookup", async () => {
      const response = await request(app).get("/entities");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    test("filters entities by query", async () => {
      const response = await request(app)
        .get("/entities")
        .query({ name: `base-entity-a-${suiteSeed}` });

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe(`base-entity-a-${suiteSeed}`);
    });

    test("returns 500 for an invalid query cast", async () => {
      const response = await request(app)
        .get("/entities")
        .query({ count: "not-a-number" });

      expect(response.status).toBe(500);
      expect(response.text).toBe("Error: Can't retrieve entities");
    });
  });

  describe("GET /entities/:id", () => {
    test("gets an entity by id", async () => {
      const response = await request(app).get(`/entities/${createdIds[0]}`);

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(createdIds[0]);
    });

    test("returns 404 for a non-existent entity", async () => {
      const response = await request(app).get(
        `/entities/${new mongoose.Types.ObjectId().toString()}`,
      );

      expect(response.status).toBe(404);
      expect(response.text).toBe("Error: Not found");
    });

    test("returns 500 for an invalid entity id", async () => {
      const response = await request(app).get("/entities/not-a-valid-id");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Error: Can't retrieve Entity by ID");
    });
  });

  describe("GET /users/:userId/entities", () => {
    test("gets entities by user id", async () => {
      const response = await request(app).get(`/users/${userId}/entities`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].userID).toBe(userId);
    });

    test("returns 500 for an invalid user id", async () => {
      const response = await request(app).get("/users/not-a-valid-id/entities");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Error: Can't retrieve Entity by User ID");
    });
  });

  describe("POST /entities", () => {
    test("creates an entity", async () => {
      const response = await request(app).post("/entities").send({
        name: `base-created-${suiteSeed}`,
        userID: userId,
        count: 3,
      });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe(`base-created-${suiteSeed}`);
      createdIds.push(response.body._id);
    });

    test("creates an entity with a post id from params", async () => {
      const response = await request(app)
        .post("/posts/post-123/entities")
        .send({
          name: `base-created-post-${suiteSeed}`,
          userID: otherUserId,
          count: 4,
        });

      expect(response.status).toBe(201);
      expect(response.body.postID).toBe("post-123");
      createdIds.push(response.body._id);
    });

    test("returns 500 when creating a duplicate entity", async () => {
      const response = await request(app).post("/entities").send({
        name: `base-entity-a-${suiteSeed}`,
        userID: userId,
        count: 5,
      });

      expect(response.status).toBe(500);
      expect(response.text).toBe("Error: Can't create entity");
    });
  });

  describe("PUT /entities/:id", () => {
    test("updates an entity", async () => {
      const response = await request(app)
        .put(`/entities/${createdIds[0]}`)
        .send({ count: 10 });

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(10);
    });

    test("returns 500 for an invalid entity id during update", async () => {
      const response = await request(app)
        .put("/entities/not-a-valid-id")
        .send({ count: 11 });

      expect(response.status).toBe(500);
      expect(response.text).toBe("Error: Can't update entity");
    });
  });

  describe("DELETE /entities/:id", () => {
    test("returns 404 when deleting a non-existent entity", async () => {
      const response = await request(app).delete(
        `/entities/${new mongoose.Types.ObjectId().toString()}`,
      );

      expect(response.status).toBe(404);
      expect(response.text).toBe("Entity not found");
    });

    test("deletes an entity", async () => {
      const deleteTarget = await entityModel.create({
        name: `base-delete-${suiteSeed}`,
        userID: userId,
        count: 20,
      });

      createdIds.push(deleteTarget._id.toString());

      const response = await request(app).delete(
        `/entities/${deleteTarget._id.toString()}`,
      );

      expect(response.status).toBe(200);
      expect(response.body._id).toBe(deleteTarget._id.toString());
    });

    test("returns 500 for an invalid entity id during delete", async () => {
      const response = await request(app).delete("/entities/not-a-valid-id");

      expect(response.status).toBe(500);
      expect(response.text).toBe("Error: Can't delete entity");
    });
  });
});
