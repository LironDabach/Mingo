import mongoose from "mongoose";
import {
  MingoAgentService,
  MingoAgentError,
} from "../services/LLM/mingoAgentService";

type MockMeeting = {
  _id: string;
  title: string;
  date: Date;
  duration?: number;
  organizerId: string;
  participants: string[];
  transcriptId: string;
  topics: string[];
  tasks: string[];
  mingoAgentId?: string;
  save?: jest.Mock<Promise<void>, []>;
};

const createMeeting = (overrides: Partial<MockMeeting> = {}): MockMeeting => ({
  _id: new mongoose.Types.ObjectId().toString(),
  title: "Meeting",
  date: new Date("2026-03-20T09:00:00.000Z"),
  duration: 30,
  organizerId: new mongoose.Types.ObjectId().toString(),
  participants: [],
  transcriptId: new mongoose.Types.ObjectId().toString(),
  topics: [],
  tasks: [],
  save: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

const createChat = () => ({
  _id: new mongoose.Types.ObjectId().toString(),
  messages: [] as Array<{ sender: "user" | "mingo"; content: string; timestamp: Date }>,
  save: jest.fn().mockResolvedValue(undefined),
});

const createMeetingsModelMock = (meetings: MockMeeting[]) => ({
  findById: jest.fn((meetingId: string) =>
    Promise.resolve(meetings.find((entry) => entry._id === meetingId) || null),
  ),
  find: jest.fn((query: any) => {
    const excludedMeetingId = String(query?._id?.$ne || "");
    const matchedMeetings = meetings
      .filter((meeting) => meeting._id !== excludedMeetingId)
      .filter((meeting) =>
        (query?.$or || []).some((condition: any) => {
          if (condition.organizerId) {
            return String(meeting.organizerId) === String(condition.organizerId);
          }

          if (condition.participants) {
            return meeting.participants.includes(String(condition.participants));
          }

          return false;
        }),
      )
      .sort((left, right) => right.date.getTime() - left.date.getTime());

    return {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(
        matchedMeetings.map((meeting) => ({
          ...meeting,
          participants: [...meeting.participants],
          tasks: [...meeting.tasks],
          topics: [...meeting.topics],
        })),
      ),
    };
  }),
});

describe("MingoAgentService.generateReply", () => {
  test("keeps the current meeting as the only context for regular questions", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const currentMeeting = createMeeting({
      title: "Current budget review",
      organizerId: userId,
      participants: [userId],
      tasks: ["Confirm timeline"],
    });
    const otherMeeting = createMeeting({
      title: "Budget follow-up",
      organizerId: userId,
      participants: [userId],
      tasks: ["Send budget by Friday"],
      date: new Date("2026-03-19T09:00:00.000Z"),
    });
    const chat = createChat();
    const meetingsModelMock = createMeetingsModelMock([
      currentMeeting,
      otherMeeting,
    ]);
    const chatsModelMock = {
      findById: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(chat),
      create: jest.fn().mockResolvedValue(chat),
    };
    const llmGenerate = jest
      .fn()
      .mockResolvedValueOnce({
        response: JSON.stringify({
          scope: "current_meeting",
          searchOtherMeetings: false,
          comparisonMode: false,
          temporalDirection: "any",
          requestedEntities: ["timeline"],
          keywords: ["timeline"],
          limit: 0,
          rationale: "The user only asked about the current meeting.",
        }),
      })
      .mockResolvedValueOnce({ response: "Timeline confirmed." });
    const service = new MingoAgentService({ generate: llmGenerate } as any);

    (service as any).meetings = meetingsModelMock;
    (service as any).chats = chatsModelMock;

    await service.generateReply(
      currentMeeting._id,
      "What is the timeline for this meeting?",
      userId,
    );

    expect(llmGenerate).toHaveBeenCalledTimes(2);
    expect(llmGenerate.mock.calls[0][0].format).toBe("json");

    const answerPrompt = llmGenerate.mock.calls[1][0].prompt as string;
    expect(answerPrompt).toContain("Retrieval plan:");
    expect(answerPrompt).toContain('"scope": "current_meeting"');
    expect(answerPrompt).toContain("Current budget review");
    expect(answerPrompt).toContain("No additional meetings were retrieved for this question.");
    expect(answerPrompt).not.toContain("Budget follow-up");
  });

  test("includes related authorized meetings when the user asks a cross-meeting question", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const outsiderId = new mongoose.Types.ObjectId().toString();
    const currentMeeting = createMeeting({
      title: "Q2 roadmap check-in",
      organizerId: userId,
      participants: [userId],
      tasks: ["Review roadmap risks"],
    });
    const authorizedRelatedMeeting = createMeeting({
      title: "Previous roadmap sync",
      organizerId: userId,
      participants: [userId],
      tasks: ["Escalate roadmap blocker"],
      date: new Date("2026-03-18T09:00:00.000Z"),
    });
    const unrelatedAuthorizedMeeting = createMeeting({
      title: "Hiring sync",
      organizerId: userId,
      participants: [userId],
      tasks: ["Review interview feedback"],
      date: new Date("2026-03-17T09:00:00.000Z"),
    });
    const unauthorizedMeeting = createMeeting({
      title: "Private leadership roadmap",
      organizerId: outsiderId,
      participants: [outsiderId],
      tasks: ["Escalate roadmap blocker"],
      date: new Date("2026-03-21T09:00:00.000Z"),
    });
    const chat = createChat();
    const meetingsModelMock = createMeetingsModelMock([
      currentMeeting,
      authorizedRelatedMeeting,
      unrelatedAuthorizedMeeting,
      unauthorizedMeeting,
    ]);
    const chatsModelMock = {
      findById: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(chat),
      create: jest.fn().mockResolvedValue(chat),
    };
    const llmGenerate = jest
      .fn()
      .mockResolvedValueOnce({
        response: JSON.stringify({
          scope: "related_meetings",
          searchOtherMeetings: true,
          comparisonMode: false,
          temporalDirection: "past",
          requestedEntities: ["blocker"],
          keywords: ["roadmap", "blocker"],
          limit: 2,
          rationale: "The user asked whether the blocker was discussed in a previous meeting.",
        }),
      })
      .mockResolvedValueOnce({
        response: "The blocker also appeared in the previous roadmap sync.",
      });
    const service = new MingoAgentService({ generate: llmGenerate } as any);

    (service as any).meetings = meetingsModelMock;
    (service as any).chats = chatsModelMock;

    await service.generateReply(
      currentMeeting._id,
      "Did we already discuss this blocker in a previous meeting?",
      userId,
    );

    expect(llmGenerate).toHaveBeenCalledTimes(2);

    const answerPrompt = llmGenerate.mock.calls[1][0].prompt as string;
    expect(answerPrompt).toContain('"scope": "related_meetings"');
    expect(answerPrompt).toContain("Q2 roadmap check-in");
    expect(answerPrompt).toContain("Previous roadmap sync");
    expect(answerPrompt).not.toContain("Private leadership roadmap");
  });

  test("falls back to a deterministic plan when the planner response is invalid", async () => {
    const userId = new mongoose.Types.ObjectId().toString();
    const currentMeeting = createMeeting({
      title: "Platform incidents review",
      organizerId: userId,
      participants: [userId],
      tasks: ["Review blocker status"],
    });
    const relatedMeeting = createMeeting({
      title: "Previous incident sync",
      organizerId: userId,
      participants: [userId],
      tasks: ["Track blocker owner"],
      date: new Date("2026-03-18T09:00:00.000Z"),
    });
    const chat = createChat();
    const meetingsModelMock = createMeetingsModelMock([
      currentMeeting,
      relatedMeeting,
    ]);
    const chatsModelMock = {
      findById: jest.fn().mockResolvedValue(null),
      findOne: jest.fn().mockResolvedValue(chat),
      create: jest.fn().mockResolvedValue(chat),
    };
    const llmGenerate = jest
      .fn()
      .mockResolvedValueOnce({ response: "not-json" })
      .mockResolvedValueOnce({ response: "The blocker was discussed previously." });
    const service = new MingoAgentService({ generate: llmGenerate } as any);

    (service as any).meetings = meetingsModelMock;
    (service as any).chats = chatsModelMock;

    await service.generateReply(
      currentMeeting._id,
      "Was this blocker discussed in a previous meeting?",
      userId,
    );

    const answerPrompt = llmGenerate.mock.calls[1][0].prompt as string;
    expect(answerPrompt).toContain('"scope": "related_meetings"');
    expect(answerPrompt).toContain("Previous incident sync");
  });

  test("rejects reply generation when the meeting is not visible to the user", async () => {
    const ownerId = new mongoose.Types.ObjectId().toString();
    const requesterId = new mongoose.Types.ObjectId().toString();
    const hiddenMeeting = createMeeting({
      title: "Private review",
      organizerId: ownerId,
      participants: [ownerId],
    });
    const meetingsModelMock = createMeetingsModelMock([hiddenMeeting]);
    const chatsModelMock = {
      findById: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
    };
    const service = new MingoAgentService({
      generate: jest.fn(),
    } as any);

    (service as any).meetings = meetingsModelMock;
    (service as any).chats = chatsModelMock;

    await expect(
      service.generateReply(hiddenMeeting._id, "What happened here?", requesterId),
    ).rejects.toMatchObject({
      message: "Meeting not found",
      statusCode: 404,
    });

    expect(chatsModelMock.findOne).not.toHaveBeenCalled();
    expect(chatsModelMock.create).not.toHaveBeenCalled();
  });
});
