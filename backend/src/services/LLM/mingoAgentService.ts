import mingoAgentModel from "../../models/mingoAgentModel";
import meetingsModel from "../../models/meetingsModel";
import tasksModel from "../../models/tasksModel";
import usersModel from "../../models/usersModel";
import llmService, { LlmService } from "./llmService";

export class MingoAgentError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "MingoAgentError";
    this.statusCode = statusCode;
  }
}

type MessageSender = "user" | "mingo";

type ChatMessage = {
  sender: MessageSender;
  content: string;
  timestamp: Date;
};

type AgentReply = {
  chat: any;
  reply: string;
  messages: ChatMessage[];
};

type TopicItem = {
  title: string;
  description: string;
};

type RetrievalScope =
  | "current_meeting"
  | "related_meetings"
  | "all_user_meetings";

type RetrievalPlan = {
  scope: RetrievalScope;
  searchOtherMeetings: boolean;
  comparisonMode: boolean;
  temporalDirection: "past" | "future" | "any";
  requestedEntities: string[];
  keywords: string[];
  limit: number;
  rationale: string;
};

type TaskFact = {
  id: string;
  title: string;
  status: string;
  open: boolean | null;
  source: "meeting_task" | "repo_task" | "github_issue";
  repo: string | null;
  issueNumber: number | null;
  assignee: string | null;
  dueDate: string | null;
  meetingTitle: string | null;
};

type TaskFactSummary = {
  total: number;
  open: number;
  done: number;
  unknown: number;
  authoritativeSources: string[];
  tasks: TaskFact[];
};

class MingoAgentService {
  private static readonly MAX_USER_MESSAGE_LENGTH = 4000;
  private static readonly MAX_ASSISTANT_MESSAGE_LENGTH = 6000;
  private static readonly MAX_PROMPT_HISTORY_MESSAGES = 20;
  private static readonly MAX_PROMPT_HISTORY_CHARS = 8000;
  private static readonly MAX_RELATED_MEETINGS = 3;
  private static readonly RELATED_MEETINGS_LOOKBACK = 20;
  private static readonly MAX_PLANNER_KEYWORDS = 8;
  private static readonly LLM_TIMEOUT_MS = Number(
    process.env.MINGO_AGENT_LLM_TIMEOUT_MS || "5000",
  );

  private meetings = meetingsModel;
  private tasks = tasksModel;
  private users = usersModel;
  private chats = mingoAgentModel;
  private llm: LlmService;

  constructor(llm = llmService) {
    this.llm = llm;
  }

  private normalizeInput(message: string) {
    return (message || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MingoAgentService.MAX_USER_MESSAGE_LENGTH);
  }

  private normalizeAssistantResponse(message: string) {
    return (message || "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, MingoAgentService.MAX_ASSISTANT_MESSAGE_LENGTH);
  }

  private sanitizeContextValue(value: unknown): unknown {
    if (value === undefined || value === null) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeContextValue(item));
    }

    if (typeof value === "object") {
      const sanitizedObject: Record<string, unknown> = {};

      Object.entries(value as Record<string, unknown>).forEach(
        ([key, entryValue]) => {
          if (typeof entryValue === "function") {
            return;
          }

          sanitizedObject[key] = this.sanitizeContextValue(entryValue);
        },
      );

      return sanitizedObject;
    }

