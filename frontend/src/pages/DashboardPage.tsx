import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import StartMeetingModal from '../components/StartMeetingModal/StartMeetingModal';
import NewFutureMeetingModal from '../components/NewFutureMeetingModal/NewFutureMeetingModal';
import UploadMeetingModal from '../components/UploadMeetingModal/UploadMeetingModal';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../lib/auth';
import './MeetingPage.css';
import './HistoryPage.css';
import './DashboardPage.css';

type DashboardMeeting = {
  id: string;
  title: string;
  scheduledAt: string;
  date: string;
  dateLabel: string;
  timeLabel: string;
  duration: string;
  recordingDuration?: string;
  status: 'Completed' | 'Upcoming' | 'Live';
  summary: string;
  repoTag: string;
  repository: string;
  tasksCount: number;
  gitHubRepoName?: string;
  participants: number;
  participantLabels: string[];
  attendees: DraftAttendee[];
  isTranscribed: boolean;
  transcript?: string;
};

type DraftAttendee = {
  email: string;
  displayName: string;
  isRegistered: boolean;
};

type RawParticipant = {
  _id?: string;
  fullname?: string;
  username?: string;
  email?: string;
};

type RawMeeting = {
  _id: string;
  title: string;
  date: string;
  duration?: number;
  status?: 'upcoming' | 'live' | 'completed';
  summary?: string;
  gitHubRepoName?: string;
  participants?: RawParticipant[];
  inviteEmails?: string[];
  tasks?: string[];
  transcriptId?: string;
  mingoAgentId?: string;
};

type AverageDurationResponse = {
  averageDuration?: number;
};

type DashboardUserResponse = {
  fullname?: string;
  username?: string;
  email?: string;
};

type RawDashboardTask = {
  _id: string;
  title?: string;
  description?: string;
  assigneeId?: RawParticipant | string;
  assigneeName?: string;
  dueDate?: string;
  status?: 'To Do' | 'Done';
  gitHubIssueId?: number;
  gitHubRepoName?: string;
  updatedAt?: string;
  createdAt?: string;
  meeting?: {
    title?: string;
  } | null;
};

type DashboardTask = {
  id: string;
  title: string;
  assignee: string;
  dueDate: string;
  status: 'open' | 'closed';
  updatedAt: string;
  updatedSort: number;
  tag: string;
};

type MeetingTask = {
  _id: string;
  title?: string;
  description?: string;
  status?: string;
  gitHubIssueId?: number;
  gitHubRepoName?: string;
  dueDate?: string;
  updatedAt?: string;
  createdAt?: string;
};

type MeetingChatMessage = {
  sender: 'user' | 'mingo';
  content: string;
  timestamp?: string;
};

const formatTranscript = (text: string) =>
  text.replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2').trim();

const getTaskKey = (task: MeetingTask) =>
  task.gitHubIssueId && task.gitHubRepoName
    ? `${task.gitHubRepoName.trim().toLowerCase()}#${task.gitHubIssueId}`
    : task._id;

const mergeMeetingTasks = (localTasks: MeetingTask[], repoTasks: MeetingTask[]) => {
  const byKey = new Map<string, MeetingTask>();
  localTasks.forEach((task) => byKey.set(getTaskKey(task), task));
  repoTasks.forEach((task) => byKey.set(getTaskKey(task), task));
  return Array.from(byKey.values()).sort((left, right) => {
    const statusOrder = (left.status === 'Done' ? 1 : 0) - (right.status === 'Done' ? 1 : 0);
    if (statusOrder !== 0) return statusOrder;

    const leftDate = new Date(left.dueDate || left.updatedAt || left.createdAt || 0).getTime();
    const rightDate = new Date(right.dueDate || right.updatedAt || right.createdAt || 0).getTime();
    const safeLeftDate = Number.isNaN(leftDate) || leftDate === 0 ? Number.POSITIVE_INFINITY : leftDate;
    const safeRightDate = Number.isNaN(rightDate) || rightDate === 0 ? Number.POSITIVE_INFINITY : rightDate;

    return safeLeftDate - safeRightDate;
  });
};

const formatDashboardMeetingDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const formatMeetingDateOnly = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);

const formatMeetingTime = (date: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);

const formatRepositoryTag = (value?: string) => {
  if (!value?.trim()) {
    return 'Manual';
  }

  return value.trim().split('/').pop() || value.trim();
};

const formatMeetingDuration = (value?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'No duration';
  }

  return `${Math.round(value)} min`;
};

const formatRecordingDuration = (seconds: number) => {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
};

const normalizeDashboardMeeting = (meeting: RawMeeting, index = 0): DashboardMeeting => {
  const registeredAttendees = Array.isArray(meeting.participants)
    ? meeting.participants
        .filter((participant) => participant.email)
        .map((participant) => ({
          email: participant.email || '',
          displayName: participant.fullname || participant.username || participant.email || 'Attendee',
          isRegistered: true,
        }))
    : [];
  const invitedAttendees = Array.isArray(meeting.inviteEmails)
    ? meeting.inviteEmails.map((email) => ({
        email,
        displayName: email,
        isRegistered: false,
      }))
    : [];
  const attendees = [...registeredAttendees, ...invitedAttendees].filter(
    (attendee, index, array) =>
      attendee.email &&
      array.findIndex((candidate) => candidate.email === attendee.email) === index,
  );
  const meetingDate = new Date(meeting.date);
  const safeDate = Number.isNaN(meetingDate.getTime()) ? new Date() : meetingDate;
  const hasDuration = typeof meeting.duration === 'number';
  const isLive = meeting.status === 'live';
  const isCompleted =
    meeting.status === 'completed' ||
    hasDuration ||
    (!meeting.status && safeDate.getTime() < Date.now());
  const isTranscribed = Boolean(meeting.transcriptId && !meeting.mingoAgentId);

  return {
    id: meeting._id,
    title: meeting.title || 'Untitled Meeting',
    scheduledAt: meeting.date,
    date: formatDashboardMeetingDate(meeting.date),
    dateLabel: formatMeetingDateOnly(safeDate),
    timeLabel: formatMeetingTime(safeDate),
    duration: formatMeetingDuration(meeting.duration),
    recordingDuration:
      isTranscribed && typeof meeting.duration === 'number'
        ? formatRecordingDuration(meeting.duration)
        : undefined,
    status: isLive ? 'Live' : isCompleted ? 'Completed' : 'Upcoming',
    summary: meeting.summary || '',
    repoTag: formatRepositoryTag(meeting.gitHubRepoName),
    repository: meeting.gitHubRepoName || '-',
    tasksCount: meeting.tasks?.length || 0,
    ...(meeting.gitHubRepoName !== undefined ? { gitHubRepoName: meeting.gitHubRepoName } : {}),
    participants: attendees.length,
    participantLabels: attendees.map((attendee) => attendee.displayName),
    attendees,
    isTranscribed,
  };
};

const formatStatNumber = (value: number | null) => (value === null ? '...' : String(value));

const formatAverageDuration = (value: number | null) =>
  value === null ? '...' : `${Math.round(value)} ${Math.round(value) === 1 ? 'Minute' : 'Minutes'}`;

const getFirstName = (user?: DashboardUserResponse | null) => {
  const rawName = user?.fullname || user?.username || user?.email || '';
  const firstName = rawName.trim().split(/\s+/)[0];
  return firstName || 'there';
};

const formatTaskDueDate = (value?: string) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
};

