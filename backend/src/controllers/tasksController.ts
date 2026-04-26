import { Response } from "express";
import mongoose from "mongoose";
import tasksModel from "../models/tasksModel";
import meetingsModel from "../models/meetingsModel";
import usersModel from "../models/usersModel";
import { AuthRequest } from "../middleware/authMiddleware";
import baseController from "./baseController";

type CachedGitHubTasks = {
  expiresAt: number;
  data: any[];
};

const GITHUB_TASKS_CACHE_MS = 2 * 60 * 1000;
const githubTasksCache = new Map<string, CachedGitHubTasks>();

class tasksController extends baseController {
  constructor() {
    super(tasksModel);
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

  private async fetchGitHubJson<T>(url: string, authorization: string) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: authorization,
        "User-Agent": "Mingo",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  }

  private async fetchGitHubGraphQl<T>(
    authorization: string,
    query: string,
    variables: Record<string, unknown>,
  ) {
    const response = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: authorization,
        "Content-Type": "application/json",
        "User-Agent": "Mingo",
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as {
      data?: T;
      errors?: Array<{ message?: string }>;
    };

    if (payload.errors?.length) {
      return null;
    }

    return payload.data || null;
  }

  private normalizeRepoName(value?: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
  }

  private parseRepoQuery(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.flatMap((entry) => this.parseRepoQuery(entry));
    }

    if (typeof value !== "string") {
      return [];
    }

