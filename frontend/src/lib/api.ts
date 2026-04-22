import axios from "axios";
import { clearSession, getToken } from "./auth";

export type ApiUser = {
  _id: string;
  username: string;
  fullname?: string;
  email: string;
  profilePicture?: string;
};

export type AuthResponse = {
  token: string;
  refreshToken: string;
  user: ApiUser;
};

export type Meeting = {
  _id: string;
  title: string;
  date: string;
  duration?: number;
  organizerId: string;
  participants: string[];
  transcriptId: string;
  topics?: string[];
  tasks: string[];
  mingoAgentId?: string;
};

export type Transcript = {
  _id: string;
  meetingID: string;
  date: string;
  content: string;
};

export type MeetingTask = {
  _id: string;
  gitHubIssueId: number;
  gitHubRepoName: string;
  gitHubRepoOwner: string;
};

export type TranscriptCreateResponse = {
  text: string;
  transcription: string;
  meeting: Meeting;
  transcript: Transcript;
};

export const api = axios.create({
  baseURL: "/api",
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearSession();
    }
    return Promise.reject(error);
  },
);

export async function login(payload: { username: string; password: string }) {
  const response = await api.post<AuthResponse>("/auth/login", payload);
  return response.data;
}

export async function register(payload: {
  username: string;
  email: string;
  password: string;
  fullname?: string;
}) {
  const response = await api.post<AuthResponse>("/auth/register", payload);
  return response.data;
}

export async function getMeetingsByUser(userId: string) {
  const response = await api.get<Meeting[]>(`/meetings/meetings/${userId}`);
  return response.data;
}

export async function getUpcomingMeetings(userId: string) {
  const response = await api.get<Meeting[]>(`/meetings/meetings/${userId}/upcoming`);
  return response.data;
}

export async function getRecentMeetings(userId: string) {
  const response = await api.get<Meeting[]>(`/meetings/meetings/${userId}/recent`);
  return response.data;
}

export async function getLastMonthMeetings(userId: string) {
  const response = await api.get<Meeting[]>(`/meetings/meetings/${userId}/last-month`);
  return response.data;
}

export async function getAverageDuration(userId: string) {
  const response = await api.get<{ averageDuration: number }>(
    `/meetings/meetings/${userId}/average-duration`,
  );
  return response.data;
}

export async function getMeetingById(meetingId: string) {
  const response = await api.get<Meeting>(`/meetings/meetings/${meetingId}`);
  return response.data;
}

export async function getTranscriptByMeetingId(meetingId: string) {
  const response = await api.get<Transcript | null>(`/transcripts/${meetingId}`);
  return response.data;
}

export async function getMeetingTasks(meetingId: string) {
  const response = await api.get<MeetingTask[]>(`/meetings/${meetingId}/tasks`);
  return response.data;
}

export async function getUserTasks(userId: string) {
  const response = await api.get<MeetingTask[]>(`/users/${userId}/tasks`);
  return response.data;
}

export async function createTask(
  meetingId: string,
  payload: Pick<MeetingTask, "gitHubIssueId" | "gitHubRepoName" | "gitHubRepoOwner">,
) {
  const response = await api.post<MeetingTask>(`/meetings/${meetingId}/tasks`, payload);
  return response.data;
}

export async function deleteTask(meetingId: string, taskId: string) {
  const response = await api.delete<MeetingTask>(`/meetings/${meetingId}/tasks/${taskId}`);
  return response.data;
}

export async function createMeetingFromText(payload: {
  title?: string;
  date?: string;
  content: string;
}) {
  const response = await api.post<TranscriptCreateResponse>("/transcript/text", payload);
  return response.data;
}

export async function uploadMeetingAudio(formData: FormData) {
  const response = await api.post<TranscriptCreateResponse>("/transcript/mp3", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}
