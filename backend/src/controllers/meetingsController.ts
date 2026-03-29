import { Response } from "express";
import mongoose from "mongoose";
import meetingsModel from "../models/meetingsModel";
import { AuthRequest } from "../middleware/authMiddleware";
import baseController from "./baseController";

class meetingsController extends baseController {
  constructor() {
    super(meetingsModel);
  }

  private buildUserMeetingsFilter(userId: string) {
    const normalizedUserId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    return {
      $or: [
        { organizerId: normalizedUserId },
        { participants: normalizedUserId },
      ],
    };
  }

  async getById(req: AuthRequest, res: Response) {
    const requestedId = req.params.id;

    if (!requestedId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    try {
      const meeting = await this.model.findById(requestedId);
      if (meeting) {
        return res.json(meeting);
      }

      const userMeetings = await this.model
        .find(this.buildUserMeetingsFilter(requestedId))
        .sort({ date: -1 });

      if (userMeetings.length > 0) {
        return res.json(userMeetings);
      }

      return res.status(404).send("Error: Not found");
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve Entity by ID");
    }
  }

  async getByUserId(req: AuthRequest, res: Response) {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const meetings = await this.model
        .find(this.buildUserMeetingsFilter(userId))
        .sort({ date: -1 });

      return res.json(meetings);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve meetings by user ID");
    }
  }

  async getUpcomingByUserId(req: AuthRequest, res: Response) {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const meetings = await this.model
        .find({
          ...this.buildUserMeetingsFilter(userId),
          date: { $gte: new Date() },
        })
        .sort({ date: 1 });

      return res.json(meetings);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve upcoming meetings");
    }
  }

  async getRecentByUserId(req: AuthRequest, res: Response) {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const meetings = await this.model
        .find({
          ...this.buildUserMeetingsFilter(userId),
          date: { $lt: new Date() },
        })
        .sort({ date: -1 });

      return res.json(meetings);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve recent meetings");
    }
  }

  async getLastMonthByUserId(req: AuthRequest, res: Response) {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    try {
      const meetings = await this.model
        .find({
          ...this.buildUserMeetingsFilter(userId),
          date: {
            $gte: lastMonth,
            $lte: now,
          },
        })
        .sort({ date: -1 });

      return res.json(meetings);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve last month's meetings");
    }
  }

  async getAverageDurationByUserId(req: AuthRequest, res: Response) {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    try {
      const result = await this.model.aggregate([
        {
          $match: this.buildUserMeetingsFilter(userId),
        },
        {
          $match: {
            duration: { $type: "number" },
          },
        },
        {
          $group: {
            _id: null,
            averageDuration: { $avg: "$duration" },
          },
        },
      ]);

      const averageDuration = result[0]?.averageDuration ?? 0;

      return res.json({ averageDuration });
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve average meeting duration");
    }
  }
}

export default new meetingsController();
