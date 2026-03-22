import { Request, Response } from "express";

const shouldSkipErrorLogging = (err: any) =>
  err?.name === "CastError" || err?.code === 11000;

class BaseController {
  model: any;

  constructor(model: any) {
    this.model = model;
  }

  async getAll(req: Request, res: Response) {
    try {
      if (req.query) {
        const filterData = await this.model.find(req.query);
        return res.json(filterData);
      } else {
        const data = await this.model.find();
        res.json(data);
      }
    } catch (err) {
      if (!shouldSkipErrorLogging(err)) {
        console.error(err);
      }
      res.status(500).send("Error: Can't retrieve entities");
    }
  }

  async getById(req: Request, res: Response) {
    const id = req.params.id;
    console.log("Get by ID: " + id);
    try {
      const data = await this.model.findById(id);
      if (!data) {
        return res.status(404).send("Error: Not found");
      } else {
        res.json(data);
      }
    } catch (err) {
      if (!shouldSkipErrorLogging(err)) {
        console.error(err);
      }
      res.status(500).send("Error: Can't retrieve Entity by ID");
    }
  }

  async getByUserId(req: Request, res: Response) {
    const userId = req.params.userId;
    console.log("Get by User ID: " + userId);
    try {
      const data = await this.model.find({ userID: userId });
      if (!data) {
        return res.status(404).send("Error: Not found");
      } else {
        res.json(data);
      }
    } catch (err) {
      if (!shouldSkipErrorLogging(err)) {
        console.error(err);
      }
      res.status(500).send("Error: Can't retrieve Entity by User ID");
    }
  }

  // Override create to handle postID for comments and likes
  async create(req: Request, res: Response) {
    const postId = req.params.postId;
    if (postId) {
      req.body.postID = postId; // Associate with the post ID from URL
    }
    const postData = req.body;
    console.log(postData);
    try {
      const data = await this.model.create(postData);
      res.status(201).json(data);
    } catch (err) {
      if (!shouldSkipErrorLogging(err)) {
        console.error(err);
      }
      res.status(500).send("Error: Can't create entity");
    }
  }

  async delete(req: Request, res: Response) {
    const id = req.params.id;
    try {
      const deletedData = await this.model.findByIdAndDelete(id);
      if (!deletedData) {
        res.status(404).send("Entity not found");
        return;
      }
      res.status(200).json(deletedData);
      console.log("delete data -----" + deletedData);
    } catch (err) {
      if (!shouldSkipErrorLogging(err)) {
        console.error(err);
      }
      res.status(500).send("Error: Can't delete entity");
    }
  }

  async update(req: Request, res: Response) {
    const id = req.params.id;
    const updatedData = req.body;
    try {
      const data = await this.model.findByIdAndUpdate(id, updatedData, {
        new: true,
      });
      res.json(data);
    } catch (err) {
      if (!shouldSkipErrorLogging(err)) {
        console.error(err);
      }
      res.status(500).send("Error: Can't update entity");
    }
  }
}

export default BaseController;
