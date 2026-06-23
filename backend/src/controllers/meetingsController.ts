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

  private withParticipantDetails(query: any) {
    return query.populate("participants", "fullname email username");
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

  private hasGoogleCalendarScope(user: any) {
    const scopes = typeof user?.googleTokenScope === "string"
      ? user.googleTokenScope
      : "";

    return scopes
      .split(/\s+/)
      .includes("https://www.googleapis.com/auth/calendar.events");
  }

  private hasGoogleGmailSendScope(user: any) {
    const scopes = typeof user?.googleTokenScope === "string"
      ? user.googleTokenScope
      : "";

    return scopes
      .split(/\s+/)
      .includes("https://www.googleapis.com/auth/gmail.send");
  }

  private encodeBase64Url(value: string) {
    return Buffer.from(value)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  private formatEmailList(values: string[]) {
    return values
      .filter(Boolean)
      .map((value) => value.trim())
      .filter(Boolean)
      .join(", ");
  }

  private getGoogleCalendarErrorMessage(errorText: string) {
    try {
      const payload = JSON.parse(errorText) as {
        error?: {
          status?: string;
          message?: string;
          errors?: Array<{ reason?: string; message?: string }>;
        };
      };
      const reason = payload.error?.errors?.[0]?.reason || payload.error?.status || "";
      const message = payload.error?.message || payload.error?.errors?.[0]?.message || "";
      const normalized = `${reason} ${message}`.toLowerCase();

      if (normalized.includes("accessnotconfigured") || normalized.includes("disabled")) {
        return "Google Calendar API is not enabled for this Google project.";
      }

      if (normalized.includes("insufficient") || normalized.includes("permission")) {
        return "Google Calendar permission was not granted. Please re-sync Google from Settings and approve Calendar access.";
      }

      return message || errorText;
    } catch (_err) {
      return errorText;
    }
  }

  private async createGoogleCalendarEvent(params: {
    organizer: any;
    title: string;
    date: Date;
    attendeeEmails: string[];
    gitHubRepoName?: string;
  }) {
    const { organizer, title, date, attendeeEmails, gitHubRepoName } = params;

    if (!organizer?.googleAccessToken) {
      throw new Error(
        "Google Calendar is not connected. Please sync Google from Settings.",
      );
    }

    if (!this.hasGoogleCalendarScope(organizer)) {
      throw new Error(
        "Google Calendar permission was not granted. Please re-sync Google from Settings and approve Calendar access.",
      );
    }

      const endDate = new Date(date.getTime() + 30 * 60 * 1000);
    const response = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${organizer.googleAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: title,
          description: gitHubRepoName
            ? `Mingo future meeting for ${gitHubRepoName}`
            : "Mingo future meeting",
          start: {
            dateTime: date.toISOString(),
          },
          end: {
            dateTime: endDate.toISOString(),
          },
          attendees: attendeeEmails.map((email) => ({ email })),
        }),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error(this.getGoogleCalendarErrorMessage(errorText));
      }
      throw new Error(errorText || "Unable to create Google Calendar event.");
    }

    const event = (await response.json()) as { id?: string };
    return event.id;
  }

  private async sendMeetingSummaryEmail(params: {
    sender: any;
    recipients: string[];
    title: string;
    summary: string;
    gitHubRepoName?: string;
    date?: Date;
    duration?: number;
    participantNames?: string[];
    closedTasks?: string[];
    openTasks?: string[];
  }) {
    const {
      sender,
      recipients,
      title,
      summary,
      gitHubRepoName,
      date,
      duration,
      participantNames = [],
      closedTasks = [],
      openTasks = [],
    } = params;

    if (!sender?.googleAccessToken) {
      throw new Error("Gmail is not connected. Please sync Google from Settings.");
    }

    if (!this.hasGoogleGmailSendScope(sender)) {
      throw new Error(
        "Gmail send permission was not granted. Please re-sync Google from Settings and approve Gmail access.",
      );
    }

    const uniqueRecipients = Array.from(new Set(recipients.map((email) => email.toLowerCase())));
    if (uniqueRecipients.length === 0) {
      throw new Error("No meeting recipients were found.");
    }

    const subject = `Meeting summary: ${title}`;
    const formatSection = (heading: string, items: string[]) =>
      items.length
        ? [heading, ...items.map((item) => `- ${item}`)].join("\n")
        : "";
    const formattedDate = date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("en-GB", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(date)
      : "Not available";
    const formattedDuration =
      typeof duration === "number" && Number.isFinite(duration) && duration > 0
        ? `${Math.round(duration)} min`
        : "Not available";
    const body = [
      "Hi team,",
      "",
      "Here is the meeting summary from Mingo.",
      "",
      "────────────────────────",
      `📝 Meeting: ${title}`,
      `📅 Date: ${formattedDate}`,
      `⏱ Duration: ${formattedDuration}`,
      gitHubRepoName ? `📦 Repository: ${gitHubRepoName}` : "",
      `👥 Participants: ${participantNames.length || uniqueRecipients.length}`,
      "────────────────────────",
      "",
      formatSection("👤 Participants:", participantNames.length ? participantNames : uniqueRecipients),
      "",
      "✨ Summary:",
      summary,
      "",
      formatSection("✅ Closed tasks:", closedTasks),
      "",
      formatSection("🕒 Remaining tasks:", openTasks),
      "",
      "────────────────────────",
      "Sent from Mingo",
    ].filter((line) => line !== "").join("\n");
    const rawMessage = [
      `To: ${this.formatEmailList(uniqueRecipients)}`,
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=UTF-8",
      "",
      body,
    ].join("\r\n");

    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sender.googleAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: this.encodeBase64Url(rawMessage),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          "Gmail permission failed. Please re-sync Google from Settings and approve Gmail access.",
        );
      }
      throw new Error(errorText || "Unable to send meeting summary email.");
    }
  }

  async getById(req: AuthRequest, res: Response) {
    const requestedId = req.params.id;

    if (!requestedId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    try {
      const meeting = await this.withParticipantDetails(
        this.model.findById(requestedId),
      );
      if (meeting) {
        return res.json(meeting);
      }

      const userMeetings = await this.model
        .find(this.buildUserMeetingsFilter(requestedId))
        .populate("participants", "fullname email username")
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
        .populate("participants", "fullname email username")
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
        .populate("participants", "fullname email username")
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
          status: "completed",
          endedAt: { $ne: null },
        })
        .populate("participants", "fullname email username")
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
        .populate("participants", "fullname email username")
        .sort({ date: -1 });

      return res.json(meetings);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve last month's meetings");
    }
  }

  async getThisMonthByUserId(req: AuthRequest, res: Response) {
    const userId = req.params.userId;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    try {
      const meetings = await this.model
        .find({
          ...this.buildUserMeetingsFilter(userId),
          date: {
            $gte: startOfMonth,
            $lt: startOfNextMonth,
          },
        })
        .populate("participants", "fullname email username")
        .sort({ date: -1 });

      return res.json(meetings);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error: Can't retrieve this month's meetings");
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

  async sendSummaryEmail(req: AuthRequest, res: Response) {
    const meetingId = req.params.id;
    const requesterId = req.user?._id;

    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    if (!requesterId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const meeting = await this.withParticipantDetails(
        this.model.findById(meetingId),
      );

      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }

      const summary =
        typeof req.body.summary === "string" && req.body.summary.trim()
          ? req.body.summary.trim()
          : meeting.summary;
      const closedTasks = Array.isArray(req.body.closedTasks)
        ? req.body.closedTasks.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim()))
        : [];
      const openTasks = Array.isArray(req.body.openTasks)
        ? req.body.openTasks.filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim()))
        : [];

      if (!summary) {
        return res.status(400).json({ error: "Meeting summary is required" });
      }

      const sender = await usersModel.findById(requesterId);
      const participantEmails = Array.isArray(meeting.participants)
        ? meeting.participants
            .map((participant: any) => participant.email)
            .filter((email: unknown): email is string => typeof email === "string")
        : [];
      const participantNames = Array.isArray(meeting.participants)
        ? meeting.participants
            .map((participant: any) =>
              participant.fullname || participant.username || participant.email,
            )
            .filter((value: unknown): value is string => typeof value === "string" && Boolean(value.trim()))
        : [];
      const inviteEmails = Array.isArray(meeting.inviteEmails)
        ? meeting.inviteEmails.filter((email: unknown): email is string => typeof email === "string")
        : [];
      const recipients = [...participantEmails, ...inviteEmails].filter(
        (email) => email.toLowerCase() !== sender?.email?.toLowerCase(),
      );

      await this.sendMeetingSummaryEmail({
        sender,
        recipients,
        title: meeting.title,
        summary,
        ...(meeting.gitHubRepoName ? { gitHubRepoName: meeting.gitHubRepoName } : {}),
        date: meeting.date,
        duration: meeting.duration,
        participantNames: [
          ...participantNames,
          ...inviteEmails,
        ].filter((value, index, array) => array.indexOf(value) === index),
        closedTasks,
        openTasks,
      });

      if (summary !== meeting.summary) {
        meeting.summary = summary;
        await meeting.save();
      }

      return res.status(200).json({ message: "Meeting summary email sent" });
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Unable to send meeting summary email";
      return res.status(message.includes("Gmail") ? 400 : 500).send(message);
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

      const status =
        req.body.status === "live" ||
        req.body.status === "completed" ||
        req.body.status === "upcoming"
          ? req.body.status
          : "upcoming";
      const shouldCreateCalendarEvent =
        status === "live" ||
        (status === "upcoming" && meetingDate.getTime() > Date.now());
      const organizer = shouldCreateCalendarEvent
        ? await usersModel.findById(organizerId)
        : null;
      const calendarEventId = shouldCreateCalendarEvent
        ? await this.createGoogleCalendarEvent({
            organizer,
            title,
            date: meetingDate,
            attendeeEmails,
            ...(req.body.gitHubRepoName ? { gitHubRepoName: req.body.gitHubRepoName } : {}),
          })
        : undefined;

      const payload = {
        title,
        date: meetingDate,
        duration:
          typeof req.body.duration === "number" ? req.body.duration : undefined,
        status,
        summary:
          typeof req.body.summary === "string" && req.body.summary.trim()
            ? req.body.summary.trim()
            : undefined,
        endedAt: req.body.endedAt ? new Date(req.body.endedAt) : undefined,
        organizerId,
        participants: resolvedParticipantIds,
        transcriptId: req.body.transcriptId || undefined,
        gitHubRepoName:
          typeof req.body.gitHubRepoName === "string" &&
          req.body.gitHubRepoName.trim()
            ? req.body.gitHubRepoName.trim()
            : undefined,
        googleCalendarEventId: calendarEventId,
        inviteEmails,
        tasks: Array.isArray(req.body.tasks) ? req.body.tasks : [],
      };

      const createdMeeting = await this.model.create(payload);
      const meeting = await this.withParticipantDetails(
        this.model.findById(createdMeeting._id),
      );
      res.status(201).json(meeting);
      return;
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Error: Can't create meeting";
      res
        .status(message.includes("Google Calendar") ? 400 : 500)
        .send(message);
      return;
    }
  }
}

export default new meetingsController();
