import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import StartMeetingModal from '../components/StartMeetingModal/StartMeetingModal';
import NewFutureMeetingModal from '../components/NewFutureMeetingModal/NewFutureMeetingModal';
import UploadMeetingModal from '../components/UploadMeetingModal/UploadMeetingModal';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../lib/auth';
import './DashboardPage.css';

type DashboardMeeting = {
  id: string;
  title: string;
  scheduledAt: string;
  date: string;
  duration: string;
  insightCount: number;
  bullets: string;
  color: string;
  repoTag: string;
  topicsCount: number;
  tasksCount: number;
  gitHubRepoName?: string;
  participants: number;
  attendees: DraftAttendee[];
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
  gitHubRepoName?: string;
  participants?: RawParticipant[];
  inviteEmails?: string[];
  topics?: string[];
  tasks?: string[];
};

type AverageDurationResponse = {
  averageDuration?: number;
};

type RawDashboardTask = {
  _id: string;
  title?: string;
  description?: string;
  assigneeId?: RawParticipant | string;
  assigneeName?: string;
  dueDate?: string;
  priority?: 'High' | 'Medium' | 'Low';
  status?: 'To Do' | 'In Progress' | 'Done';
  gitHubIssueId?: number;
  gitHubRepoName?: string;
  meeting?: {
    title?: string;
  } | null;
};

type DashboardTask = {
  id: string;
  title: string;
  assignee: string;
  dueDate: string;
  priority: 'High' | 'Medium' | 'Low';
  tag: string;
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

const REPOSITORY_COLORS = ['#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa', '#0284c7', '#0ea5e9'];

const getRepositoryColor = (value?: string) => {
  const seed = value?.trim() || 'manual';
  const hash = seed.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
  return REPOSITORY_COLORS[hash % REPOSITORY_COLORS.length];
};

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

  return {
    id: meeting._id,
    title: meeting.title || 'Untitled Meeting',
    scheduledAt: meeting.date,
    date: formatDashboardMeetingDate(meeting.date),
    duration: formatMeetingDuration(meeting.duration),
    insightCount: (meeting.topics?.length || 0) + (meeting.tasks?.length || 0),
    bullets: formatRepositoryTag(meeting.gitHubRepoName),
    color: getRepositoryColor(meeting.gitHubRepoName || meeting.title || String(index)),
    repoTag: formatRepositoryTag(meeting.gitHubRepoName),
    topicsCount: meeting.topics?.length || 0,
    tasksCount: meeting.tasks?.length || 0,
    gitHubRepoName: meeting.gitHubRepoName,
    participants: attendees.length,
    attendees,
  };
};

const formatStatNumber = (value: number | null) => (value === null ? '...' : String(value));

const formatAverageDuration = (value: number | null) =>
  value === null ? '...' : String(Math.round(value));

const formatTaskDueDate = (value?: string) => {
  if (!value) {
    return 'No due date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No due date';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date);
};

const normalizeDashboardTask = (task: RawDashboardTask): DashboardTask => {
  const assignee = typeof task.assigneeId === 'object' ? task.assigneeId : null;

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
    priority: task.priority || 'Medium',
    tag: task.gitHubIssueId
      ? `${task.gitHubRepoName || 'MINGO'}-${task.gitHubIssueId}`
      : task.gitHubRepoName || 'Manual',
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
  const [openTasks, setOpenTasks] = useState<DashboardTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [recentMeetings, setRecentMeetings] = useState<DashboardMeeting[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);
  const [recentError, setRecentError] = useState('');
  const [hasActiveMeeting, setHasActiveMeeting] = useState(
    Boolean(localStorage.getItem('currentMeetingId')),
  );
  const upcomingThisWeekCount = countUpcomingThisWeek(serverUpcomingMeetings);

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
      setOpenTasks([]);
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
            .filter((task) => task.status !== 'Done')
            .map(normalizeDashboardTask)
            .slice(0, 4)
        : [];
      setOpenTasks(normalizedTasks);
    } catch (err) {
      setTasksError(err instanceof Error ? err.message : 'Unable to load open tasks.');
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
        <h1 className="dashboard-greeting">Hi Natali! 👋</h1>

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
            <div className="action-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <h3>Start Live Meeting</h3>
            <p>
              {hasActiveMeeting
                ? 'A live meeting is already running. Return to it before starting another one.'
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
          <div className="action-card action-card--orange" onClick={() => setShowNewFutureMeeting(true)}>
            <div className="action-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <h3>Create New Meeting</h3>
            <p>Set your up-coming meeting</p>
          </div>
          <div className="action-card action-card--purple" onClick={() => setShowUploadMeeting(true)}>
            <div className="action-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3>Upload Meeting</h3>
            <p>Transcribe &amp; analyze MP3</p>
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
            <span className="stat-number" title={statsError || undefined}>
              {formatStatNumber(meetingsThisMonth)}
            </span>
            <span className="stat-label">Meetings this month</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon--yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span className="stat-number" title={statsError || undefined}>
              {formatAverageDuration(averageDuration)}
            </span>
            <span className="stat-label">Average duration</span>
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
            <span className="stat-number">{isLoadingUpcoming ? '...' : upcomingThisWeekCount}</span>
            <span className="stat-label">Upcoming this week</span>
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
                      📅 {m.date} &nbsp; 👤 {m.participants}
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

          {/* Open Tasks */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>Open Tasks</h2>
              {!isLoadingTasks && openTasks.length > 0 && (
                <button type="button" className="view-all" onClick={() => navigate('/tasks')}>View All</button>
              )}
            </div>
            <div className="section-list">
              {tasksError && <p className="dashboard-empty-state">{tasksError}</p>}
              {!tasksError && isLoadingTasks && (
                <p className="dashboard-empty-state">Loading open tasks...</p>
              )}
              {!tasksError && !isLoadingTasks && openTasks.length === 0 && (
                <p className="dashboard-empty-state">No open tasks yet.</p>
              )}
              {openTasks.map((t) => (
                <div className="task-item" key={t.id}>
                  <div className="task-check">
                    <span className="task-checkbox" />
                  </div>
                  <div className="task-info">
                    <span className="task-title">{t.title}</span>
                    <span className="task-meta">{t.assignee} · {t.dueDate}</span>
                  </div>
                  <div className="task-badges">
                    <span className={`priority-badge priority-badge--${t.priority.toLowerCase()}`}>
                      {t.priority}
                    </span>
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
              <div className="recent-item" key={m.id}>
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
                    <b className="recent-dot recent-dot--topics" />
                    {m.topicsCount} topics
                  </span>
                  <span>
                    <b className="recent-dot recent-dot--tasks" />
                    {m.tasksCount} tasks
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

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