    return value
      .split(",")
      .map((repoName) => repoName.trim())
      .filter(Boolean);
  }

  private resolveStatusFromIssue(issue: { state?: string; labels?: Array<{ name?: string }> }) {
    if (issue.state === "closed") {
      return "Done";
    }

    const labels = issue.labels || [];
    const names = labels.map((label) => label.name?.toLowerCase() || "");

    if (names.some((name) => name.includes("progress") || name.includes("doing"))) {
      return "In Progress";
    }

    return "To Do";
  }

  private resolveStatusFromProjectValue(value?: string) {
    const normalized = value?.toLowerCase() || "";

    if (normalized.includes("done") || normalized.includes("complete")) {
      return "Done";
    }

    if (
      normalized.includes("progress") ||
      normalized.includes("doing") ||
      normalized.includes("review")
    ) {
      return "In Progress";
    }

    return "To Do";
  }

  private getProjectFieldValue(
    fieldValues: Array<{
      name?: string;
      date?: string;
      users?: { nodes?: Array<{ login?: string; name?: string }> };
      field?: { name?: string };
    }>,
    fieldNames: string[],
  ) {
    const normalizedFieldNames = fieldNames.map((name) => name.toLowerCase());
    return fieldValues.find((fieldValue) =>
      normalizedFieldNames.includes(fieldValue.field?.name?.toLowerCase() || ""),
    );
  }

  private parseGitHubProjectUrl(value?: unknown) {
    if (typeof value !== "string" || !value.trim()) {
      return null;
    }

    const match = value
      .trim()
      .match(/github\.com\/(?:users|orgs)\/([^/]+)\/projects\/(\d+)/i);

    if (!match?.[1] || !match?.[2]) {
      return null;
    }

    return {
      owner: match[1],
      number: Number(match[2]),
      ownerType: (value.trim().toLowerCase().includes("github.com/orgs/")
        ? "organization"
        : "user") as "user" | "organization",
    };
  }

  private buildProjectTaskFromItem(
    project: { id: string; title: string },
    item: {
      id: string;
      content?: {
        title?: string;
        body?: string;
        number?: number;
        state?: string;
        url?: string;
        assignees?: { nodes?: Array<{ login?: string }> };
        labels?: { nodes?: Array<{ name?: string }> };
        milestone?: { dueOn?: string | null } | null;
        repository?: { nameWithOwner?: string } | null;
      } | null;
      fieldValues?: {
        nodes?: Array<{
          name?: string;
          date?: string;
          users?: { nodes?: Array<{ login?: string; name?: string }> };
          field?: { name?: string };
        }>;
      };
    },
    fallbackRepoName: string,
    relatedMeeting: any,
    userId: string,
  ) {
    const fieldValues = item.fieldValues?.nodes || [];
    const statusValue = this.getProjectFieldValue(fieldValues, ["Status"]);
    const dueValue = this.getProjectFieldValue(fieldValues, [
      "Due date",
      "Due Date",
      "Due",
      "Deadline",
    ]);
    const assigneeValue = this.getProjectFieldValue(fieldValues, [
      "Assignees",
      "Assignee",
      "Owner",
    ]);
    const labels = item.content?.labels?.nodes || [];
    const assignees = item.content?.assignees?.nodes || [];
    const fieldAssignees = assigneeValue?.users?.nodes || [];
    const assigneeName =
      fieldAssignees[0]?.login ||
      fieldAssignees[0]?.name ||
      assignees[0]?.login ||
      "Unassigned";
    const repoName = item.content?.repository?.nameWithOwner || fallbackRepoName;

    return {
      _id: `github-project:${project.id}:${item.id}`,
      title: item.content?.title,
      description: item.content?.body,
      assigneeName,
      dueDate: dueValue?.date || item.content?.milestone?.dueOn || undefined,
      status: statusValue?.name
        ? this.resolveStatusFromProjectValue(statusValue.name)
        : this.resolveStatusFromIssue({
            ...(item.content?.state
              ? { state: item.content.state.toLowerCase() }
              : {}),
            labels,
          }),
      gitHubIssueId: item.content?.number,
      gitHubRepoName: repoName,
      gitHubRepoOwner: userId,
      source: "github",
      sourceType: "project",
      projectTitle: project.title,
      htmlUrl: item.content?.url,
      meeting: relatedMeeting
        ? {
            _id: relatedMeeting._id,
            title: relatedMeeting.title,
            date: relatedMeeting.date,
            gitHubRepoName: relatedMeeting.gitHubRepoName,
          }
        : null,
    };
  }

  private async getGitHubProjectTasksByOwner(
    owner: string,
    number: number,
    ownerType: "user" | "organization",
    authorization: string,
    userId: string,
  ) {
    const ownerField = ownerType === "organization" ? "organization" : "user";
    const fallbackOwnerType = ownerType === "organization" ? "orgs" : "users";
    const data = await this.fetchGitHubGraphQl<{
      user?: {
        projectV2?: {
          id: string;
          title: string;
          items?: {
            nodes?: Array<{
              id: string;
              content?: {
                __typename?: string;
                title?: string;
                body?: string;
                number?: number;
                state?: string;
                url?: string;
                repository?: { nameWithOwner?: string } | null;
                assignees?: { nodes?: Array<{ login?: string }> };
                labels?: { nodes?: Array<{ name?: string }> };
                milestone?: { dueOn?: string | null } | null;
              } | null;
              fieldValues?: {
                nodes?: Array<{
                  name?: string;
                  date?: string;
                  users?: { nodes?: Array<{ login?: string; name?: string }> };
                  field?: { name?: string };
                }>;
              };
            }>;
          };
        } | null;
      };
      organization?: {
        projectV2?: {
          id: string;
          title: string;
          items?: {
            nodes?: Array<{
              id: string;
              content?: {
                __typename?: string;
                title?: string;
                body?: string;
                number?: number;
                state?: string;
                url?: string;
                repository?: { nameWithOwner?: string } | null;
                assignees?: { nodes?: Array<{ login?: string }> };
                labels?: { nodes?: Array<{ name?: string }> };
                milestone?: { dueOn?: string | null } | null;
              } | null;
              fieldValues?: {
                nodes?: Array<{
                  name?: string;
                  date?: string;
                  users?: { nodes?: Array<{ login?: string; name?: string }> };
                  field?: { name?: string };
                }>;
              };
            }>;
          };
        } | null;
      };
    }>(
      authorization,
      `
        query ProjectByOwner($owner: String!, $number: Int!) {
          ${ownerField}(login: $owner) {
            projectV2(number: $number) {
              id
              title
              items(first: 100) {
                nodes {
                  id
                  content {
                    __typename
                    ... on Issue {
                      title
                      number
                      state
                      url
                      repository { nameWithOwner }
                      assignees(first: 5) { nodes { login } }
                      labels(first: 10) { nodes { name } }
                      milestone { dueOn }
                    }
                    ... on DraftIssue {
                      title
                      body
                      assignees(first: 5) { nodes { login } }
                    }
                  }
                  fieldValues(first: 20) {
                    nodes {
                      ... on ProjectV2ItemFieldSingleSelectValue {
                        name
                        field { ... on ProjectV2SingleSelectField { name } }
                      }
                      ... on ProjectV2ItemFieldDateValue {
                        date
                        field { ... on ProjectV2FieldCommon { name } }
                      }
                      ... on ProjectV2ItemFieldUserValue {
                        users(first: 5) { nodes { login name } }
                        field { ... on ProjectV2FieldCommon { name } }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { owner, number },
    );

    const project =
      ownerType === "organization"
        ? data?.organization?.projectV2
        : data?.user?.projectV2;

    if (!project) {
      return [];
    }

    return (project.items?.nodes || [])
      .filter((item) => item.content?.title)
      .map((item) =>
        this.buildProjectTaskFromItem(
          { id: project.id, title: project.title },
          item,
          `${fallbackOwnerType}/${owner}/projects/${number}`,
          null,
          userId,
        ),
      );
  }

  private async getGitHubProjectTasksForRepo(
    repo: { id: number; name: string; full_name: string },
    authorization: string,
    relatedMeeting: any,
    userId: string,
  ) {
    const [owner, name] = repo.full_name.split("/");

    if (!owner || !name) {
      return [];
    }

    const data = await this.fetchGitHubGraphQl<{
      repository?: {
        projectsV2?: {
          nodes?: Array<{
            id: string;
            title: string;
            items?: {
              nodes?: Array<{
                id: string;
                content?: {
                  __typename?: string;
                  title?: string;
                  body?: string;
                  number?: number;
                  state?: string;
                  url?: string;
                  assignees?: { nodes?: Array<{ login?: string }> };
                  labels?: { nodes?: Array<{ name?: string }> };
                  milestone?: { dueOn?: string | null } | null;
                } | null;
                fieldValues?: {
                  nodes?: Array<{
                    name?: string;
                    date?: string;
                    users?: { nodes?: Array<{ login?: string; name?: string }> };
                    field?: { name?: string };
                  }>;
                };
              }>;
            };
          }>;
        };
      };
    }>(
      authorization,
      `
        query RepositoryProjects($owner: String!, $name: String!) {
          repository(owner: $owner, name: $name) {
            projectsV2(first: 20) {
              nodes {
                id
                title
                items(first: 100) {
                  nodes {
                    id
                    content {
                      __typename
                      ... on Issue {
                        title
                        number
                        state
                        url
                        repository { nameWithOwner }
                        assignees(first: 5) { nodes { login } }
                        labels(first: 10) { nodes { name } }
                        milestone { dueOn }
                      }
                      ... on DraftIssue {
                        title
                        body
                        assignees(first: 5) { nodes { login } }
                      }
                    }
                    fieldValues(first: 20) {
                      nodes {
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          name
                          field { ... on ProjectV2SingleSelectField { name } }
                        }
                        ... on ProjectV2ItemFieldDateValue {
                          date
                          field { ... on ProjectV2FieldCommon { name } }
                        }
                        ... on ProjectV2ItemFieldUserValue {
                          users(first: 5) { nodes { login name } }
                          field { ... on ProjectV2FieldCommon { name } }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `,
      { owner, name },
    );

    const projects = data?.repository?.projectsV2?.nodes || [];

    return projects.flatMap((project) =>
      (project.items?.nodes || [])
        .filter((item) => item.content?.title)
        .map((item) => {
          return this.buildProjectTaskFromItem(
            { id: project.id, title: project.title },
            item,
            repo.full_name,
            relatedMeeting,
            userId,
          );
        }),
    );
  }

  private async getGitHubTasksForUser(userId: string, requestedRepoNames: string[] = []) {
    const user = await usersModel.findById(userId);
    const authorization = this.getGitHubAuthorization(user);

    if (!authorization) {
      return [];
    }

    const normalizedUserId = mongoose.Types.ObjectId.isValid(userId)
      ? new mongoose.Types.ObjectId(userId)
      : userId;

    const meetings = await meetingsModel
      .find({
        $or: [
          { organizerId: normalizedUserId },
          { participants: normalizedUserId },
        ],
        gitHubRepoName: { $type: "string", $ne: "" },
      })
      .sort({ date: -1 });

    const repoNames = Array.from(
      new Set(
        (requestedRepoNames.length > 0
          ? requestedRepoNames
          : meetings.map((meeting) => meeting.gitHubRepoName)
        ).map((repoName) => this.normalizeRepoName(repoName)),
      ),
    ).filter(Boolean);

    if (repoNames.length === 0) {
      return [];
    }

    const repos = await this.fetchGitHubJson<
      Array<{
        id: number;
        name: string;
        full_name: string;
        owner?: { login?: string };
      }>
    >("https://api.github.com/user/repos?sort=updated&per_page=100", authorization);

    if (!repos) {
      return [];
    }

    const repoByName = new Map<string, { id: number; name: string; full_name: string }>();
    repos.forEach((repo) => {
      repoByName.set(this.normalizeRepoName(repo.name), repo);
      repoByName.set(this.normalizeRepoName(repo.full_name), repo);
    });

    const matchedRepos = repoNames
      .map((repoName) => repoByName.get(repoName))
      .filter((repo): repo is { id: number; name: string; full_name: string } => Boolean(repo));

    const issueGroups = await Promise.all(
      matchedRepos.map(async (repo) => {
        const issues = await this.fetchGitHubJson<
          Array<{
            id: number;
            number: number;
            title: string;
            state: string;
            html_url: string;
            assignee?: { login?: string } | null;
            labels?: Array<{ name?: string }>;
            pull_request?: unknown;
            milestone?: { due_on?: string | null } | null;
            created_at?: string;
            updated_at?: string;
          }>
        >(
          `https://api.github.com/repos/${repo.full_name}/issues?state=all&per_page=100&sort=updated`,
          authorization,
        );

        return {
          repo,
          issues: (issues || []).filter((issue) => !issue.pull_request),
        };
      }),
    );

    const issueTasks = issueGroups.flatMap(({ repo, issues }) =>
      issues.map((issue) => {
        const relatedMeeting = meetings.find((meeting) => {
          const meetingRepo = this.normalizeRepoName(meeting.gitHubRepoName);
          return (
            meetingRepo === this.normalizeRepoName(repo.name) ||
            meetingRepo === this.normalizeRepoName(repo.full_name)
          );
        });

        return {
          _id: `github:${repo.id}:${issue.number}`,
          title: issue.title,
          assigneeName: issue.assignee?.login || "Unassigned",
          dueDate: issue.milestone?.due_on || undefined,
          status: this.resolveStatusFromIssue(issue),
          gitHubIssueId: issue.number,
          gitHubRepoName: repo.full_name,
          gitHubRepoOwner: userId,
          source: "github",
          sourceType: "issue",
          htmlUrl: issue.html_url,
          createdAt: issue.created_at,
          updatedAt: issue.updated_at,
          meeting: relatedMeeting
            ? {
                _id: relatedMeeting._id,
                title: relatedMeeting.title,
                date: relatedMeeting.date,
                gitHubRepoName: relatedMeeting.gitHubRepoName,
              }
            : null,
        };
      }),
    );

    return issueTasks;
  }

  private normalizeStatus(value: unknown) {
    return value === "Done" || value === "In Progress" || value === "To Do"
      ? value
      : "To Do";
  }

  private buildTaskPayload(
    body: any,
    fallbackOwnerId?: string,
    includeDefaults = false,
  ) {
    const payload: Record<string, unknown> = {
      title:
        typeof body.title === "string" && body.title.trim()
          ? body.title.trim()
          : undefined,
      description:
        typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : undefined,
      assigneeId:
        typeof body.assigneeId === "string" && body.assigneeId.trim()
          ? body.assigneeId.trim()
          : undefined,
      assigneeName:
        typeof body.assigneeName === "string" && body.assigneeName.trim()
          ? body.assigneeName.trim()
          : undefined,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      status:
        body.status !== undefined || includeDefaults
          ? this.normalizeStatus(body.status)
          : undefined,
      gitHubIssueId:
        typeof body.gitHubIssueId === "number" ? body.gitHubIssueId : undefined,
      gitHubRepoName:
        typeof body.gitHubRepoName === "string" && body.gitHubRepoName.trim()
          ? body.gitHubRepoName.trim()
          : undefined,
      gitHubRepoOwner:
        typeof body.gitHubRepoOwner === "string" && body.gitHubRepoOwner.trim()
          ? body.gitHubRepoOwner.trim()
          : fallbackOwnerId,
    };

    if (payload.dueDate instanceof Date && Number.isNaN(payload.dueDate.getTime())) {
      delete payload.dueDate;
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });

    return payload;
  }

  async getByMeetingId(req: AuthRequest, res: Response) {
    const { meetingId } = req.params;

    if (!meetingId) {
      return res.status(400).json({ error: "Meeting ID is required" });
    }

    try {
      const meeting = await meetingsModel.findById(meetingId).populate({
        path: "tasks",
        populate: { path: "assigneeId", select: "fullname email username" },
      });

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

      const task = await this.model
        .findById(taskId)
        .populate("assigneeId", "fullname email username");

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
      const normalizedUserId = mongoose.Types.ObjectId.isValid(userId)
        ? new mongoose.Types.ObjectId(userId)
        : userId;

      const tasks = await this.model
        .find({
          $or: [
            { gitHubRepoOwner: normalizedUserId },
            { assigneeId: normalizedUserId },
          ],
        })
        .populate("assigneeId", "fullname email username")
        .sort({ updatedAt: -1, createdAt: -1 });

      const taskIds = tasks.map((task: any) => task._id);
      const meetings = await meetingsModel
        .find({ tasks: { $in: taskIds } }, "title date gitHubRepoName tasks")
        .sort({ date: -1 });

      const meetingByTaskId = new Map<string, any>();
      meetings.forEach((meeting: any) => {
        meeting.tasks.forEach((taskId: mongoose.Types.ObjectId) => {
          const key = taskId.toString();
          if (!meetingByTaskId.has(key)) {
            meetingByTaskId.set(key, meeting);
          }
        });
      });

      const localTasks = tasks.map((task: any) => {
          const taskObject = task.toObject ? task.toObject() : task;
          const meeting = meetingByTaskId.get(task._id.toString());

          return {
            ...taskObject,
            meeting: meeting
              ? {
                  _id: meeting._id,
                  title: meeting.title,
                  date: meeting.date,
                  gitHubRepoName: meeting.gitHubRepoName,
                }
              : null,
          };
        });
      const requestedRepoNames = this.parseRepoQuery(req.query.repo);
      const projectQuery =
        typeof req.query.project === "string" ? req.query.project : "";
      const projectRef = this.parseGitHubProjectUrl(projectQuery);
      const authorization = this.getGitHubAuthorization(await usersModel.findById(userId));
      const githubCacheKey = `${userId}:${
        requestedRepoNames.length > 0
          ? `repo:${requestedRepoNames.map((repoName) => this.normalizeRepoName(repoName)).join(",")}`
          : projectQuery
            ? `project:${projectQuery}`
            : "repos-from-meetings"
      }`;
      const cachedGithubTasks = githubTasksCache.get(githubCacheKey);
      let githubTasks: any[] = [];

      if (cachedGithubTasks && cachedGithubTasks.expiresAt > Date.now()) {
        githubTasks = cachedGithubTasks.data;
      } else {
        githubTasks = requestedRepoNames.length > 0
          ? await this.getGitHubTasksForUser(userId, requestedRepoNames)
          : projectRef && authorization
          ? await this.getGitHubProjectTasksByOwner(
              projectRef.owner,
              projectRef.number,
              projectRef.ownerType,
              authorization,
              userId,
            )
          : await this.getGitHubTasksForUser(userId);

        githubTasksCache.set(githubCacheKey, {
          expiresAt: Date.now() + GITHUB_TASKS_CACHE_MS,
          data: githubTasks,
        });
      }
      const localGithubKeys = new Set(
        localTasks
          .filter((task: any) => task.gitHubIssueId && task.gitHubRepoName)
          .map(
            (task: any) =>
              `${this.normalizeRepoName(task.gitHubRepoName)}#${task.gitHubIssueId}`,
          ),
      );
      const githubTaskPool = githubTasks;
      const seenRemoteKeys = new Set<string>();
      const remoteOnlyGithubTasks = githubTaskPool.filter(
        (task: any) =>
          {
            const key = task.gitHubIssueId
              ? `${this.normalizeRepoName(task.gitHubRepoName)}#${task.gitHubIssueId}`
              : String(task._id);

            if (localGithubKeys.has(key) || seenRemoteKeys.has(key)) {
              return false;
            }

            seenRemoteKeys.add(key);
            return true;
          },
      );

      return res.json(
        [...localTasks, ...remoteOnlyGithubTasks].sort((left: any, right: any) => {
          const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
          const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
          return rightTime - leftTime;
        }),
      );
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

      const payload = this.buildTaskPayload(req.body, req.user?._id, true);

      if (!payload.title && !payload.gitHubIssueId) {
        res.status(400).json({ error: "Task title is required" });
        return;
      }

      const task = await this.model.create(payload);
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

      const payload = this.buildTaskPayload(req.body);
      const updatedTask = await this.model
        .findByIdAndUpdate(taskId, payload, {
          new: true,
        })
        .populate("assigneeId", "fullname email username");

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
