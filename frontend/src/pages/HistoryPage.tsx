import { useEffect, useMemo, useState } from 'react';
import Header from '../components/Header/Header';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../lib/auth';
import './MeetingPage.css';
import './HistoryPage.css';

type FilterTab = 'All' | 'Last Week' | 'Last Month' | 'Upcoming';

type RawMeeting = {
  _id: string;
  title: string;
  date: string;
  duration?: number;
  status?: 'upcoming' | 'live' | 'completed';
  summary?: string;
  gitHubRepoName?: string;
  participants?: unknown[];
  inviteEmails?: string[];
  tasks?: unknown[];
  transcriptId?: string;
  mingoAgentId?: string;
};

type RawParticipant = {
  _id?: string;
  fullname?: string;
  username?: string;
  email?: string;
};

type Meeting = {
  id: string;
  title: string;
  date: Date;
  dateLabel: string;
  timeLabel: string;
  participants: number;
  participantLabels: string[];
  duration: string;
  recordingDuration?: string | undefined;
  status: 'Completed' | 'Upcoming' | 'Live';
  tasksCount: number;
  summary: string;
  repository: string;
  isTranscribed: boolean;
  transcript?: string;
};

const tabs: FilterTab[] = ['All', 'Last Week', 'Last Month', 'Upcoming'];

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

const formatDuration = (duration?: number) => {
  if (typeof duration !== 'number' || Number.isNaN(duration)) {
    return '-';
  }

  return `${Math.max(1, Math.round(duration))} min`;
};

const formatRecordingDuration = (seconds: number) => {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
};

const formatMeetingDate = (date: Date) =>
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

const isParticipantRecord = (value: unknown): value is RawParticipant =>
  Boolean(value) && typeof value === 'object';

const getParticipantLabel = (participant: unknown) => {
  if (typeof participant === 'string') {
    return participant;
  }

  if (!isParticipantRecord(participant)) {
    return '';
  }

  return participant.fullname || participant.username || participant.email || participant._id || '';
};

const normalizeMeeting = (meeting: RawMeeting): Meeting => {
  const meetingDate = new Date(meeting.date);
  const safeDate = Number.isNaN(meetingDate.getTime()) ? new Date() : meetingDate;
  const hasDuration = typeof meeting.duration === 'number';
  const isLive = meeting.status === 'live';
  const isCompleted =
    meeting.status === 'completed' ||
    hasDuration ||
    (!meeting.status && safeDate.getTime() < Date.now());
  const participantLabels = [
    ...(Array.isArray(meeting.participants)
      ? meeting.participants.map(getParticipantLabel)
      : []),
    ...(Array.isArray(meeting.inviteEmails) ? meeting.inviteEmails : []),
  ].filter((label, index, array) => Boolean(label) && array.indexOf(label) === index);

  const isTranscribed = Boolean(meeting.transcriptId && !meeting.mingoAgentId);

  return {
    id: meeting._id,
    title: meeting.title || 'Untitled Meeting',
    date: safeDate,
    dateLabel: formatMeetingDate(safeDate),
    timeLabel: formatMeetingTime(safeDate),
    participants: participantLabels.length,
    participantLabels,
    duration: formatDuration(meeting.duration),
    recordingDuration:
      isTranscribed && typeof meeting.duration === 'number'
        ? formatRecordingDuration(meeting.duration)
        : undefined,
    status: isLive ? 'Live' : isCompleted ? 'Completed' : 'Upcoming',
    tasksCount: Array.isArray(meeting.tasks) ? meeting.tasks.length : 0,
    summary: meeting.summary || '',
    repository: meeting.gitHubRepoName || '-',
    isTranscribed,
  };
};

