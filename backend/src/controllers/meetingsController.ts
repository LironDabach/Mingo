import { Response } from "express";
import mongoose from "mongoose";
import meetingsModel from "../models/meetingsModel";
import usersModel from "../models/usersModel";
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

  async create(req: AuthRequest, res: Response) {
    const organizerId = req.user?._id || req.body.organizerId;
    const attendeeEmails = Array.isArray(req.body.attendeeEmails)
      ? req.body.attendeeEmails
          .filter((value: unknown) => typeof value === "string")
          .map((value: string) => value.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const participantIds = Array.isArray(req.body.participants)
      ? req.body.participants
          .filter((value: unknown) => typeof value === "string")
          .map((value: string) => value.trim())
          .filter(Boolean)
      : [];

    if (!organizerId) {
      res.status(401).json({ error: "Organizer is required" });
      return;
    }

    if (
      typeof req.body.gitHubRepoName !== "string" ||
      !req.body.gitHubRepoName.trim()
    ) {
      res.status(400).json({ error: "GitHub repository is required" });
      return;
    }

    if (attendeeEmails.length === 0 && participantIds.length === 0) {
      res.status(400).json({ error: "At least one attendee is required" });
      return;
    }

    try {
      const users = attendeeEmails.length
        ? await usersModel.find(
            {
              email: { $in: attendeeEmails },
            },
            "_id email",
          )
        : [];

      const matchedEmails = new Set(
        users
          .map((user) => user.email?.toLowerCase?.())
          .filter((value): value is string => Boolean(value)),
      );
      const inviteEmails = attendeeEmails.filter(
        (email: string) => !matchedEmails.has(email),
      );

      const resolvedParticipantIds = [
        organizerId,
        ...participantIds,
        ...users.map((user) => user._id.toString()),
      ].filter((value, index, array) => array.indexOf(value) === index);

      const title =
        typeof req.body.title === "string" && req.body.title.trim()
          ? req.body.title.trim()
          : "Live Meeting";

      const meetingDate = req.body.date ? new Date(req.body.date) : new Date();
      if (Number.isNaN(meetingDate.getTime())) {
        res.status(400).json({ error: "Invalid meeting date" });
        return;
      }

      const payload = {
        title,
        date: meetingDate,
        duration:
          typeof req.body.duration === "number" ? req.body.duration : undefined,
        organizerId,
        participants: resolvedParticipantIds,
        transcriptId: req.body.transcriptId || undefined,
        gitHubRepoName:
          typeof req.body.gitHubRepoName === "string" &&
          req.body.gitHubRepoName.trim()
            ? req.body.gitHubRepoName.trim()
            : undefined,
        inviteEmails,
        topics: Array.isArray(req.body.topics) ? req.body.topics : [],
        tasks: Array.isArray(req.body.tasks) ? req.body.tasks : [],
      };

      const meeting = await this.model.create(payload);
      res.status(201).json(meeting);
      return;
    } catch (err) {
      console.error(err);
      res.status(500).send("Error: Can't create meeting");
      return;
    }
  }
}

export default new meetingsController();