    return value;
  }

  private formatContextAsJson(value: unknown) {
    return JSON.stringify(this.sanitizeContextValue(value), null, 2);
  }

  private summarizeContextValue(value: unknown): string {
    if (value === undefined || value === null) {
      return "Not available";
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      if (!value.length) {
        return "None";
      }

      return value
        .map((item) => {
          if (item === undefined || item === null) {
            return "null";
          }

          if (item instanceof Date) {
            return item.toISOString();
          }

          if (
            typeof item === "string" ||
            typeof item === "number" ||
            typeof item === "boolean"
          ) {
            return String(item);
          }

          return JSON.stringify(this.sanitizeContextValue(item));
        })
        .join(", ");
    }

    if (typeof value === "object") {
      return JSON.stringify(this.sanitizeContextValue(value));
    }

    return String(value);
  }

  private normalizeTopicItem(value: unknown): TopicItem | null {
    if (typeof value === "string") {
      const title = value.trim();
      if (!title) {
        return null;
      }

      return {
        title,
        description: `Discussion related to ${title.toLowerCase()}.`,
      };
    }

    if (value && typeof value === "object") {
      const record = value as {
        title?: unknown;
        description?: unknown;
        subject?: unknown;
      };
      const rawTitle =
        typeof record.title === "string"
          ? record.title
          : typeof record.subject === "string"
            ? record.subject
            : "";
      const rawDescription =
        typeof record.description === "string" ? record.description : "";
      const title = rawTitle.trim();
      const description = rawDescription.trim();

      if (!title) {
        return null;
      }

      return {
        title,
        description:
          description || `Discussion related to ${title.toLowerCase()}.`,
      };
    }

    return null;
  }

  private parseTopicsResponse(topicsResponse: string): TopicItem[] {
    const normalizeTopics = (value: unknown): TopicItem[] | null => {
      if (!Array.isArray(value)) {
        return null;
      }

      const topics = value
        .map((item) => this.normalizeTopicItem(item))
        .filter(Boolean);

      return topics.length ? (topics as TopicItem[]) : null;
    };

    const tryParseJson = (raw: string): TopicItem[] | null => {
      const parsed = JSON.parse(raw) as unknown;

      const directTopics = normalizeTopics(parsed);
      if (directTopics) {
        return directTopics;
      }

      if (parsed && typeof parsed === "object") {
        const objectTopics = normalizeTopics(
          (parsed as { topics?: unknown }).topics,
        );
        if (objectTopics) {
          return objectTopics;
        }
      }

      return null;
    };

    try {
      const parsedTopics = tryParseJson(topicsResponse);
      if (parsedTopics) {
        return parsedTopics;
      }
    } catch {
      // Fall through to substring extraction below.
    }

    const jsonArrayMatch = topicsResponse.match(/\[[\s\S]*\]/);
    if (jsonArrayMatch) {
      try {
        const parsedTopics = tryParseJson(jsonArrayMatch[0]);
        if (parsedTopics) {
          return parsedTopics;
        }
      } catch {
        // Fall through to bullet parsing below.
      }
    }

    const bulletTopics = topicsResponse
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[-*•]\s+/.test(line))
      .map((line) =>
        this.normalizeTopicItem(line.replace(/^[-*•]\s+/, "").trim()),
      )
      .filter(Boolean);

    if (bulletTopics.length) {
      return bulletTopics as TopicItem[];
    }

    throw new Error("Parsed topics is not a supported topics array");
  }

  private buildFallbackTopics(meeting: any): TopicItem[] {
    const normalizedTopics = Array.isArray(meeting?.topics)
      ? meeting.topics
          .map((topic: unknown) => this.normalizeTopicItem(topic))
          .filter(Boolean)
      : [];

    if (normalizedTopics.length) {
      return normalizedTopics as TopicItem[];
    }

    const taskTopics = this.extractTaskLabels(meeting?.tasks)
      .map((task) => ({
        title: task.trim(),
        description: `Action item discussed in the meeting: ${task.trim()}.`,
      }))
      .filter((topic: TopicItem) => Boolean(topic.title))
      .slice(0, 5);

    if (taskTopics.length) {
      return taskTopics;
    }

    const title =
      typeof meeting?.title === "string" ? meeting.title.trim() : "";
    if (title) {
      return [
        {
          title,
          description: `Main discussion topic based on the meeting title: ${title}.`,
        },
      ];
    }

    return [
      {
        title: "General meeting discussion",
        description: "General discussion derived from the meeting context.",
      },
    ];
  }

  private serializeHistory(messages: ChatMessage[]) {
    if (!messages.length) {
      return "No previous messages.";
    }

    const selectedMessages = messages.slice(
      -MingoAgentService.MAX_PROMPT_HISTORY_MESSAGES,
    );
    const serializedMessages: string[] = [];
    let totalChars = 0;

    for (let index = selectedMessages.length - 1; index >= 0; index -= 1) {
      const message = selectedMessages[index];
      if (!message) {
        continue;
      }
      const serializedMessage = `[${message.timestamp.toISOString()}] ${message.sender}: ${message.content}`;

      if (
        serializedMessages.length > 0 &&
        totalChars + serializedMessage.length >
          MingoAgentService.MAX_PROMPT_HISTORY_CHARS
      ) {
        break;
      }

      serializedMessages.unshift(serializedMessage);
      totalChars += serializedMessage.length;
    }

    return serializedMessages.join("\n");
  }

  private stringifyId(value: unknown) {
    if (value === undefined || value === null) {
      return "";
    }

    return String(value);
  }

  private normalizeRepoName(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  private normalizeTaskStatus(value: unknown) {
    const status = typeof value === "string" ? value.trim() : "";
    return status || "Unknown";
  }

  private resolveOpenState(status: string) {
    const normalizedStatus = status.toLowerCase();

    if (
      normalizedStatus === "done" ||
      normalizedStatus === "closed" ||
      normalizedStatus === "complete" ||
      normalizedStatus === "completed"
    ) {
      return false;
    }

    if (
      normalizedStatus === "to do" ||
      normalizedStatus === "todo" ||
      normalizedStatus === "in progress" ||
      normalizedStatus === "open"
    ) {
      return true;
    }

    return null;
  }

  private resolveStatusFromGitHubIssue(issue: { state?: string }) {
    return issue.state === "closed" ? "Done" : "To Do";
  }

  private toIsoOrNull(value: unknown) {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const date = new Date(value as string | number | Date);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private getGitHubAuthorization(user: any) {
    if (!user?.githubAccessToken) {
      return null;
    }

    const tokenType =
      typeof user.githubTokenType === "string" &&
      user.githubTokenType.trim().toLowerCase() === "bearer"
        ? "Bearer"
        : "token";

    return `${tokenType} ${user.githubAccessToken}`;
  }

  private async fetchGitHubJson<T>(url: string, authorization?: string) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "User-Agent": "Mingo",
        "X-GitHub-Api-Version": "2022-11-28",
      };

      if (authorization) {
        headers.Authorization = authorization;
      }

      const response = await fetch(url, {
        headers,
      });

      if (!response.ok) {
        return null;
      }

      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  private buildTaskFact(task: any, source: TaskFact["source"], meeting?: any) {
    const id = this.stringifyId(task?._id) || this.stringifyId(task?.id);
    const repo =
      typeof task?.gitHubRepoName === "string" && task.gitHubRepoName.trim()
        ? task.gitHubRepoName.trim()
        : typeof meeting?.gitHubRepoName === "string" &&
            meeting.gitHubRepoName.trim()
          ? meeting.gitHubRepoName.trim()
          : null;
    const issueNumber =
      typeof task?.gitHubIssueId === "number"
        ? task.gitHubIssueId
        : typeof task?.gitHubIssueId === "string" &&
            Number.isFinite(Number(task.gitHubIssueId))
          ? Number(task.gitHubIssueId)
          : null;
    const title =
      typeof task?.title === "string" && task.title.trim()
        ? task.title.trim()
        : repo && issueNumber
          ? `${repo} issue ${issueNumber}`
          : id || "Untitled task";
    const status = this.normalizeTaskStatus(task?.status);

    return {
      id: id || `${source}:${repo || "unknown"}:${issueNumber || title}`,
      title,
      status,
      open: this.resolveOpenState(status),
      source,
      repo,
      issueNumber,
      assignee:
        typeof task?.assigneeName === "string" && task.assigneeName.trim()
          ? task.assigneeName.trim()
          : typeof task?.assigneeId?.fullname === "string" &&
              task.assigneeId.fullname.trim()
            ? task.assigneeId.fullname.trim()
            : typeof task?.assigneeId?.username === "string" &&
                task.assigneeId.username.trim()
              ? task.assigneeId.username.trim()
              : null,
      dueDate: this.toIsoOrNull(task?.dueDate),
      meetingTitle:
        typeof meeting?.title === "string" && meeting.title.trim()
          ? meeting.title.trim()
          : null,
    };
  }

  private buildGitHubIssueFact(issue: any, repo: string) {
    const status = this.resolveStatusFromGitHubIssue(issue);

    return {
      id: `github:${repo}#${issue.number}`,
      title:
        typeof issue.title === "string" && issue.title.trim()
          ? issue.title.trim()
          : `${repo} issue ${issue.number}`,
      status,
      open: this.resolveOpenState(status),
      source: "github_issue" as const,
      repo,
      issueNumber:
        typeof issue.number === "number" ? issue.number : Number(issue.number),
      assignee:
        typeof issue.assignee?.login === "string" && issue.assignee.login.trim()
          ? issue.assignee.login.trim()
          : null,
      dueDate: this.toIsoOrNull(issue.milestone?.due_on),
      meetingTitle: null,
    };
  }

  private dedupeTaskFacts(facts: TaskFact[]) {
    const seen = new Set<string>();
    const deduped: TaskFact[] = [];

    for (const fact of facts) {
      const repo = this.normalizeRepoName(fact.repo);
      const issueKey = repo && fact.issueNumber ? `${repo}#${fact.issueNumber}` : "";
      const key = issueKey || fact.id;

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      deduped.push(fact);
    }

    return deduped;
  }

  private summarizeTaskFacts(
    facts: TaskFact[],
    authoritativeSources: string[] = [],
  ): TaskFactSummary {
    const tasks = this.dedupeTaskFacts(facts);

    return {
      total: tasks.length,
      open: tasks.filter((task) => task.open === true).length,
      done: tasks.filter((task) => task.open === false).length,
      unknown: tasks.filter((task) => task.open === null).length,
      authoritativeSources,
      tasks,
    };
  }

  private async getGitHubRepoCandidates(
    repoName: string,
    user: any,
    authorization?: string,
  ) {
    const candidates = new Set<string>();
    const trimmedRepoName = repoName.trim();

    if (!trimmedRepoName) {
      return [];
    }

    candidates.add(trimmedRepoName);

    if (trimmedRepoName.includes("/")) {
      return Array.from(candidates);
    }

    [user?.username, user?.fullname]
      .filter((value) => typeof value === "string" && value.trim())
      .forEach((owner) => candidates.add(`${owner.trim()}/${trimmedRepoName}`));

    if (!authorization) {
      return Array.from(candidates);
    }

    const repos = await this.fetchGitHubJson<
      Array<{ name?: string; full_name?: string }>
    >("https://api.github.com/user/repos?sort=updated&per_page=100", authorization);

    const normalizedRepoName = this.normalizeRepoName(repoName);
    repos
      ?.filter(
        (repo) =>
          this.normalizeRepoName(repo.name) === normalizedRepoName ||
          this.normalizeRepoName(repo.full_name) === normalizedRepoName,
      )
      .forEach((repo) => {
        if (repo.full_name) {
          candidates.add(repo.full_name);
        }
      });

    return Array.from(candidates);
  }

  private async fetchGitHubIssueFactsForRepo(repoName: string, userId?: string) {
    if (!userId || !repoName.trim()) {
      return { facts: [] as TaskFact[], authoritativeRepo: null as string | null };
    }

    const user = await this.users.findById(userId);
    const authorization = this.getGitHubAuthorization(user);
    const repoCandidates = await this.getGitHubRepoCandidates(
      repoName,
      user,
      authorization || undefined,
    );

    for (const candidate of repoCandidates) {
      if (!candidate.includes("/")) {
        continue;
      }

      const issues = await this.fetchGitHubJson<
        Array<{
          number: number;
          title: string;
          state: string;
          assignee?: { login?: string } | null;
          pull_request?: unknown;
          milestone?: { due_on?: string | null } | null;
        }>
      >(
        `https://api.github.com/repos/${candidate}/issues?state=all&per_page=100&sort=updated`,
        authorization || undefined,
      );

      if (issues) {
        return {
          facts: issues
            .filter((issue) => !issue.pull_request)
            .map((issue) => this.buildGitHubIssueFact(issue, candidate)),
          authoritativeRepo: candidate,
        };
      }
    }

    return { facts: [] as TaskFact[], authoritativeRepo: null as string | null };
  }

  private async loadTaskFactsForMeeting(meeting: any, userId?: string) {
    const facts: TaskFact[] = [];
    const rawTasks: unknown[] = Array.isArray(meeting?.tasks) ? meeting.tasks : [];
    const taskObjectIds = rawTasks
      .filter((task) => typeof task === "string" && /^[a-f0-9]{24}$/i.test(task))
      .map((task) => String(task));

    rawTasks.forEach((task) => {
      if (task && typeof task === "object") {
        facts.push(this.buildTaskFact(task, "meeting_task", meeting));
      }
    });

    if (taskObjectIds.length > 0) {
      const taskQuery = this.tasks
        .find({ _id: { $in: taskObjectIds } })
        .populate("assigneeId", "fullname email username");
      const taskDocs =
        taskQuery && typeof taskQuery.lean === "function"
          ? await taskQuery.lean()
          : await taskQuery;

      (taskDocs || []).forEach((task: any) => {
        facts.push(this.buildTaskFact(task, "meeting_task", meeting));
      });
    }

    const repoName =
      typeof meeting?.gitHubRepoName === "string" ? meeting.gitHubRepoName.trim() : "";

    if (repoName) {
      // Try GitHub first. If it responds, it is the sole authoritative source for
      // this repo — skip the local DB query entirely to avoid duplication.
      const githubResult = await this.fetchGitHubIssueFactsForRepo(repoName, userId);

      if (githubResult.authoritativeRepo) {
        const authoritativeRepo = this.normalizeRepoName(githubResult.authoritativeRepo);
        const meetingLevelFacts = facts.filter((fact) => {
          const factRepo = this.normalizeRepoName(fact.repo);
          return (
            !factRepo ||
            (factRepo !== authoritativeRepo &&
              !authoritativeRepo.endsWith(`/${factRepo}`) &&
              !factRepo.endsWith(`/${authoritativeRepo}`))
          );
        });

        return this.summarizeTaskFacts(
          [...meetingLevelFacts, ...githubResult.facts],
          [`github:${githubResult.authoritativeRepo}`],
        );
      }

      // GitHub not connected or unavailable — fall back to local DB.
      const userTaskQuery = this.tasks
        .find(
          userId
            ? { $or: [{ gitHubRepoOwner: userId }, { assigneeId: userId }] }
            : {},
        )
        .populate("assigneeId", "fullname email username");
      const userTasks =
        userTaskQuery && typeof userTaskQuery.lean === "function"
          ? await userTaskQuery.lean()
          : await userTaskQuery;
      const normalizedRepoName = this.normalizeRepoName(repoName);

      (userTasks || [])
        .filter((task: any) => {
          const taskRepo = this.normalizeRepoName(task?.gitHubRepoName);
          return (
            taskRepo === normalizedRepoName ||
            taskRepo.endsWith(`/${normalizedRepoName}`) ||
            normalizedRepoName.endsWith(`/${taskRepo}`)
          );
        })
        .forEach((task: any) => {
          facts.push(this.buildTaskFact(task, "repo_task", meeting));
        });
    }

    return this.summarizeTaskFacts(facts);
  }

  private formatTaskFactSummary(summary: TaskFactSummary, label: string) {
    const taskRows = summary.tasks.length
      ? summary.tasks
          .map((task, index) =>
            [
              `${index + 1}. ${task.title}`,
              `status=${task.status}`,
              `open=${task.open === null ? "unknown" : String(task.open)}`,
              task.repo ? `repo=${task.repo}` : "",
              task.issueNumber ? `issue=${task.issueNumber}` : "",
              task.assignee ? `assignee=${task.assignee}` : "",
              task.dueDate ? `due=${task.dueDate}` : "",
              `source=${task.source}`,
            ]
              .filter(Boolean)
              .join(" | "),
          )
          .join("\n")
      : "No task facts retrieved.";

    return [
      `${label} task facts:`,
      `- Total tasks: ${summary.total}`,
      `- Open tasks: ${summary.open}`,
      `- Done tasks: ${summary.done}`,
      `- Unknown-status tasks: ${summary.unknown}`,
      `- Authoritative sources: ${
        summary.authoritativeSources.length
          ? summary.authoritativeSources.join(", ")
          : "local meeting/task records"
      }`,
      "- Status rule: open=true means the task is not done. Open tasks include To Do, In Progress, and open GitHub issues. Done/closed tasks are not open.",
      "Tasks:",
      taskRows,
    ].join("\n");
  }

  private findIssueNumbers(value: string) {
    return Array.from(value.matchAll(/#(\d+)\b/g))
      .map((match) => Number(match[1]))
      .filter((issueNumber) => Number.isFinite(issueNumber));
  }

  private formatTaskFactReference(task: TaskFact) {
    return [
      task.issueNumber ? `#${task.issueNumber}` : task.id,
      task.title,
      `status=${task.status}`,
      `open=${task.open === null ? "unknown" : String(task.open)}`,
      task.repo ? `repo=${task.repo}` : "",
      task.assignee ? `assignee=${task.assignee}` : "",
      `source=${task.source}`,
    ]
      .filter(Boolean)
      .join(" | ");
  }

  private buildReferenceHints(
    primaryTaskFacts: TaskFactSummary,
    history: ChatMessage[],
    userMessage: string,
  ) {
    const userIssueNumbers = this.findIssueNumbers(userMessage);
    const factIssueNumbers = new Set(
      primaryTaskFacts.tasks
        .map((task) => task.issueNumber)
        .filter((issueNumber): issueNumber is number => issueNumber !== null),
    );
    const directlyReferencedTasks = userIssueNumbers
      .map((issueNumber) =>
        primaryTaskFacts.tasks.find((task) => task.issueNumber === issueNumber),
      )
      .filter(Boolean) as TaskFact[];
    const normalizedMessage = userMessage.toLowerCase();
    const hasTaskReference =
      /\b(this|that|it|its|these|those|the task|the issue|that task|this task|this issue|that issue)\b/.test(
        normalizedMessage,
      );
    const openTasks = primaryTaskFacts.tasks.filter((task) => task.open === true);
    const onlyTask =
      primaryTaskFacts.tasks.length === 1 ? primaryTaskFacts.tasks[0] : null;
    const likelyTask =
      directlyReferencedTasks[0] ||
      (hasTaskReference && openTasks.length === 1 ? openTasks[0] : null) ||
      (hasTaskReference && onlyTask ? onlyTask : null);
    const historyIssueNumbers = history.flatMap((message) =>
      this.findIssueNumbers(message.content),
    );
    const unsupportedHistoryIssues = historyIssueNumbers.filter(
      (issueNumber, index, array) =>
        array.indexOf(issueNumber) === index && !factIssueNumbers.has(issueNumber),
    );

    return [
      "Reference resolution hints:",
      "- Chat history is conversational context only. It is not a source of truth for task identity, status, or counts.",
      "- If chat history conflicts with structured task facts, ignore the conflicting history and use structured task facts.",
      likelyTask
        ? `- Likely task referenced by the current user message: ${this.formatTaskFactReference(likelyTask)}`
        : "- No single task reference could be resolved from the current structured facts.",
      unsupportedHistoryIssues.length
        ? `- Task issue numbers mentioned in chat history but absent from current structured facts: ${unsupportedHistoryIssues
            .map((issueNumber) => `#${issueNumber}`)
            .join(", ")}. Do not use them as current facts.`
        : "- No unsupported task issue numbers were found in chat history.",
    ].join("\n");
  }

  private async runLlmGenerate(options: Parameters<LlmService["generate"]>[0]) {
    return Promise.race([
      this.llm.generate(options),
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error("Mingo LLM request timed out"));
        }, MingoAgentService.LLM_TIMEOUT_MS);
      }),
    ]);
  }

  private extractTaskLabels(tasks: unknown) {
    if (!Array.isArray(tasks)) {
      return [] as string[];
    }

    return tasks
      .map((task) => {
        if (typeof task === "string") {
          return task.trim();
        }

        if (task && typeof task === "object") {
          const record = task as {
            title?: unknown;
            gitHubRepoName?: unknown;
            gitHubIssueId?: unknown;
          };

          if (typeof record.title === "string" && record.title.trim()) {
            return record.title.trim();
          }

          const repoName =
            typeof record.gitHubRepoName === "string"
              ? record.gitHubRepoName.trim()
              : "";
          const issueId =
            typeof record.gitHubIssueId === "number" ||
            typeof record.gitHubIssueId === "string"
              ? String(record.gitHubIssueId).trim()
              : "";

          if (repoName && issueId) {
            return `${repoName} issue ${issueId}`;
          }

          if (repoName) {
            return repoName;
          }
        }

        return "";
      })
      .filter(Boolean);
  }

  private extractTopicLabels(topics: unknown) {
    if (!Array.isArray(topics)) {
      return [] as string[];
    }

    return topics
      .map((topic) => this.normalizeTopicItem(topic)?.title || "")
      .filter(Boolean);
  }

  private buildFallbackReply(
    meeting: any,
    userMessage: string,
    relatedMeetings: any[],
  ) {
    const normalizedMessage = userMessage.toLowerCase();
    const topics = this.extractTopicLabels(meeting?.topics);
    const tasks = this.extractTaskLabels(meeting?.tasks);
    const actionItems = [...topics, ...tasks].filter(
      (value, index, array) => array.indexOf(value) === index,
    );
    const meetingTitle =
      typeof meeting?.title === "string" && meeting.title.trim()
        ? meeting.title.trim()
        : "this meeting";

    if (
      /\b(action items?|tasks?|timeline|next steps?|follow[- ]?ups?)\b/.test(
        normalizedMessage,
      )
    ) {
      if (actionItems.length > 0) {
        return `For ${meetingTitle}, the key action items are ${actionItems.join(", ")}.`;
      }

      return `I don't see explicit action items recorded for ${meetingTitle}.`;
    }

    if (/\bsummary|decisions?|key points?\b/.test(normalizedMessage)) {
      if (actionItems.length > 0) {
        return `${meetingTitle} focused on ${actionItems.join(", ")}.`;
      }

      return `${meetingTitle} is available, but I don't see enough structured detail to summarize decisions confidently.`;
    }

    if (relatedMeetings.length > 0) {
      return `I couldn't reach the model, but related meetings include ${relatedMeetings
        .map((relatedMeeting) => relatedMeeting?.title)
        .filter(Boolean)
        .join(", ")}.`;
    }

    if (actionItems.length > 0) {
      return `From ${meetingTitle}, I can confirm ${actionItems.join(", ")}.`;
    }

    return `I couldn't reach the model, but the available context for ${meetingTitle} is still limited.`;
  }

  private buildFallbackSummary(meeting: any) {
    const meetingTitle =
      typeof meeting?.title === "string" && meeting.title.trim()
        ? meeting.title.trim()
        : "This meeting";
    const topics = this.extractTopicLabels(meeting?.topics);
    const tasks = this.extractTaskLabels(meeting?.tasks);
    const discussionPoints = [...topics, ...tasks].filter(
      (value, index, array) => array.indexOf(value) === index,
    );

    if (discussionPoints.length > 0) {
      return `${meetingTitle} covered ${discussionPoints.join(", ")}.`;
    }

    return `${meetingTitle} took place on ${this.meetingDateToIso(meeting?.date)}. No additional structured summary details are available.`;
  }

  private meetingDateToIso(value: unknown) {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value) {
      return new Date(value as string | number | Date).toISOString();
    }

    return "Not available";
  }

  private formatMeetingSummary(meeting: any, label: string) {
    return [
      `${label}:`,
      `- Meeting ID: ${this.stringifyId(meeting?._id) || "Not available"}`,
      `- Title: ${this.summarizeContextValue(meeting?.title)}`,
      `- Date: ${this.meetingDateToIso(meeting?.date)}`,
      `- Duration: ${this.summarizeContextValue(meeting?.duration)}`,
      `- Organizer ID: ${this.summarizeContextValue(meeting?.organizerId)}`,
      `- Participants: ${this.summarizeContextValue(meeting?.participants)}`,
      `- Transcript ID: ${this.summarizeContextValue(meeting?.transcriptId)}`,
      `- Topics: ${this.summarizeContextValue(meeting?.topics)}`,
      `- Tasks: ${this.summarizeContextValue(meeting?.tasks)}`,
    ].join("\n");
  }

  private buildSearchText(meeting: any) {
    const parts = [
      meeting?.title,
      ...this.extractTaskLabels(meeting?.tasks),
      ...(Array.isArray(meeting?.topics)
        ? meeting.topics.map((topic: unknown) =>
            typeof topic === "string"
              ? topic
              : this.normalizeTopicItem(topic)?.title || "",
          )
        : []),
    ];

    return parts
      .filter((value) => typeof value === "string")
      .join(" ")
      .toLowerCase();
  }

  private tokenizeForSearch(value: string) {
    return (value.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(
      (token, index, array) => array.indexOf(token) === index,
    );
  }

  private normalizePlanKeywords(value: unknown) {
    if (!Array.isArray(value)) {
      return [] as string[];
    }

    return value
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
      .filter((entry, index, array) => array.indexOf(entry) === index)
      .slice(0, MingoAgentService.MAX_PLANNER_KEYWORDS);
  }

  private normalizePlanScope(value: unknown): RetrievalScope {
    if (
      value === "current_meeting" ||
      value === "related_meetings" ||
      value === "all_user_meetings"
    ) {
      return value;
    }

    return "current_meeting";
  }

  private normalizeTemporalDirection(value: unknown) {
    if (value === "past" || value === "future" || value === "any") {
      return value;
    }

    return "any";
  }

  private buildFallbackRetrievalPlan(userMessage: string): RetrievalPlan {
    const normalized = userMessage.toLowerCase();
    const searchOtherMeetings =
      /\b(previous|prior|before|earlier|last meeting|last week|other meetings?|compare|history|already discussed|follow[- ]?up)\b/.test(
        normalized,
      );

    return {
      scope: searchOtherMeetings ? "related_meetings" : "current_meeting",
      searchOtherMeetings,
      comparisonMode: /\b(compare|difference|changed)\b/.test(normalized),
      temporalDirection:
        /\b(previous|prior|before|earlier|last meeting|last week)\b/.test(
          normalized,
        )
          ? "past"
          : /\b(next|upcoming|future)\b/.test(normalized)
            ? "future"
            : "any",
      requestedEntities: this.normalizePlanKeywords(
        normalized.match(
          /\b(tasks?|action items?|decisions?|blockers?|participants?|topics?|summary|timeline|risks?)\b/g,
        ) || [],
      ),
      keywords: this.tokenizeForSearch(userMessage).slice(
        0,
        MingoAgentService.MAX_PLANNER_KEYWORDS,
      ),
      limit: searchOtherMeetings ? MingoAgentService.MAX_RELATED_MEETINGS : 0,
      rationale: "Fallback retrieval plan derived from the user message.",
    };
  }

  private parseRetrievalPlan(raw: string, userMessage: string): RetrievalPlan {
    const parseObject = (value: unknown): RetrievalPlan | null => {
      if (!value || typeof value !== "object") {
        return null;
      }

      const record = value as Record<string, unknown>;
      const scope = this.normalizePlanScope(record.scope);
      const searchOtherMeetings =
        typeof record.searchOtherMeetings === "boolean"
          ? record.searchOtherMeetings
          : scope !== "current_meeting";
      const requestedEntities = this.normalizePlanKeywords(
        record.requestedEntities,
      );
      const keywords = this.normalizePlanKeywords(record.keywords);
      const rawLimit =
        typeof record.limit === "number" ? Math.floor(record.limit) : 0;

      return {
        scope,
        searchOtherMeetings,
        comparisonMode: Boolean(record.comparisonMode),
        temporalDirection: this.normalizeTemporalDirection(
          record.temporalDirection,
        ),
        requestedEntities,
        keywords:
          keywords.length > 0
            ? keywords
            : this.tokenizeForSearch(userMessage).slice(
                0,
                MingoAgentService.MAX_PLANNER_KEYWORDS,
              ),
        limit: Math.max(
          0,
          Math.min(rawLimit || MingoAgentService.MAX_RELATED_MEETINGS, 6),
        ),
        rationale:
          typeof record.rationale === "string" && record.rationale.trim()
            ? record.rationale.trim()
            : "No planner rationale provided.",
      };
    };

    try {
      const direct = parseObject(JSON.parse(raw));
      if (direct) {
        return direct;
      }
    } catch {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = parseObject(JSON.parse(jsonMatch[0]));
          if (parsed) {
            return parsed;
          }
        } catch {
          // Fall through to fallback.
        }
      }
    }

    return this.buildFallbackRetrievalPlan(userMessage);
  }

  private async buildRetrievalPlan(
    meeting: any,
    history: ChatMessage[],
    userMessage: string,
  ) {
    const plannerPrompt = [
      "You are a retrieval planner for a meeting-management assistant.",
      "Your job is to decide what meeting data should be fetched before answering the user.",
      "Return valid JSON only.",
      'Use this schema: {"scope":"current_meeting|related_meetings|all_user_meetings","searchOtherMeetings":boolean,"comparisonMode":boolean,"temporalDirection":"past|future|any","requestedEntities":["..."],"keywords":["..."],"limit":number,"rationale":"..."}',
      "Choose current_meeting when the answer should come only from the current meeting.",
      "Choose related_meetings when the user refers to previous, similar, follow-up, or comparative meeting context.",
      "Choose all_user_meetings only when the request clearly needs a broad search across the user's meetings.",
      "Keywords should be short search phrases taken from the user's request and current meeting context.",
      "requestedEntities should include the business entities being asked for, such as tasks, blockers, decisions, participants, risks, or topics.",
      "Set a small limit between 1 and 6 when other meetings are needed.",
      "",
      this.formatMeetingSummary(meeting, "Current meeting"),
      "",
      "Recent chat history:",
      this.serializeHistory(history),
      "",
      `User message: ${userMessage}`,
      "",
      "JSON:",
    ].join("\n");

    try {
      const response = await this.runLlmGenerate({
        prompt: plannerPrompt,
        format: "json",
        options: {
          temperature: 0.1,
          top_p: 0.8,
          num_predict: 250,
        },
      });

      return this.parseRetrievalPlan(
        this.normalizeAssistantResponse(response.response),
        userMessage,
      );
    } catch {
      return this.buildFallbackRetrievalPlan(userMessage);
    }
  }

  private isMeetingVisibleToUser(meeting: any, userId?: string) {
    if (!userId) {
      return true;
    }

    const normalizedUserId = this.stringifyId(userId);
    if (!normalizedUserId) {
      return false;
    }

    if (this.stringifyId(meeting?.organizerId) === normalizedUserId) {
      return true;
    }

    return Array.isArray(meeting?.participants)
      ? meeting.participants.some(
          (participant: unknown) =>
            this.stringifyId(participant) === normalizedUserId,
        )
      : false;
  }

  private scoreRelatedMeeting(
    meeting: any,
    plan: RetrievalPlan,
    primaryMeeting: any,
  ) {
    let score = 0;
    const meetingText = this.buildSearchText(meeting);
    const primaryText = this.buildSearchText(primaryMeeting);
    const userTokens = plan.keywords;
    const primaryTokens = this.tokenizeForSearch(primaryText);

    for (const token of userTokens) {
      if (meetingText.includes(token)) {
        score += 5;
      }
    }

    for (const token of primaryTokens) {
      if (meetingText.includes(token)) {
        score += 2;
      }
    }

    if (
      this.stringifyId(meeting?.organizerId) ===
      this.stringifyId(primaryMeeting?.organizerId)
    ) {
      score += 1;
    }

    if (
      Array.isArray(meeting?.participants) &&
      Array.isArray(primaryMeeting?.participants)
    ) {
      const primaryParticipants = new Set(
        primaryMeeting.participants.map((participant: unknown) =>
          this.stringifyId(participant),
        ),
      );
      const overlap = meeting.participants.filter((participant: unknown) =>
        primaryParticipants.has(this.stringifyId(participant)),
      ).length;
      score += Math.min(overlap, 3);
    }

    for (const entity of plan.requestedEntities) {
      if (meetingText.includes(entity)) {
        score += 3;
      }
    }

    const meetingDate = new Date(meeting?.date || 0).getTime();
    const primaryDate = new Date(primaryMeeting?.date || 0).getTime();
    if (plan.temporalDirection === "past" && meetingDate <= primaryDate) {
      score += 2;
    }
    if (plan.temporalDirection === "future" && meetingDate >= primaryDate) {
      score += 2;
    }
    if (plan.comparisonMode) {
      score += 1;
    }

    if (
      score === 0 &&
      (plan.scope === "related_meetings" || plan.scope === "all_user_meetings")
    ) {
      score = 1;
    }

    return score;
  }

  private async findRelevantMeetings(
    userId: string | undefined,
    primaryMeeting: any,
    plan: RetrievalPlan,
  ) {
    if (!userId || !plan.searchOtherMeetings) {
      return [] as any[];
    }

    const meetingsQuery = this.meetings
      .find({
        _id: { $ne: primaryMeeting._id },
        $or: [{ organizerId: userId }, { participants: userId }],
      })
      .sort({ date: -1 })
      .limit(MingoAgentService.RELATED_MEETINGS_LOOKBACK);
    const populatedMeetingsQuery =
      meetingsQuery && typeof meetingsQuery.populate === "function"
        ? meetingsQuery.populate({
            path: "tasks",
            populate: { path: "assigneeId", select: "fullname email username" },
          })
        : meetingsQuery;
    const accessibleMeetings =
      populatedMeetingsQuery && typeof populatedMeetingsQuery.lean === "function"
        ? await populatedMeetingsQuery.lean()
        : await populatedMeetingsQuery;

    return (accessibleMeetings || [])
      .map((meeting: any) => ({
        meeting,
        score: this.scoreRelatedMeeting(meeting, plan, primaryMeeting),
      }))
      .filter((entry: { meeting: any; score: number }) => entry.score > 0)
      .sort(
        (
          left: { meeting: any; score: number },
          right: { meeting: any; score: number },
        ) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }

        const leftDate = new Date(left.meeting?.date || 0).getTime();
        const rightDate = new Date(right.meeting?.date || 0).getTime();
        return rightDate - leftDate;
        },
      )
      .slice(0, Math.max(0, Math.min(plan.limit, 6)))
      .map((entry: { meeting: any }) => entry.meeting);
  }

  private buildPrompt(
    meeting: any,
    plan: RetrievalPlan,
    relatedMeetings: any[],
    primaryTaskFacts: TaskFactSummary,
    relatedTaskFacts: TaskFactSummary[],
    history: ChatMessage[],
    userMessage: string,
  ) {
    return [
      "You are Mingo, an AI assistant for meeting management.",
      "You are Mingo, the AI assistant of a meeting-management system.",
      "Answer the user's question using the meeting context below.",
      "Keep the answer clear, practical, and concise.",
      "Your scope is the meeting domain only: meetings, agendas, summaries, action items, decisions, blockers, follow-ups, participants, scheduling implications, tasks, and meeting-related questions.",
      "Be generic within that domain so you can handle many different meeting-oriented requests without needing custom code paths.",
      "Treat the current meeting as the primary context.",
      "Use the retrieval plan only as search guidance. Answer only from the provided structured facts and meeting data.",
      "The structured task facts are the authoritative source for task titles, status, repositories, issue numbers, assignees, due dates, and counts.",
      "For task, action item, status, repository, or count questions, answer from the structured task facts first. Do not infer that there are no tasks from empty meeting.tasks arrays if task facts are present.",
      "When the task facts list an authoritative GitHub source, treat those live GitHub facts as newer than local meeting/task records for that repository.",
      "Use chat history only to understand conversational references. Never use assistant messages in chat history as factual evidence when structured facts are available.",
      "If the structured facts include aggregate counts, use those counts exactly instead of estimating from prose.",
      "If information is missing, say that clearly.",
      "If you offer a suggestion or inference, label it clearly as a suggestion or inference.",
      "If the user asks for something outside the meeting-management domain, briefly say that the request is outside Mingo's scope and steer the answer back to meeting-related help.",
      "Do not invent transcript details, participants, decisions, or tasks that are not present in the context.",
      "When using details from another meeting, name that meeting and/or date so the source is clear.",
      "If meetings conflict, say that explicitly instead of merging them.",
      "Prefer concise, useful answers. Use bullets only when they improve clarity.",
      "",
      "Retrieval plan:",
      this.formatContextAsJson(plan),
      "",
      this.formatMeetingSummary(meeting, "Primary meeting context"),
      "",
      "Primary meeting JSON:",
      this.formatContextAsJson(meeting),
      "",
      this.formatTaskFactSummary(primaryTaskFacts, "Primary meeting and repository"),
      "",
      "Primary task facts JSON:",
      this.formatContextAsJson(primaryTaskFacts),
      "",
      "Additional relevant meetings:",
      relatedMeetings.length
        ? relatedMeetings
            .map((relatedMeeting, index) =>
              this.formatMeetingSummary(
                relatedMeeting,
                `Related meeting ${index + 1}`,
              ),
            )
            .join("\n\n")
        : "No additional meetings were retrieved for this question.",
      "",
      "Additional meetings JSON:",
      relatedMeetings.length
        ? this.formatContextAsJson(relatedMeetings)
        : "[]",
      "",
      "Additional meeting task facts:",
      relatedTaskFacts.length
        ? relatedTaskFacts
            .map((summary, index) =>
              this.formatTaskFactSummary(summary, `Related meeting ${index + 1}`),
            )
            .join("\n\n")
        : "[]",
      "",
      this.buildReferenceHints(primaryTaskFacts, history, userMessage),
      "",
      "Recent chat history:",
      this.serializeHistory(history),
      "",
      `User message: ${userMessage}`,
      "",
      "Answer as Mingo:",
    ].join("\n");
  }

  private async getMeetingOrThrow(meetingId: string) {
    const meetingQuery = this.meetings.findById(meetingId);
    const populatedMeetingQuery =
      meetingQuery && typeof meetingQuery.populate === "function"
        ? meetingQuery.populate({
            path: "tasks",
            populate: { path: "assigneeId", select: "fullname email username" },
          })
        : meetingQuery;
    const meeting =
      populatedMeetingQuery && typeof populatedMeetingQuery.lean === "function"
        ? await populatedMeetingQuery.lean()
        : await populatedMeetingQuery;

    if (!meeting) {
      throw new MingoAgentError("Meeting not found", 404);
    }

    return meeting;
  }

  private async getMeetingForReplyOrThrow(meetingId: string, userId?: string) {
    const meeting = await this.getMeetingOrThrow(meetingId);

    if (!this.isMeetingVisibleToUser(meeting, userId)) {
      throw new MingoAgentError("Meeting not found", 404);
    }

    return meeting;
  }

  private async getOrCreateChat(meetingId: string) {
    const existingMeeting = await this.meetings.findById(meetingId);
    if (!existingMeeting) {
      throw new MingoAgentError("Meeting not found", 404);
    }

    let chat = null;

    if (existingMeeting.mingoAgentId) {
      chat = await this.chats.findById(existingMeeting.mingoAgentId);
    }

    if (!chat) {
      chat = await this.chats.findOne({ meetingID: meetingId });
    }

    if (!chat) {
      chat = await this.chats.create({
        meetingID: meetingId,
        messages: [],
      });
    }

    const chatId = chat._id;
    if (
      !existingMeeting.mingoAgentId ||
      String(existingMeeting.mingoAgentId) !== String(chatId)
    ) {
      (existingMeeting as any).mingoAgentID = chatId;
      await existingMeeting.save();
    }

    return chat;
  }

  async getMeetingChat(meetingId: string) {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const chat = await this.getOrCreateChat(meetingId);
    return chat;
  }

  async generateReply(
    meetingId: string,
    message: string,
    userId?: string,
  ): Promise<AgentReply> {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const normalizedMessage = this.normalizeInput(message);
    if (!normalizedMessage) {
      throw new MingoAgentError("Message is required", 400);
    }

    const meeting = await this.getMeetingForReplyOrThrow(meetingId, userId);
    const chat = await this.getOrCreateChat(meetingId);

    const existingMessages = Array.isArray(chat.messages)
      ? (chat.messages as ChatMessage[])
      : [];
    const recentHistory = existingMessages.slice(-10).map((entry) => ({
      sender: entry.sender,
      content: entry.content,
      timestamp: new Date(entry.timestamp),
    }));

    const userMessage: ChatMessage = {
      sender: "user",
      content: normalizedMessage,
      timestamp: new Date(),
    };

    const retrievalPlan = await this.buildRetrievalPlan(
      meeting,
      recentHistory,
      normalizedMessage,
    );
    const relatedMeetings = await this.findRelevantMeetings(
      userId,
      meeting,
      retrievalPlan,
    );
    const primaryTaskFacts = await this.loadTaskFactsForMeeting(meeting, userId);
    const relatedTaskFacts = await Promise.all(
      relatedMeetings.map((relatedMeeting) =>
        this.loadTaskFactsForMeeting(relatedMeeting, userId),
      ),
    );

    const prompt = this.buildPrompt(
      meeting,
      retrievalPlan,
      relatedMeetings,
      primaryTaskFacts,
      relatedTaskFacts,
      recentHistory,
      normalizedMessage,
    );

    let reply = "";
    try {
      const response = await this.runLlmGenerate({
        prompt,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 400,
        },
      });

      reply = this.normalizeAssistantResponse(response.response);
    } catch (error) {
      if (error instanceof MingoAgentError) {
        throw error;
      }
      reply = this.buildFallbackReply(
        meeting,
        normalizedMessage,
        relatedMeetings,
      );
    }

    if (!reply) {
      reply = this.buildFallbackReply(meeting, normalizedMessage, relatedMeetings);
    }

    const assistantMessage: ChatMessage = {
      sender: "mingo",
      content: reply,
      timestamp: new Date(),
    };

    const updatedMessages = [
      ...existingMessages,
      userMessage,
      assistantMessage,
    ];
    (chat as any).messages = updatedMessages;
    await chat.save();

    return {
      chat,
      reply,
      messages: updatedMessages,
    };
  }

  async generateSummary(meetingId: string): Promise<{ summary: string }> {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const meeting = await this.getMeetingOrThrow(meetingId);

    const summaryPrompt = [
      "You are Mingo, an AI assistant for meeting management.",
      "Generate a concise summary of the key points, decisions, action items, and topics from the meeting based on the following context.",
      "Use only the provided meeting data as facts. Do not invent details that are not present in the context.",
      "",
      "Meeting context summary:",
      `Title: ${this.summarizeContextValue(meeting?.title)}`,
      `Date: ${
        meeting?.date instanceof Date
          ? meeting.date.toISOString()
          : meeting?.date
            ? new Date(meeting.date).toISOString()
            : "Not available"
      }`,
      `Duration: ${this.summarizeContextValue(meeting?.duration)}`,
      `Organizer ID: ${this.summarizeContextValue(meeting?.organizerId)}`,
      `Participants: ${this.summarizeContextValue(meeting?.participants)}`,
      `Transcript ID: ${this.summarizeContextValue(meeting?.transcriptId)}`,
      `Topics: ${this.summarizeContextValue(meeting?.topics)}`,
      `Tasks: ${this.summarizeContextValue(meeting?.tasks)}`,
      "",
      "Meeting context JSON:",
      this.formatContextAsJson(meeting),
      "",
      "Summary as Mingo:",
    ].join("\n");

    let summary = "";
    try {
      const response = await this.runLlmGenerate({
        prompt: summaryPrompt,
        options: {
          temperature: 0.2,
          top_p: 0.9,
          num_predict: 400,
        },
      });

      summary = this.normalizeAssistantResponse(response.response);
    } catch (error) {
      if (error instanceof MingoAgentError) {
        throw error;
      }
      summary = this.buildFallbackSummary(meeting);
    }

    if (!summary) {
      summary = this.buildFallbackSummary(meeting);
    }

    return { summary };
  }

  async generateTopics(meetingId: string): Promise<{ topics: TopicItem[] }> {
    if (!meetingId) {
      throw new MingoAgentError("Meeting ID is required", 400);
    }

    const meeting = await this.getMeetingOrThrow(meetingId);

    const topicsPrompt = [
      "You are Mingo, an AI assistant for meeting management.",
      "Based on the following meeting context, generate a list of concise topics that were discussed in the meeting.",
      "Use only the provided meeting data as facts. Do not invent details that are not present in the context.",
      "",
      "Meeting context summary:",
      `Title: ${this.summarizeContextValue(meeting?.title)}`,
      `Date: ${
        meeting?.date instanceof Date
          ? meeting.date.toISOString()
          : meeting?.date
            ? new Date(meeting.date).toISOString()
            : "Not available"
      }`,
      `Duration: ${this.summarizeContextValue(meeting?.duration)}`,
      `Organizer ID: ${this.summarizeContextValue(meeting?.organizerId)}`,
      `Participants: ${this.summarizeContextValue(meeting?.participants)}`,
      `Transcript ID: ${this.summarizeContextValue(meeting?.transcriptId)}`,
      `Topics: ${this.summarizeContextValue(meeting?.topics)}`,
      `Tasks: ${this.summarizeContextValue(meeting?.tasks)}`,
      "",
      "Meeting context JSON:",
      this.formatContextAsJson(meeting),
      "",
      'Topics as Mingo (return as JSON array of objects like [{"title":"...","description":"..."}]):',
    ].join("\n");

    let topicsResponse = "";
    try {
      try {
        const response = await this.runLlmGenerate({
          prompt: topicsPrompt,
          format: "json",
          options: {
            temperature: 0.2,
            top_p: 0.9,
            num_predict: 400,
          },
        });

        topicsResponse = this.normalizeAssistantResponse(response.response);
      } catch {
        const response = await this.runLlmGenerate({
          prompt: topicsPrompt,
          options: {
            temperature: 0.2,
            top_p: 0.9,
            num_predict: 400,
          },
        });

        topicsResponse = this.normalizeAssistantResponse(response.response);
      }
    } catch (error) {
      if (error instanceof MingoAgentError) {
        throw error;
      }
      return { topics: this.buildFallbackTopics(meeting) };
    }

    if (!topicsResponse) {
      throw new MingoAgentError(
        "The LLM returned an empty topics response",
        502,
      );
    }

    try {
      const topics = this.parseTopicsResponse(topicsResponse);
      return { topics };
    } catch (error) {
      return { topics: this.buildFallbackTopics(meeting) };
    }

  }

  async generateTaskSuggestions(
    transcriptContent: string,
  ): Promise<{ tasks: Array<{ title: string; description: string }> }> {
    if (!transcriptContent?.trim()) {
      return { tasks: [] };
    }

    const truncated = transcriptContent.slice(0, 4000);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.warn("[TaskSuggestions] OPENAI_API_KEY not set");
      return { tasks: [] };
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.1,
          max_tokens: 700,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                'You extract action items from meeting transcripts. Return ONLY valid JSON in this exact shape: {"tasks":[{"title":"...","description":"..."}]}. Limit to 8 tasks. If none found return {"tasks":[]}.',
            },
            {
              role: "user",
              content: `Extract action items from this transcript:\n\n${truncated}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        console.error("[TaskSuggestions] OpenAI error:", response.status);
        return { tasks: [] };
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim() ?? "";
      const parsed: unknown = JSON.parse(content);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        !Array.isArray((parsed as { tasks?: unknown }).tasks)
      ) {
        return { tasks: [] };
      }

      const tasks = ((parsed as { tasks: unknown[] }).tasks)
        .filter(
          (item): item is { title: unknown; description?: unknown } =>
            Boolean(item) && typeof item === "object",
        )
        .map((item) => ({
          title: typeof item.title === "string" ? item.title.trim() : "",
          description:
            typeof item.description === "string" ? item.description.trim() : "",
        }))
        .filter((task) => task.title.length > 0)
        .slice(0, 8);

      return { tasks };
    } catch (err) {
      console.error("[TaskSuggestions] Error:", err);
      return { tasks: [] };
    }
  }
}

export default new MingoAgentService();
export { MingoAgentService };