const HistoryPage = () => {
  const currentUser = getStoredUser();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [meetingTasks, setMeetingTasks] = useState<MeetingTask[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [meetingChat, setMeetingChat] = useState<MeetingChatMessage[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  useEffect(() => {
    const loadMeetings = async () => {
      if (!currentUser?._id) {
        setError('Unable to load your meetings. Please sign in again.');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const response = await fetchWithAuth(`/api/meetings/meetings/${currentUser._id}`);

        if (!response.ok) {
          const body = await parseResponseBody(response);
          const message =
            body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
              ? body.message
              : 'Unable to load meetings right now.';
          throw new Error(message);
        }

        const data = (await response.json()) as RawMeeting[];
        setMeetings(Array.isArray(data) ? data.map(normalizeMeeting) : []);
        setError('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load meetings right now.');
      } finally {
        setIsLoading(false);
      }
    };

    void loadMeetings();
  }, [currentUser?._id]);

  const now = useMemo(() => new Date(), []);
  const oneWeekAgo = useMemo(() => new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), [now]);
  const oneMonthAgo = useMemo(() => new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), [now]);

  const stats = useMemo(() => ({
    total: meetings.length,
    thisWeek: meetings.filter((meeting) => meeting.date >= oneWeekAgo && meeting.date <= now).length,
    future: meetings.filter((meeting) => meeting.status === 'Upcoming').length,
  }), [meetings, now, oneWeekAgo]);

  const filtered = useMemo(() => {
    let result = [...meetings];

    if (activeTab === 'Last Week') {
      result = result.filter((meeting) => meeting.date >= oneWeekAgo && meeting.date <= now);
    } else if (activeTab === 'Last Month') {
      result = result.filter((meeting) => meeting.date >= oneMonthAgo && meeting.date <= now);
    } else if (activeTab === 'Upcoming') {
      result = result.filter((meeting) => meeting.status === 'Upcoming');
    }

    if (search.trim()) {
      const query = search.trim().toLowerCase();
      result = result.filter(
        (meeting) =>
          meeting.title.toLowerCase().includes(query) ||
          meeting.dateLabel.includes(query) ||
          meeting.repository.toLowerCase().includes(query),
      );
    }

    result.sort((a, b) => {
      if (activeTab === 'All') {
        if (a.status === 'Upcoming' && b.status !== 'Upcoming') return 1;
        if (a.status !== 'Upcoming' && b.status === 'Upcoming') return -1;
      }

      return b.date.getTime() - a.date.getTime();
    });

    return result;
  }, [activeTab, meetings, now, oneMonthAgo, oneWeekAgo, search]);

  const loadMeetingTasks = async (meeting: Meeting) => {
    try {
      setIsLoadingTasks(true);
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
      // tasks are optional — don't block summary
    } finally {
      setIsLoadingTasks(false);
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

  const openSummary = async (meeting: Meeting) => {
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
        setMeetings((prev) => prev.map((m) => (m.id === meeting.id ? updatedMeeting : m)));
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
      setMeetings((prev) =>
        prev.map((item) => (item.id === meeting.id ? updatedMeeting : item)),
      );

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

  return (
    <div className="history-layout">
      <Header />

      <main className="history-main">
        <div className="history-stats-row">
          <div className="history-stat-card" onClick={() => setActiveTab('All')}>
            <div className="hstat-icon hstat-icon--total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className="hstat-content">
              <span className="hstat-number">{stats.total}</span>
              <span className="hstat-label">Total Meetings</span>
            </div>
          </div>
          <div className="history-stat-card" onClick={() => setActiveTab('Last Week')}>
            <div className="hstat-icon hstat-icon--week">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <div className="hstat-content">
              <span className="hstat-number">{stats.thisWeek}</span>
              <span className="hstat-label">This Week</span>
            </div>
          </div>
          <div className="history-stat-card" onClick={() => setActiveTab('Upcoming')}>
            <div className="hstat-icon hstat-icon--future">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
            </div>
            <div className="hstat-content">
              <span className="hstat-number">{stats.future}</span>
              <span className="hstat-label">Future Meetings</span>
            </div>
          </div>
        </div>

        <div className="history-toolbar">
          <div className="history-search-box">
            <svg className="hsearch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search meetings..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button className="hsearch-clear" onClick={() => setSearch('')} aria-label="Clear search">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <div className="history-filter-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`hfilter-tab ${activeTab === tab ? 'hfilter-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'Last Month' ? 'Last month' : tab}
              </button>
            ))}
          </div>
        </div>

        <div className="history-card">
          <div className="history-card-header">
            <h2>Your Meetings</h2>
            <span className="history-count">{filtered.length} {filtered.length === 1 ? 'meeting' : 'meetings'}</span>
          </div>

          {isLoading ? (
            <div className="history-empty"><p>Loading meetings...</p></div>
          ) : error ? (
            <div className="history-empty"><p>{error}</p></div>
          ) : filtered.length === 0 ? (
            <div className="history-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p>No meetings match your search</p>
            </div>
          ) : (
            <div className="history-list">
              {filtered.map((meeting) => (
                <button
                  key={meeting.id}
                  type="button"
                  className={`history-row ${meeting.status === 'Completed' ? 'history-row--clickable' : ''}`}
                  onClick={() => openSummary(meeting)}
                  disabled={meeting.status !== 'Completed'}
                >
                  <div className={`history-row-icon ${meeting.status === 'Upcoming' ? 'history-row-icon--upcoming' : ''} ${meeting.isTranscribed ? 'history-row-icon--transcribed' : ''}`}>
                    {meeting.isTranscribed ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    )}
                  </div>

                  <div className="history-row-info">
                    <span className="history-row-title">{meeting.title}</span>
                    <span className="history-row-meta">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {meeting.dateLabel}, {meeting.timeLabel}
                      <span className="hmeta-sep">|</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                      </svg>
                      {meeting.participants}
                    </span>
                  </div>

                  <div className="history-row-right">
                    {meeting.status === 'Completed' ? (
                      meeting.isTranscribed ? (
                        <span className="history-badge history-badge--transcribed">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                          </svg>
                          Transcribed{meeting.recordingDuration ? ` · ${meeting.recordingDuration}` : ''}
                        </span>
                      ) : (
                        <span className="history-badge history-badge--completed">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          {meeting.duration}
                        </span>
                      )
                    ) : (
                      <span className="history-badge history-badge--upcoming">{meeting.status}</span>
                    )}
                    {meeting.tasksCount > 0 && (
                      <span className="history-tasks-badge">{meeting.tasksCount} tasks</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedMeeting && (
        <div className="meeting-summary-modal__overlay" onClick={() => setSelectedMeeting(null)}>
          <div className="meeting-summary-modal history-summary-modal" onClick={(e) => e.stopPropagation()}>

            {/* ── Header ── */}
            <div className={`history-modal-header ${selectedMeeting.isTranscribed ? 'history-modal-header--transcribed' : 'history-modal-header--completed'}`}>
              <div className="history-modal-header__left">
                <span className="history-modal-eyebrow">
                  {selectedMeeting.isTranscribed ? '🎙️ Transcribed Meeting' : '📝 Meeting Summary'}
                </span>
                <h2 className="history-modal-title">{selectedMeeting.title}</h2>
                <div className="history-modal-meta">
                  <span>{selectedMeeting.dateLabel}, {selectedMeeting.timeLabel}</span>
                  {selectedMeeting.recordingDuration && <><span className="history-modal-sep">·</span><span>{selectedMeeting.recordingDuration}</span></>}
                  {!selectedMeeting.recordingDuration && selectedMeeting.duration !== '-' && <><span className="history-modal-sep">·</span><span>{selectedMeeting.duration}</span></>}
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

            {/* ── Body ── */}
            <div className="history-modal-body">
              {/* Left column */}
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

              {/* Right column */}
              <div className="history-modal-side">
                <article className="history-modal-card">
                  <h3 className="history-modal-card-title">Participants</h3>
                  {selectedMeeting.participantLabels.length > 0 ? (
                    <div className="meeting-summary__participants">
                      {selectedMeeting.participantLabels.map((p) => (
                        <span key={p}>{p}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="meeting-summary__empty">No participants recorded.</p>
                  )}
                </article>

                <article className="history-modal-card">
                  <h3 className="history-modal-card-title">Tasks</h3>
                  {isLoadingTasks ? (
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
    </div>
  );
};

export default HistoryPage;
