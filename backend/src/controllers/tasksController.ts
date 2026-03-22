import { Response } from "express";
import mongoose from "mongoose";
import tasksModel from "../models/tasksModel";
import meetingsModel from "../models/meetingsModel";
import { AuthRequest } from "../middleware/authMiddleware";
import baseController from "./baseController";

class tasksController extends baseController {
  constructor() {
    super(tasksModel);
  }

  async getByMeetingId(req: AuthRequest, res: Response) {
    const { meetingId } = req.params;

    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    try {
      const meeting = await meetingsModel.findById(meetingId).populate("tasks");

      if (!meeting) {
        return res.status(404).send("Error: Meeting not found");
      }

      return res.json(meeting.tasks ?? []);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve tasks for the meeting");
    }
  }

  async getById(req: AuthRequest, res: Response) {
    const { meetingId, taskId } = req.params;

    if (!meetingId || !taskId) {
      return res.status(400).json({ error: "Meeting ID and task ID are required" });
    }

    try {
      const meeting = await meetingsModel.findOne({
        _id: meetingId,
        tasks: taskId,
      });

      if (!meeting) {
        return res.status(404).send("Error: Task not found");
      }

      const task = await this.model.findById(taskId);

      if (!task) {
        return res.status(404).send("Error: Task not found");
      }

      return res.json(task);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve task by ID");
    }
  }

  async getByUserId(req: AuthRequest, res: Response) {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const tasks = await this.model.find({ gitHubRepoOwner: userId });
      return res.json(tasks);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve tasks by user ID");
    }
  }

  async getOpenTasksByMeetingId(req: AuthRequest, res: Response) {
    return this.getByMeetingId(req, res);
  }

  async create(req: AuthRequest, res: Response) {
    const { meetingId } = req.params;

    if (!meetingId) {
      res.status(400).json({ error: "Meeting ID is required" });
      return;
    }

    try {
      const meeting = await meetingsModel.findById(meetingId);

      if (!meeting) {
        res.status(404).send("Error: Meeting not found");
        return;
      }

      const task = await this.model.create(req.body);
      meeting.tasks.push(task._id as mongoose.Types.ObjectId);
      await meeting.save();

      res.status(201).json(task);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't create task");
    }
  }

  async update(req: AuthRequest, res: Response) {
    const { meetingId, taskId } = req.params;

    if (!meetingId || !taskId) {
      res.status(400).json({ error: "Meeting ID and task ID are required" });
      return;
    }

    try {
      const meeting = await meetingsModel.findOne({
        _id: meetingId,
        tasks: taskId,
      });

      if (!meeting) {
        res.status(404).send("Error: Task not found");
        return;
      }

      const updatedTask = await this.model.findByIdAndUpdate(taskId, req.body, {
        new: true,
      });

      if (!updatedTask) {
        res.status(404).send("Error: Task not found");
        return;
      }

      res.json(updatedTask);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't update task");
    }
  }

  async delete(req: AuthRequest, res: Response) {
    const { meetingId, taskId } = req.params;

    if (!meetingId || !taskId) {
      res.status(400).json({ error: "Meeting ID and task ID are required" });
      return;
    }

    try {
      const meeting = await meetingsModel.findOne({
        _id: meetingId,
        tasks: taskId,
      });

      if (!meeting) {
        res.status(404).send("Error: Task not found");
        return;
      }

      const deletedTask = await this.model.findByIdAndDelete(taskId);

      if (!deletedTask) {
        res.status(404).send("Error: Task not found");
        return;
      }

      meeting.tasks = meeting.tasks.filter(
        (currentTaskId) => currentTaskId.toString() !== taskId,
      );
      await meeting.save();

      res.json(deletedTask);
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't delete task");
    }
  }
}

export default new tasksController();