const formatUpdatedDate = (value?: string) => {
  if (!value) {
    return 'Recently updated';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently updated';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
};

const formatTaskTag = (repoName?: string, issueId?: number) => {
  const repo = formatRepositoryTag(repoName);
  return issueId ? `${repo} #${issueId}` : repo;
};

const normalizeDashboardTask = (task: RawDashboardTask): DashboardTask => {
  const assignee = typeof task.assigneeId === 'object' ? task.assigneeId : null;
  const updatedValue = task.updatedAt || task.createdAt;
  const updatedTime = updatedValue ? new Date(updatedValue).getTime() : 0;

  return {
    id: task._id,
    title:
      task.title ||
      task.description ||
      (task.gitHubIssueId ? `GitHub issue #${task.gitHubIssueId}` : 'Untitled task'),
    assignee:
      assignee?.fullname ||
      assignee?.username ||
      assignee?.email ||
      task.assigneeName ||
      task.meeting?.title ||
      'Unassigned',
    dueDate: formatTaskDueDate(task.dueDate),
    status: task.status === 'Done' ? 'closed' : 'open',
    updatedAt: formatUpdatedDate(updatedValue),
    updatedSort: Number.isNaN(updatedTime) ? 0 : updatedTime,
    tag: formatTaskTag(task.gitHubRepoName, task.gitHubIssueId),
  };
};

const countUpcomingThisWeek = (meetings: DashboardMeeting[]) => {
  const now = Date.now();
  const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;

  return meetings.filter((meeting) => {
    const meetingTime = new Date(meeting.scheduledAt).getTime();
    return !Number.isNaN(meetingTime) && meetingTime >= now && meetingTime <= weekFromNow;
  }).length;
};

const DashboardPage = () => {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const [dashboardUser, setDashboardUser] = useState<DashboardUserResponse | null>(currentUser);
  const [showStartMeeting, setShowStartMeeting] = useState(false);
  const [showNewFutureMeeting, setShowNewFutureMeeting] = useState(false);
  const [showUploadMeeting, setShowUploadMeeting] = useState(false);
  const [serverUpcomingMeetings, setServerUpcomingMeetings] = useState<DashboardMeeting[]>([]);
  const [isLoadingUpcoming, setIsLoadingUpcoming] = useState(false);
  const [upcomingError, setUpcomingError] = useState('');
  const [startingMeetingId, setStartingMeetingId] = useState('');
  const [meetingsThisMonth, setMeetingsThisMonth] = useState<number | null>(null);
  const [averageDuration, setAverageDuration] = useState<number | null>(null);
  const [statsError, setStatsError] = useState('');
  const [recentlyUpdatedTasks, setRecentlyUpdatedTasks] = useState<DashboardTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [recentMeetings, setRecentMeetings] = useState<DashboardMeeting[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<DashboardMeeting | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [meetingTasks, setMeetingTasks] = useState<MeetingTask[]>([]);
  const [isLoadingMeetingTasks, setIsLoadingMeetingTasks] = useState(false);
  const [meetingChat, setMeetingChat] = useState<MeetingChatMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const [hasActiveMeeting, setHasActiveMeeting] = useState(
    Boolean(localStorage.getItem('currentMeetingId')),
  );
  const upcomingThisWeekCount = countUpcomingThisWeek(serverUpcomingMeetings);
  const firstName = getFirstName(dashboardUser);

  const loadDashboardUser = async () => {
    if (!currentUser?._id) {
      setDashboardUser(null);
      return;
    }

    try {
      const response = await fetchWithAuth(`/api/user/${currentUser._id}`);

      if (!response.ok) {
        throw new Error('Unable to load user.');
      }

      const data = (await response.json()) as DashboardUserResponse;
      setDashboardUser(data);
    } catch (_err) {
      setDashboardUser(currentUser);
    }
  };

  const loadUpcomingMeetings = async () => {
    if (!currentUser?._id) {
      setServerUpcomingMeetings([]);
      return;
    }

    try {
      setIsLoadingUpcoming(true);
      const response = await fetchWithAuth(`/api/meetings/meetings/${currentUser._id}/upcoming`);

      if (!response.ok) {
        const body = await parseResponseBody(response);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Unable to load upcoming meetings.';
        throw new Error(message);
      }

      const data = (await response.json()) as RawMeeting[];
      setServerUpcomingMeetings(
        Array.isArray(data) ? data.map(normalizeDashboardMeeting).slice(0, 4) : [],
      );
      setUpcomingError('');
    } catch (err) {
      setUpcomingError(err instanceof Error ? err.message : 'Unable to load upcoming meetings.');
    } finally {
      setIsLoadingUpcoming(false);
    }
  };

  const loadDashboardStats = async () => {
    if (!currentUser?._id) {
      setMeetingsThisMonth(0);
      setAverageDuration(0);
      return;
    }

    try {
      setStatsError('');

      const [monthResponse, durationResponse] = await Promise.all([
        fetchWithAuth(`/api/meetings/meetings/${currentUser._id}/this-month`),
        fetchWithAuth(`/api/meetings/meetings/${currentUser._id}/average-duration`),
      ]);

      if (!monthResponse.ok) {
        throw new Error('Unable to load monthly meeting stats.');
      }

      if (!durationResponse.ok) {
        throw new Error('Unable to load average duration.');
      }

      const monthMeetings = (await monthResponse.json()) as RawMeeting[];
      const durationData = (await durationResponse.json()) as AverageDurationResponse;

      setMeetingsThisMonth(Array.isArray(monthMeetings) ? monthMeetings.length : 0);
      setAverageDuration(
        typeof durationData.averageDuration === 'number'
          ? durationData.averageDuration
          : 0,
      );
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : 'Unable to load dashboard stats.');
      setMeetingsThisMonth(0);
      setAverageDuration(0);
    }
  };

  const loadOpenTasks = async () => {
    if (!currentUser?._id) {
      setRecentlyUpdatedTasks([]);
      return;
    }

    try {
      setIsLoadingTasks(true);
      setTasksError('');
      const response = await fetchWithAuth(`/api/users/${currentUser._id}/tasks`);

      if (!response.ok) {
        throw new Error('Unable to load open tasks.');
      }

      const data = (await response.json()) as RawDashboardTask[];
      const normalizedTasks = Array.isArray(data)
        ? data
            .map(normalizeDashboardTask)
            .sort((left, right) => right.updatedSort - left.updatedSort)
            .slice(0, 4)
        : [];
      setRecentlyUpdatedTasks(normalizedTasks);
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : 'Unable to load recently updated tasks.');
    } finally {
      setIsLoadingTasks(false);
    }
  };

  const loadRecentMeetings = async () => {
    if (!currentUser?._id) {
      setRecentMeetings([]);
      return;
    }

    try {
      setIsLoadingRecent(true);
      setRecentError('');
      const response = await fetchWithAuth(`/api/meetings/meetings/${currentUser._id}/recent`);

      if (!response.ok) {
        const body = await parseResponseBody(response);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Unable to load recent meetings.';
        throw new Error(message);
      }

      const data = (await response.json()) as RawMeeting[];
      setRecentMeetings(
        Array.isArray(data)
          ? data.map((meeting, index) => normalizeDashboardMeeting(meeting, index)).slice(0, 4)
          : [],
      );
    } catch (err) {
      setRecentError(err instanceof Error ? err.message : 'Unable to load recent meetings.');
    } finally {
      setIsLoadingRecent(false);
    }
  };

  const loadMeetingTasks = async (meeting: DashboardMeeting) => {
    try {
      setIsLoadingMeetingTasks(true);
      const repo = meeting.repository !== '-' ? meeting.repository : '';
      const [localResponse, repoResponse] = await Promise.all([
        fetchWithAuth(`/api/meetings/${meeting.id}/tasks`),
        currentUser?._id && repo
          ? fetchWithAuth(`/api/users/${currentUser._id}/tasks?repo=${encodeURIComponent(repo)}`)
          : Promise.resolve(null),
      ]);

      const localData = localResponse.ok ? ((await localResponse.json()) as MeetingTask[]) : [];
      const repoData = repoResponse?.ok ? ((await repoResponse.json()) as MeetingTask[]) : [];
      setMeetingTasks(
        mergeMeetingTasks(
          Array.isArray(localData) ? localData : [],
          Array.isArray(repoData) ? repoData : [],
        ),
      );
    } catch {
      // Tasks are optional in the summary modal.
    } finally {
      setIsLoadingMeetingTasks(false);
    }
  };

  const loadMeetingChat = async (meetingId: string) => {
    try {
      setIsLoadingChat(true);
      const response = await fetchWithAuth(`/api/meetings/${meetingId}/mingoAgent`);
      if (!response.ok) return;
      const data = (await response.json()) as { messages?: MeetingChatMessage[] } | null;
      setMeetingChat(Array.isArray(data?.messages) ? data.messages : []);
    } catch {
      // Chat is optional in the summary modal.
    } finally {
      setIsLoadingChat(false);
    }
  };

  const openRecentSummary = async (meeting: DashboardMeeting) => {
    if (meeting.status !== 'Completed') {
      return;
    }

    setSelectedMeeting(meeting);
    setSummaryError('');
    setMeetingTasks([]);
    setMeetingChat([]);
    void loadMeetingTasks(meeting);
    void loadMeetingChat(meeting.id);

    if (meeting.isTranscribed) {
      if (meeting.transcript) return;
      try {
        setIsSummaryLoading(true);
        const response = await fetchWithAuth(`/api/transcripts/${meeting.id}`);
        if (!response.ok) throw new Error('Unable to load transcript right now.');
        const data = (await response.json()) as { content?: string };
        const transcript = data.content || 'No transcript available for this meeting.';
        const updatedMeeting = { ...meeting, transcript };
        setSelectedMeeting(updatedMeeting);
        setRecentMeetings((prev) => prev.map((m) => (m.id === meeting.id ? updatedMeeting : m)));
      } catch (err) {
        setSummaryError(err instanceof Error ? err.message : 'Unable to load transcript right now.');
      } finally {
        setIsSummaryLoading(false);
      }
      return;
    }

    if (meeting.summary) {
      return;
    }

    try {
      setIsSummaryLoading(true);
      const response = await fetchWithAuth(`/api/meetings/${meeting.id}/mingoAgent/generateSummary`);

      if (!response.ok) {
        throw new Error('Unable to load the meeting summary right now.');
      }

      const data = (await response.json()) as { summary?: string };
      const summary = data.summary || 'No summary is available for this meeting yet.';
      const updatedMeeting = { ...meeting, summary };

      setSelectedMeeting(updatedMeeting);
      setRecentMeetings((prev) => prev.map((m) => (m.id === meeting.id ? updatedMeeting : m)));

      await fetchWithAuth(`/api/meetings/meetings/${meeting.id}`, {
        method: 'PUT',
        body: JSON.stringify({ summary }),
      });
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : 'Unable to load the meeting summary right now.');
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleStartUpcomingMeeting = async (meeting: DashboardMeeting) => {
    if (hasActiveMeeting || startingMeetingId) {
      return;
    }

    try {
      setStartingMeetingId(meeting.id);
      setUpcomingError('');

      const response = await fetchWithAuth(`/api/meetings/meetings/${meeting.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'live',
          date: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        const body = await parseResponseBody(response);
        const message =
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : 'Unable to start this meeting right now.';
        throw new Error(message);
      }

      const startedAt = new Date().toISOString();
      localStorage.setItem('currentMeetingId', meeting.id);
      localStorage.setItem(
        'currentMeetingDraft',
        JSON.stringify({
          id: meeting.id,
          title: meeting.title,
          date: startedAt,
          gitHubRepoName: meeting.gitHubRepoName || '',
          attendees: meeting.attendees,
        }),
      );
      setHasActiveMeeting(true);
      navigate('/meetings/live');
    } catch (err) {
      setUpcomingError(err instanceof Error ? err.message : 'Unable to start this meeting right now.');
    } finally {
      setStartingMeetingId('');
    }
  };

  useEffect(() => {
    const syncMeetingState = () => {
      setHasActiveMeeting(Boolean(localStorage.getItem('currentMeetingId')));
    };

    syncMeetingState();
    window.addEventListener('storage', syncMeetingState);

    return () => window.removeEventListener('storage', syncMeetingState);
  }, []);

  useEffect(() => {
    void loadDashboardUser();
    void loadUpcomingMeetings();
    void loadDashboardStats();
    void loadOpenTasks();
    void loadRecentMeetings();
  }, [currentUser?._id]);

  return (
    <div className="dashboard-layout">
      <Header />
      <main className="dashboard-main">
        {/* Greeting */}
        <h1 className="dashboard-greeting">Good to see you, {firstName}</h1>
        <p className="dashboard-greeting-sub">Here's what's happening with your meetings today.</p>

        {/* Action Cards */}
        <div className="dashboard-actions">
          <div
            className={`action-card action-card--blue ${hasActiveMeeting ? 'action-card--disabled' : ''}`}
            onClick={() => {
              if (!hasActiveMeeting) {
                setShowStartMeeting(true);
              }
            }}
          >
            <div className="action-card-top">
              <div className="action-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
              </div>
              {!hasActiveMeeting && (
                <div className="action-card-arrow">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              )}
            </div>
            <div className="action-card-body">
              <h3>Start Live Meeting</h3>
              <p>
                {hasActiveMeeting
                  ? 'A live meeting is already running.'
                  : 'Launch real-time AI assistant'}
              </p>
              {hasActiveMeeting && (
                <button
                  type="button"
                  className="action-card-inline-btn"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate('/meetings/live');
                  }}
                >
                  Go to Live Meeting
                </button>
              )}
            </div>
          </div>

          <div className="action-card action-card--orange" onClick={() => setShowNewFutureMeeting(true)}>
            <div className="action-card-top">
              <div className="action-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <div className="action-card-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </div>
            <div className="action-card-body">
              <h3>Create New Meeting</h3>
              <p>Schedule your upcoming meeting</p>
            </div>
          </div>

          <div className="action-card action-card--purple" onClick={() => setShowUploadMeeting(true)}>
            <div className="action-card-top">
              <div className="action-card-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
              <div className="action-card-arrow">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </div>
            <div className="action-card-body">
              <h3>Upload Meeting</h3>
              <p>Transcribe &amp; analyze audio</p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-icon stat-icon--blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-number" title={statsError || undefined}>
                {formatStatNumber(meetingsThisMonth)}
              </span>
              <span className="stat-label">Meetings this month</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon--yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-number" title={statsError || undefined}>
                {formatAverageDuration(averageDuration)}
              </span>
              <span className="stat-label">Average duration</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon--purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className="stat-content">
              <span className="stat-number">{isLoadingUpcoming ? '...' : upcomingThisWeekCount}</span>
              <span className="stat-label">Upcoming this week</span>
            </div>
          </div>
        </div>

        {/* Bottom Sections */}
        <div className="dashboard-bottom">
          {/* Upcoming */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>Upcoming</h2>
              {!isLoadingUpcoming && serverUpcomingMeetings.length > 0 && (
                <button type="button" className="view-all" onClick={() => navigate('/meetings')}>View All</button>
              )}
            </div>
            <div className="section-list">
              {upcomingError && <p className="dashboard-empty-state">{upcomingError}</p>}
              {!upcomingError && isLoadingUpcoming && (
                <p className="dashboard-empty-state">Loading upcoming meetings...</p>
              )}
              {!upcomingError && !isLoadingUpcoming && serverUpcomingMeetings.length === 0 && (
                <p className="dashboard-empty-state">No upcoming meetings yet.</p>
              )}
              {!upcomingError && !isLoadingUpcoming && serverUpcomingMeetings.map((m) => (
                <div className="upcoming-item" key={m.id}>
                  <div className="upcoming-info">
                    <span className="upcoming-title">{m.title}</span>
                    <span className="upcoming-meta">
                      <span className="upcoming-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="18" rx="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {m.date}
                      </span>
                      <span className="upcoming-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        {m.participants}
                      </span>
                    </span>
                  </div>
                  <button
                    className="btn-start"
                    disabled={hasActiveMeeting || startingMeetingId === m.id}
                    onClick={() => void handleStartUpcomingMeeting(m)}
                  >
                    {startingMeetingId === m.id ? 'Starting...' : 'Start'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Recently Updated Tasks */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>Recently Updated</h2>
              {!isLoadingTasks && recentlyUpdatedTasks.length > 0 && (
                <button type="button" className="view-all" onClick={() => navigate('/tasks')}>View All</button>
              )}
            </div>
            <div className="section-list">
              {tasksError && <p className="dashboard-empty-state">{tasksError}</p>}
              {!tasksError && isLoadingTasks && (
                <p className="dashboard-empty-state">Loading recently updated tasks...</p>
              )}
              {!tasksError && !isLoadingTasks && recentlyUpdatedTasks.length === 0 && (
                <p className="dashboard-empty-state">No recently updated tasks yet.</p>
              )}
              {recentlyUpdatedTasks.map((t) => (
                <div className="task-item" key={t.id}>
                  <span className={`task-status-dot task-status-dot--${t.status}`}>
                    {t.status === 'closed' && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </span>
                  <div className="task-info">
                    <span className="task-title">{t.title}</span>
                    <span className="task-meta">
                      {t.assignee} · Updated {t.updatedAt}
                      {t.dueDate ? ` · Due ${t.dueDate}` : ''}
                    </span>
                  </div>
                  <div className="task-badges">
                    <span className="task-tag">{t.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Meetings */}
        <div className="dashboard-section dashboard-section--wide">
          <div className="section-header">
            <h2>Recent Meetings</h2>
            {!isLoadingRecent && recentMeetings.length > 0 && (
              <button type="button" className="view-all" onClick={() => navigate('/meetings')}>View All</button>
            )}
          </div>
          <div className="section-list">
            {recentError && <p className="dashboard-empty-state">{recentError}</p>}
            {!recentError && isLoadingRecent && (
              <p className="dashboard-empty-state">Loading recent meetings...</p>
            )}
            {!recentError && !isLoadingRecent && recentMeetings.length === 0 && (
              <p className="dashboard-empty-state">No recent meetings yet.</p>
            )}
            {recentMeetings.map((m) => (
              <button
                type="button"
                className={`recent-item${m.status === 'Completed' ? ' recent-item--clickable' : ''}`}
                key={m.id}
                onClick={() => void openRecentSummary(m)}
                disabled={m.status !== 'Completed'}
              >
                <div className="recent-calendar-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                    <line x1="8" y1="14" x2="8.01" y2="14" />
                    <line x1="12" y1="14" x2="12.01" y2="14" />
                    <line x1="16" y1="14" x2="16.01" y2="14" />
                  </svg>
                </div>
                <div className="recent-info">
                  <span className="recent-title">{m.title}</span>
                  <span className="recent-meta">
                    <span>{m.date}</span>
                    <i />
                    <span>{m.participants} People</span>
                    <i />
                    <span>{m.repoTag}</span>
                  </span>
                </div>
                <div className="recent-stats">
                  <span>
                    <b className="recent-dot recent-dot--tasks" />
                    {m.tasksCount} tasks
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>

      {selectedMeeting && (
        <div className="meeting-summary-modal__overlay" onClick={() => setSelectedMeeting(null)}>
          <div className="meeting-summary-modal history-summary-modal" onClick={(e) => e.stopPropagation()}>
            <div className={`history-modal-header ${selectedMeeting.isTranscribed ? 'history-modal-header--transcribed' : 'history-modal-header--completed'}`}>
              <div className="history-modal-header__left">
                <span className="history-modal-eyebrow">
                  {selectedMeeting.isTranscribed ? '🎙️ Transcribed Meeting' : '📝 Meeting Summary'}
                </span>
                <h2 className="history-modal-title">{selectedMeeting.title}</h2>
                <div className="history-modal-meta">
                  <span>{selectedMeeting.dateLabel}, {selectedMeeting.timeLabel}</span>
                  {selectedMeeting.recordingDuration && <><span className="history-modal-sep">·</span><span>{selectedMeeting.recordingDuration}</span></>}
                  {!selectedMeeting.recordingDuration && selectedMeeting.duration !== 'No duration' && <><span className="history-modal-sep">·</span><span>{selectedMeeting.duration}</span></>}
                  {selectedMeeting.repository !== '-' && <><span className="history-modal-sep">·</span><span>{selectedMeeting.repository}</span></>}
                </div>
              </div>
              <button
                type="button"
                className="history-modal-close"
                onClick={() => setSelectedMeeting(null)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="history-modal-body">
              <div className="history-modal-main">
                {selectedMeeting.isTranscribed ? (
                  <article className="history-modal-card history-modal-card--full">
                    <h3 className="history-modal-card-title">Transcript</h3>
                    {isSummaryLoading ? (
                      <p className="history-modal-loading">Loading transcript…</p>
                    ) : summaryError ? (
                      <p className="history-modal-error">{summaryError}</p>
                    ) : (
                      <p className="history-transcript-text">
                        {selectedMeeting.transcript
                          ? formatTranscript(selectedMeeting.transcript)
                          : 'No transcript available for this meeting.'}
                      </p>
                    )}
                  </article>
                ) : (
                  <article className="history-modal-card history-modal-card--full">
                    <h3 className="history-modal-card-title">Summary</h3>
                    {isSummaryLoading ? (
                      <p className="history-modal-loading">Generating summary…</p>
                    ) : summaryError ? (
                      <p className="history-modal-error">{summaryError}</p>
                    ) : (
                      <p className="history-modal-text">{selectedMeeting.summary || 'No summary available yet.'}</p>
                    )}
                  </article>
                )}
              </div>

              <div className="history-modal-side">
                <article className="history-modal-card">
                  <h3 className="history-modal-card-title">Participants</h3>
                  {selectedMeeting.participantLabels.length > 0 ? (
                    <div className="meeting-summary__participants">
                      {selectedMeeting.participantLabels.map((participant) => (
                        <span key={participant}>{participant}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="meeting-summary__empty">No participants recorded.</p>
                  )}
                </article>

                <article className="history-modal-card">
                  <h3 className="history-modal-card-title">Tasks</h3>
                  {isLoadingMeetingTasks ? (
                    <p className="history-modal-loading">Loading tasks…</p>
                  ) : meetingTasks.length > 0 ? (
                    <div className="history-tasks-list">
                      {meetingTasks.map((task) => (
                        <div key={task._id} className="history-task-item">
                          <span className={`history-task-dot history-task-dot--${task.status === 'Done' ? 'done' : 'todo'}`} />
                          <div className="history-task-text">
                            <span>{task.title || task.description || 'Untitled task'}</span>
                            {task.gitHubIssueId && (
                              <span className="history-task-tag">{task.gitHubRepoName || 'GitHub'}-{task.gitHubIssueId}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="meeting-summary__empty">No tasks for this meeting.</p>
                  )}
                </article>

                <article className="history-modal-card">
                  <h3 className="history-modal-card-title">Chat</h3>
                  {isLoadingChat ? (
                    <p className="history-modal-loading">Loading chat…</p>
                  ) : meetingChat.length > 0 ? (
                    <div className="history-chat-list">
                      {meetingChat.map((message, index) => (
                        <div
                          key={`${message.timestamp || index}-${message.sender}`}
                          className={`history-chat-message history-chat-message--${message.sender}`}
                        >
                          <span>{message.sender === 'mingo' ? 'Mingo' : 'You'}</span>
                          <p>{message.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="meeting-summary__empty">No chat messages for this meeting.</p>
                  )}
                </article>
              </div>
            </div>
          </div>
        </div>
      )}

      {showStartMeeting && (
        <StartMeetingModal onClose={() => setShowStartMeeting(false)} />
      )}
      {showNewFutureMeeting && (
        <NewFutureMeetingModal
          onClose={() => {
            setShowNewFutureMeeting(false);
            void loadUpcomingMeetings();
            void loadDashboardStats();
          }}
        />
      )}
      {showUploadMeeting && (
        <UploadMeetingModal
          onClose={() => {
            setShowUploadMeeting(false);
            void loadRecentMeetings();
            void loadDashboardStats();
          }}
        />
      )}
    </div>
  );
};

export default DashboardPage;
