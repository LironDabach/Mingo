import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import { fetchWithAuth, getStoredUser } from '../lib/auth';
import { notifyTasksChanged } from '../lib/taskEvents';
import './MeetingPage.css';
import { useEffect } from 'react';

type DraftAttendee = {
  email: string;
  displayName: string;
  isRegistered: boolean;
};

type MeetingParticipant = Partial<DraftAttendee> & {
  fullname?: string;
  username?: string;
};

type MeetingDraft = {
  id?: string;
  title?: string;
  date?: string;
  gitHubRepoName?: string;
  attendees?: DraftAttendee[];
};

type MeetingDetails = {
  _id: string;
  title?: string;
  date?: string;
  gitHubRepoName?: string;
  participants?: MeetingParticipant[];
};

type ChatMessage = {
  id: number;
  sender: 'user' | 'mingo';
  text: string;
};

type SuggestedTask = { title: string; description: string; isNew?: boolean };

type Task = {
  id: string;
  meetingId?: string;
  title: string;
  assignee: string;
  due: string;
  tag: string;
  done: boolean;
  source: 'github' | 'local';
  gitHubIssueId?: number;
  gitHubRepoName?: string;
  htmlUrl?: string;
};

const INITIAL_MINGO_MESSAGE: ChatMessage = {
  id: 1,
  sender: 'mingo',
  text: "Hi, I'm Mingo. I'm here to help you capture decisions, track tasks, and keep this meeting moving. Ask me anything whenever you're ready.",
};

const formatMeetingDate = (value?: string) => {
  const date = value ? new Date(value) : new Date();

  if (Number.isNaN(date.getTime())) {
    return 'Today';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};

const getAttendeeKey = (attendee: DraftAttendee) =>
  (attendee.email || attendee.displayName).trim().toLowerCase();

const uniqueAttendees = (attendees: DraftAttendee[]) =>
  attendees.filter((attendee, index, array) => {
    const key = getAttendeeKey(attendee);
    if (!key) return false;

    return array.findIndex((candidate) => getAttendeeKey(candidate) === key) === index;
  });

const buildMeetingNarrative = (
  title: string,
  repo: string,
  attendeeCount: number,
  openTaskCount: number,
) =>
  `${title} focused on aligning the team around ${repo}. The discussion covered product direction, design follow-ups, and the next engineering steps. ${attendeeCount} participants took part in the meeting, and the conversation ended with ${openTaskCount} action items that still need follow-up.`;

const MeetingPage = () => {
  const navigate = useNavigate();
  const storedUser = getStoredUser();
  const rawDraft = localStorage.getItem('currentMeetingDraft');
  const parsedDraft = (() => {
    try { return rawDraft ? (JSON.parse(rawDraft) as MeetingDraft) : null; } catch { return null; }
  })();
  const initialMeetingId =
    parsedDraft?.id ||
    localStorage.getItem('currentMeetingId') ||
    localStorage.getItem('lastSummaryMeetingId') ||
    '';
  const meetingIdRef = useRef(initialMeetingId);

  const [actualDuration, setActualDuration] = useState('');
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null);
  const attendees = useMemo(() => {
    if (Array.isArray(meetingDetails?.participants) && meetingDetails.participants.length > 0) {
      return uniqueAttendees(
        meetingDetails.participants.map((participant) => ({
          email: participant.email || '',
          displayName:
            participant.displayName ||
            participant.fullname ||
            participant.username ||
            participant.email ||
            'Participant',
          isRegistered: true,
        })),
      );
    }

    const draftAttendees = parsedDraft?.attendees || [];
    const currentUserName = storedUser?.fullname || storedUser?.email || 'You';
    const merged = [
      { displayName: currentUserName, email: storedUser?.email || '', isRegistered: true },
      ...draftAttendees,
    ];

    return uniqueAttendees(merged);
  }, [meetingDetails?.participants, parsedDraft?.attendees, storedUser?.email, storedUser?.fullname]);
  const meetingTitle = meetingDetails?.title || parsedDraft?.title || 'Live Meeting';
  const repositoryLabel = meetingDetails?.gitHubRepoName || parsedDraft?.gitHubRepoName || '';
  const meetingDate = formatMeetingDate(meetingDetails?.date || parsedDraft?.date);

  const [messages, setMessages] = useState<ChatMessage[]>([INITIAL_MINGO_MESSAGE]);

  useEffect(() => {
    const loadMeetingDetails = async () => {
      const meetingId =
        meetingIdRef.current ||
        parsedDraft?.id ||
        localStorage.getItem('currentMeetingId') ||
        localStorage.getItem('lastSummaryMeetingId') ||
        '';

      if (!meetingId) return;

      try {
        const response = await fetchWithAuth(`/api/meetings/meetings/${meetingId}`);
        if (!response.ok) return;

        const data = (await response.json()) as MeetingDetails | MeetingDetails[];
        if (!Array.isArray(data)) {
          setMeetingDetails(data);
        }
      } catch (error) {
        console.error('Failed to load meeting details:', error);
      }
    };

    void loadMeetingDetails();
  }, [parsedDraft?.id]);

  useEffect(() => {
    const loadChatHistory = async () => {
      const meetingId =
        meetingIdRef.current ||
        parsedDraft?.id ||
        localStorage.getItem('currentMeetingId') ||
        '';

      if (!meetingId) return;

      try {
        const response = await fetchWithAuth(
          `/api/meetings/${meetingId}/mingoAgent`
        );

        if (!response.ok) {
          throw new Error('Failed to load chat history');
        }

        const data = await response.json();

        if (data?.messages?.length) {
          const backendMessages = data.messages.map((msg: any, index: number) => ({
            id: Date.now() + index,
            sender: msg.sender,
            text: msg.content,
          }));

          setMessages(backendMessages);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
      }
    };

    loadChatHistory();
  }, []);

  // ── Uploaded transcript ──────────────────────────────────────
  const [uploadedTranscript, setUploadedTranscript] = useState<{ transcriptId: string; content: string } | null>(null);
  const [transcriptContent, setTranscriptContent] = useState('');
  const [isEditingTranscript, setIsEditingTranscript] = useState(false);
  const [isSavingTranscript, setIsSavingTranscript] = useState(false);
  const [transcriptSaveError, setTranscriptSaveError] = useState('');

  // ── Suggested tasks (from upload modal) ─────────────────────
  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[]>([]);
  const [selectedSuggestedTaskIndices, setSelectedSuggestedTaskIndices] = useState<Set<number>>(new Set());
  const [isSuggestingTasks, setIsSuggestingTasks] = useState(false);
  const [isCreatingSuggestedTasks, setIsCreatingSuggestedTasks] = useState(false);
  const [suggestedTasksCreated, setSuggestedTasksCreated] = useState(false);
  const [suggestedTasksError, setSuggestedTasksError] = useState('');

  useEffect(() => {
    const raw = localStorage.getItem('uploadedTranscript');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { transcriptId: string; content: string; meetingId?: string };
        if (parsed.meetingId === initialMeetingId) {
          setUploadedTranscript(parsed);
          setTranscriptContent(parsed.content);
        }
      } catch {
        // ignore malformed data
      }
    }

    const meetingKey = `suggestedTasks_${initialMeetingId}`;
    const rawTasks = localStorage.getItem(meetingKey);
    if (!rawTasks) return;
    try {
      const parsedTasks = JSON.parse(rawTasks) as SuggestedTask[];
      setSuggestedTasks(parsedTasks);
      setSelectedSuggestedTaskIndices(new Set(parsedTasks.map((_, i) => i)));
    } catch {
      // ignore malformed data
    }
  }, []);

  useEffect(() => {
    if (!initialMeetingId) return;
    const meetingKey = `suggestedTasks_${initialMeetingId}`;
    if (suggestedTasks.length > 0) {
      localStorage.setItem(meetingKey, JSON.stringify(suggestedTasks));
    }
  }, [suggestedTasks]);

  useEffect(() => {
    if (!uploadedTranscript || !initialMeetingId || suggestedTasks.length > 0 || isSuggestingTasks) return;

    const fetchTaskSuggestions = async () => {
      setIsSuggestingTasks(true);
      try {
        const response = await fetchWithAuth(`/api/meetings/${initialMeetingId}/suggest-tasks`, {
          method: 'POST',
        });
        if (!response.ok) return;
        const data = (await response.json()) as { tasks?: SuggestedTask[] };
        const tasks = Array.isArray(data.tasks) ? data.tasks : [];
        setSuggestedTasks(tasks);
        setSelectedSuggestedTaskIndices(new Set(tasks.map((_, i) => i)));
      } catch {
        // Suggestions are optional; the meeting can still be viewed.
      } finally {
        setIsSuggestingTasks(false);
      }
    };

    void fetchTaskSuggestions();
  }, [uploadedTranscript, initialMeetingId, suggestedTasks.length, isSuggestingTasks]);

  const handleSaveTranscript = async () => {
    if (!uploadedTranscript || isSavingTranscript) return;
    setIsSavingTranscript(true);
    setTranscriptSaveError('');
    try {
      const response = await fetchWithAuth(`/api/transcripts/${uploadedTranscript.transcriptId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: transcriptContent }),
      });
      if (!response.ok) throw new Error('Failed to save transcript.');
      setUploadedTranscript({ ...uploadedTranscript, content: transcriptContent });
      setIsEditingTranscript(false);
    } catch (err) {
      setTranscriptSaveError(err instanceof Error ? err.message : 'Failed to save transcript.');
    } finally {
      setIsSavingTranscript(false);
    }
  };

  const toggleSuggestedTaskIndex = (index: number) => {
    setSelectedSuggestedTaskIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleCreateSuggestedTasks = async () => {
    if (selectedSuggestedTaskIndices.size === 0 || isCreatingSuggestedTasks) return;
    const meetingId =
      meetingIdRef.current ||
      parsedDraft?.id ||
      localStorage.getItem('currentMeetingId') ||
      '';
    if (!meetingId) return;

    const repo = parsedDraft?.gitHubRepoName || repositoryLabel;
    if (!repo) {
      setSuggestedTasksError('No GitHub repository is linked to this meeting.');
      return;
    }

    setIsCreatingSuggestedTasks(true);
    setSuggestedTasksError('');

    const tasksToCreate = suggestedTasks.filter((_, i) => selectedSuggestedTaskIndices.has(i));
    try {
      await Promise.all(
        tasksToCreate.map(async (task) => {
          const response = await fetchWithAuth(`/api/meetings/${meetingId}/tasks`, {
            method: 'POST',
            body: JSON.stringify({
              title: task.title,
              description: task.description,
              createGitHubIssue: true,
              gitHubRepoFullName: repo,
            }),
          });
          if (!response.ok) throw new Error('Task creation failed');
        }),
      );
      setSuggestedTasksCreated(true);
      notifyTasksChanged();
      void loadTasks(true);
      if (initialMeetingId) {
        localStorage.removeItem(`suggestedTasks_${initialMeetingId}`);
        localStorage.removeItem('uploadedSuggestedTasks');
      }
    } catch {
      setSuggestedTasksError('Some tasks could not be created. Please try again.');
    } finally {
      setIsCreatingSuggestedTasks(false);
    }
  };

  const [isMingoTyping, setIsMingoTyping] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [showTasksSidebar, setShowTasksSidebar] = useState(false);
  const [tasksFilter, setTasksFilter] = useState<'active' | 'completed'>('active');

  useEffect(() => {
    document.body.style.overflow = showSummary ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [showSummary]);
  const [summaryText, setSummaryText] = useState('');
  const [summaryMeetingId, setSummaryMeetingId] = useState(initialMeetingId);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [closedThisSession, setClosedThisSession] = useState<Set<string>>(new Set());
  const [taskUpdateError, setTaskUpdateError] = useState('');
  const [isRefreshingTasks, setIsRefreshingTasks] = useState(false);

  const loadTasks = async (silent = false) => {
    const meetingId =
      meetingIdRef.current ||
      parsedDraft?.id ||
      localStorage.getItem('currentMeetingId') ||
      '';

    const repo = parsedDraft?.gitHubRepoName || repositoryLabel;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user.id || user._id;

    if (!userId) return;

    if (!silent) setIsRefreshingTasks(true);

    try {
      const url = repo
        ? `/api/users/${userId}/tasks?repo=${encodeURIComponent(repo)}`
        : `/api/users/${userId}/tasks`;
      const response = await fetchWithAuth(url);

      if (!response.ok) throw new Error('Failed to load tasks');

      const data = await response.json();

      const backendTasks = (data.tasks || data || []).map(
        (task: any, index: number) => ({
          id: String(task.id || task._id || Date.now() + index),
          meetingId: task.meeting?._id,
          title: task.title || task.description || 'Untitled task',
          assignee: task.assignee || task.assigneeName || task.owner || 'Unassigned',
          due: task.due || task.dueDate || 'No due date',
          tag: task.tag || task.jiraKey || `TASK-${task.gitHubIssueId || index + 1}`,
          htmlUrl: task.htmlUrl || task.html_url || '',
          source: task.source === 'github' ? 'github' : 'local',
          gitHubIssueId: task.gitHubIssueId,
          gitHubRepoName: task.gitHubRepoName || repo,
          done:
            typeof task.status === 'string' &&
            task.status.toLowerCase() === 'done',
        })
      );

      if (backendTasks.length > 0) setTasks(backendTasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      if (!silent) setIsRefreshingTasks(false);
    }
  };

  useEffect(() => {
    void loadTasks(true);
  }, []);

  const completedTasks = tasks.filter((task) => closedThisSession.has(task.id));
  const openTasks = tasks.filter((task) => !task.done);
  const displayedTasks = [...openTasks, ...completedTasks];
  const doneTasks = tasks.filter((task) => task.done);
  const filteredPanelTasks = tasksFilter === 'active' ? openTasks : doneTasks;
  const summaryNarrative = buildMeetingNarrative(
    meetingTitle,
    repositoryLabel,
    attendees.length,
    openTasks.length,
  );


  const handleSend = async (event: FormEvent) => {
    event.preventDefault();

    const trimmed = chatInput.trim();
    if (!trimmed) return;

    const meetingId =
      meetingIdRef.current ||
      parsedDraft?.id ||
      localStorage.getItem('currentMeetingId') ||
      '';


    setMessages((prev) => [
      ...prev,
      { id: Date.now(), sender: 'user', text: trimmed },
    ]);

    setChatInput('');
    setIsMingoTyping(true);

    try {
      const response = await fetchWithAuth(
        `/api/meetings/${meetingId}/mingoAgent/generateReply`,
        {
          method: 'POST',
          body: JSON.stringify({
            message: trimmed,
            ...(uploadedTranscript ? { transcript: transcriptContent } : {}),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get response from server');
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'mingo',
          text: data.reply || 'No response from AI',
        },
      ]);

      if (data.taskActionPerformed) {
        void loadTasks(true);
      }

      if (data.suggestedTask) {
        const newTask = { ...(data.suggestedTask as { title: string; description: string }), isNew: true };
        setSuggestedTasks((prev) => [newTask, ...prev]);
        setSelectedSuggestedTaskIndices((s) => new Set([0, ...[...s].map((i) => i + 1)]));
      }
    } catch (error) {
      console.error(error);

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender: 'mingo',
          text: 'Something went wrong. Please try again.',
        },
      ]);
    } finally {
      setIsMingoTyping(false);
    }
  };

  const handleEndMeeting = async () => {
    const meetingId =
      meetingIdRef.current ||
      parsedDraft?.id ||
      localStorage.getItem('currentMeetingId') ||
      localStorage.getItem('lastSummaryMeetingId') ||
      '';
    const fallbackSummary = summaryNarrative;

    if (meetingId) {
      meetingIdRef.current = meetingId;
      localStorage.setItem('lastSummaryMeetingId', meetingId);
    }
    setShowSummary(true);
    setEmailSent(false);
    setEmailError('');
    setSummaryMeetingId(meetingId);
    setSummaryText(fallbackSummary);
    setSummaryError('');

    if (!meetingId) {
      localStorage.removeItem('currentMeetingDraft');
      localStorage.removeItem('currentMeetingId');
      return;
    }

    try {
      setSummaryLoading(true);
      const summaryResponse = await fetchWithAuth(`/api/meetings/${meetingId}/mingoAgent/generateSummary`);
      let generatedSummary = fallbackSummary;

      if (summaryResponse.ok) {
        const data = (await summaryResponse.json()) as { summary?: string };
        generatedSummary = data.summary || fallbackSummary;
        setSummaryText(generatedSummary);
      } else {
        setSummaryError('The meeting ended, but the server summary could not be generated right now.');
      }

      const startedAt = parsedDraft?.date ? new Date(parsedDraft.date).getTime() : Date.now();
      const duration = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
      setActualDuration(`${duration} min`);

      await fetchWithAuth(`/api/meetings/meetings/${meetingId}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: 'completed',
          duration,
          summary: generatedSummary,
          endedAt: new Date().toISOString(),
        }),
      });
    } catch (err) {
      setSummaryError(
        err instanceof Error
          ? err.message
          : 'The meeting ended, but the server summary could not be saved right now.',
      );
    } finally {
      setSummaryLoading(false);
      localStorage.removeItem('currentMeetingDraft');
      localStorage.removeItem('currentMeetingId');
    }
  };

  const handleSendSummaryEmail = async () => {
    const meetingId =
      meetingIdRef.current ||
      summaryMeetingId ||
      parsedDraft?.id ||
      localStorage.getItem('currentMeetingId') ||
      localStorage.getItem('lastSummaryMeetingId') ||
      '';

    if (!meetingId) {
      setEmailError('Meeting ID is missing.');
      return;
    }

    try {
      setEmailSending(true);
      setEmailError('');
      const response = await fetchWithAuth(`/api/meetings/meetings/${meetingId}/send-summary-email`, {
        method: 'POST',
        body: JSON.stringify({
          summary: summaryText || summaryNarrative,
          closedTasks: completedTasks.map((task) => `${task.title} (${task.assignee}, ${task.tag})`),
          openTasks: openTasks.map((task) => `${task.title} (${task.assignee}, ${task.due})`),
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Unable to send summary email right now.');
      }

      setEmailSent(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send summary email right now.';
      setEmailError(
        message.includes('Gmail')
          ? `${message} Open Settings and click Re-sync Google account.`
          : message,
      );
    } finally {
      setEmailSending(false);
    }
  };

  const toggleTask = async (taskId: string) => {
    const task = tasks.find((currentTask) => currentTask.id === taskId);
    if (!task) return;

    const activeMeetingId =
      meetingIdRef.current ||
      parsedDraft?.id ||
      localStorage.getItem('currentMeetingId') ||
      '';
    const nextDone = !task.done;
    const previousTasks = tasks;
    setTaskUpdateError('');
    setClosedThisSession((prev) => {
      const next = new Set(prev);
      if (nextDone) next.add(taskId); else next.delete(taskId);
      return next;
    });
    setTasks((prev) => {
      const updatedTask = { ...task, done: nextDone };
      const rest = prev.filter((currentTask) => currentTask.id !== taskId);

      if (nextDone) {
        const open = rest.filter((currentTask) => !currentTask.done);
        const done = rest.filter((currentTask) => currentTask.done);
        return [...open, updatedTask, ...done];
      }

      const open = rest.filter((currentTask) => !currentTask.done);
      const done = rest.filter((currentTask) => currentTask.done);
      return [updatedTask, ...open, ...done];
    });

    try {
      if (task.gitHubIssueId && task.gitHubRepoName && storedUser?._id) {
        const response = await fetchWithAuth(`/api/users/${storedUser._id}/tasks/github-status`, {
          method: 'PUT',
          body: JSON.stringify({
            gitHubIssueId: task.gitHubIssueId,
            gitHubRepoName: task.gitHubRepoName,
            status: nextDone ? 'Done' : 'To Do',
            ...(nextDone && activeMeetingId ? { completedInMeetingId: activeMeetingId } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error('Unable to update GitHub issue.');
        }

        return;
      }

      if (task.meetingId) {
        const response = await fetchWithAuth(`/api/meetings/${task.meetingId}/tasks/${task.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            status: nextDone ? 'Done' : 'To Do',
            ...(nextDone && activeMeetingId ? { completedInMeetingId: activeMeetingId } : {}),
          }),
        });

        if (!response.ok) {
          throw new Error('Unable to update task status.');
        }
      }
    } catch (error) {
      setTasks(previousTasks);
      setClosedThisSession((prev) => {
        const next = new Set(prev);
        if (nextDone) next.delete(taskId); else next.add(taskId);
        return next;
      });
      setTaskUpdateError(error instanceof Error ? error.message : 'Unable to update task status.');
    }
  };

  return (
    <div className="meeting-page">
      <Header />

      <main className="meeting-page__main">
        <section className="meeting-hero">
          <div className="meeting-hero__content">
            <div className="meeting-hero__headline">
              <h1>{meetingTitle}</h1>
              <button type="button" className="meeting-hero__edit" aria-label="Edit meeting">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                </svg>
              </button>
            </div>

            <div className="meeting-hero__meta">
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {meetingDate}
              </span>
              <span className="meeting-hero__divider" />
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                {attendees.length}
              </span>
              <span className="meeting-hero__divider" />
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                {uploadedTranscript ? 'Transcribed' : 'Live'}
              </span>
              <span className="meeting-hero__divider" />
              <span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21 16-4 4-4-4" />
                  <path d="M17 20V4" />
                  <path d="m3 8 4-4 4 4" />
                  <path d="M7 4v16" />
                </svg>
                {repositoryLabel}
              </span>
            </div>
          </div>

          <div className="meeting-hero__actions">
            <button
              type="button"
              className={`meeting-hero__tasks-btn${showTasksSidebar ? ' meeting-hero__tasks-btn--active' : ''}`}
              onClick={() => setShowTasksSidebar((v) => !v)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              Tasks
            </button>
            <button type="button" className="meeting-hero__end" onClick={handleEndMeeting}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
              {summaryLoading ? 'Ending...' : 'End Meeting'}
            </button>
          </div>
        </section>

        <section className="meeting-content">
          <article className="meeting-chat-card">
            <header className="meeting-card__header meeting-card__header--with-action">
              <h2>
                Chat with <span>Mingo</span>
              </h2>
              <div className="mingo-help">
                <button type="button" className="mingo-help__btn" aria-label="What can Mingo do?">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <circle cx="12" cy="17" r="0.5" fill="currentColor" />
                  </svg>
                </button>
                <div className="mingo-help__tooltip" role="tooltip">
                  <strong>What Mingo can do</strong>
                  <ul>
                    <li>
                      <span className="mingo-help__icon">✅</span>
                      <span><b>Tasks</b> — create, close, reopen, rename, assign, or delete GitHub issues<br /><em>e.g. "Create a task to fix the login bug"</em></span>
                    </li>
                    <li>
                      <span className="mingo-help__icon">📄</span>
                      <span><b>Transcript</b> — answer questions based on the uploaded MP3 transcription</span>
                    </li>
                    <li>
                      <span className="mingo-help__icon">🔍</span>
                      <span><b>Repo &amp; issues</b> — ask about open issues, assignees, or status in your linked repo</span>
                    </li>
                    <li>
                      <span className="mingo-help__icon">📋</span>
                      <span><b>Meeting context</b> — recap decisions, action items, and participants</span>
                    </li>
                    <li>
                      <span className="mingo-help__icon">🕘</span>
                      <span><b>Past meetings</b> — reference previous meetings for comparison or follow-ups</span>
                    </li>
                  </ul>
                </div>
              </div>
            </header>

            <div className="meeting-chat-card__body">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`meeting-message meeting-message--${message.sender}`}
                >
                  {message.sender === 'user' && (
                    <div className="meeting-message__avatar meeting-message__avatar--user">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.8 0 5-2.4 5-5.3S14.8 1.5 12 1.5 7 3.9 7 6.8s2.2 5.2 5 5.2Zm0 2.5c-4.1 0-8 2.1-8 5v1.5h16V19.5c0-2.9-3.9-5-8-5Z" />
                      </svg>
                    </div>
                  )}
                  <div className="meeting-message__bubble">{message.text}</div>
                  {message.sender === 'mingo' && (
                    <div className="meeting-message__avatar meeting-message__avatar--mingo">
                      <img src="/mingo-mark.svg" alt="" aria-hidden="true" />
                    </div>
                  )}
                </div>
              ))}
              {isMingoTyping && (
                <div className="meeting-message meeting-message--mingo">
                  <div className="meeting-message__bubble meeting-message__bubble--mingo meeting-message__bubble--typing">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                  <div className="meeting-message__avatar meeting-message__avatar--mingo">
                    <img src="/mingo-mark.svg" alt="" aria-hidden="true" />
                  </div>
                </div>
              )}
            </div>

            <form className="meeting-chat-card__input" onSubmit={handleSend}>
              <input
                type="text"
                placeholder="Ask anything"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
              />
              <button type="submit" aria-label="Send message">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm1 14.5h-2v-4H8l4-5v4h3Z" />
                </svg>
              </button>
            </form>
          </article>

          {/* Middle column: Transcript + Suggested Tasks (only when transcript exists) */}
          {uploadedTranscript && (
            <div className="meeting-side">
              <article className="meeting-card">
                <header className="meeting-card__header meeting-card__header--with-action">
                  <h2>Transcript</h2>
                  {isEditingTranscript ? (
                    <div className="meeting-transcript-actions">
                      <button
                        type="button"
                        className="meeting-transcript-btn meeting-transcript-btn--cancel"
                        onClick={() => {
                          setTranscriptContent(uploadedTranscript.content);
                          setIsEditingTranscript(false);
                          setTranscriptSaveError('');
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="meeting-transcript-btn meeting-transcript-btn--save"
                        onClick={() => void handleSaveTranscript()}
                        disabled={isSavingTranscript}
                      >
                        {isSavingTranscript ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="meeting-transcript-btn meeting-transcript-btn--edit"
                      onClick={() => setIsEditingTranscript(true)}
                    >
                      Edit
                    </button>
                  )}
                </header>
                <div className="meeting-transcript-body">
                  {isEditingTranscript ? (
                    <textarea
                      className="meeting-transcript-textarea"
                      value={transcriptContent}
                      onChange={(e) => setTranscriptContent(e.target.value)}
                    />
                  ) : (
                    <p className="meeting-transcript-text">{transcriptContent}</p>
                  )}
                  {transcriptSaveError && (
                    <p className="meeting-transcript-error">{transcriptSaveError}</p>
                  )}
                </div>
              </article>

              <article className="meeting-card">
                <header className="meeting-card__header">
                  <h2>Suggested Tasks</h2>
                </header>
                {isSuggestingTasks ? (
                  <div className="meeting-suggested-tasks-empty">
                    <p>Analyzing transcript…</p>
                  </div>
                ) : suggestedTasks.length === 0 ? (
                  <div className="meeting-suggested-tasks-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    <p>No tasks identified in this transcript.</p>
                  </div>
                ) : (
                  <>
                    <div className="meeting-suggested-tasks">
                      {suggestedTasks.map((task, i) => (
                        <div key={i} className="meeting-suggested-task-item">
                          <div className="meeting-suggested-task-text">
                            <div className="meeting-suggested-task-title-row">
                              <strong>{task.title}</strong>
                              {task.isNew && <span className="meeting-suggested-task-new">NEW</span>}
                            </div>
                            {task.description && <span>{task.description}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>
            </div>
          )}

          {/* Right column: Suggested Tasks when no transcript */}
          {!uploadedTranscript && (
            <div className="meeting-side">
              <article className="meeting-card">
                <header className="meeting-card__header">
                  <h2>Suggested Tasks</h2>
                </header>
                {suggestedTasks.length === 0 ? (
                  <div className="meeting-suggested-tasks-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                    <p>Ask Mingo to suggest tasks and they'll appear here.</p>
                  </div>
                ) : (
                  <>
                    <div className="meeting-suggested-tasks">
                      {suggestedTasks.map((task, i) => (
                        <div key={i} className="meeting-suggested-task-item">
                          <div className="meeting-suggested-task-text">
                            <div className="meeting-suggested-task-title-row">
                              <strong>{task.title}</strong>
                              {task.isNew && <span className="meeting-suggested-task-new">NEW</span>}
                            </div>
                            {task.description && <span>{task.description}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </article>
            </div>
          )}
        </section>

        {/* Tasks sidebar */}
        {showTasksSidebar && (
          <div className="tasks-sidebar__overlay" onClick={() => setShowTasksSidebar(false)} />
        )}
        <aside className={`tasks-sidebar${showTasksSidebar ? ' tasks-sidebar--open' : ''}`}>
          <div className="tasks-sidebar__header">
            <h2>Tasks</h2>
            <div className="tasks-sidebar__header-actions">
              <div className="meeting-tasks-toggle">
                <button
                  type="button"
                  className={`meeting-tasks-toggle__btn${tasksFilter === 'active' ? ' meeting-tasks-toggle__btn--active' : ''}`}
                  onClick={() => setTasksFilter('active')}
                >
                  Active
                  {openTasks.length > 0 && (
                    <span className="meeting-tasks-toggle__count">{openTasks.length}</span>
                  )}
                </button>
                <button
                  type="button"
                  className={`meeting-tasks-toggle__btn${tasksFilter === 'completed' ? ' meeting-tasks-toggle__btn--active' : ''}`}
                  onClick={() => setTasksFilter('completed')}
                >
                  Completed
                  {doneTasks.length > 0 && (
                    <span className="meeting-tasks-toggle__count">{doneTasks.length}</span>
                  )}
                </button>
              </div>
              <button
                type="button"
                className={`meeting-transcript-btn meeting-transcript-btn--edit meeting-tasks-refresh${isRefreshingTasks ? ' meeting-tasks-refresh--spinning' : ''}`}
                onClick={() => void loadTasks(false)}
                disabled={isRefreshingTasks}
                aria-label="Refresh tasks"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                </svg>
              </button>
              <button
                type="button"
                className="tasks-sidebar__close"
                onClick={() => setShowTasksSidebar(false)}
                aria-label="Close tasks"
              >
                ×
              </button>
            </div>
          </div>

          <div className="meeting-tasks tasks-sidebar__body">
            {taskUpdateError && <p className="meeting-tasks-error">{taskUpdateError}</p>}
            {filteredPanelTasks.length > 0 ? (
              filteredPanelTasks.map((task) => (
                <div key={task.id} className={`meeting-task-row${task.done ? ' meeting-task-row--done' : ''}`}>
                  <button
                    type="button"
                    className={`meeting-task-status-dot${task.done ? ' meeting-task-status-dot--done' : ' meeting-task-status-dot--todo'}`}
                    onClick={() => void toggleTask(task.id)}
                    aria-label={task.done ? 'Mark as to do' : 'Mark as done'}
                  >
                    {task.done && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  <div className="meeting-task-row-info">
                    <strong className={`meeting-task-row-title${task.done ? ' meeting-task-row-title--done' : ''}`}>
                      {task.title}
                    </strong>
                    <span className="meeting-task-row-meta">
                      {task.assignee}
                      <i>|</i>
                      {task.due}
                    </span>
                  </div>

                  <div className="meeting-task-row-badges">
                    {task.htmlUrl && (
                      <a
                        className="meeting-task-source"
                        href={task.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        GitHub
                      </a>
                    )}
                    <span className="meeting-task-tag">{task.tag}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="meeting-tasks-empty">
                <span className="meeting-tasks-empty__icon">✓</span>
                <span>{tasksFilter === 'active' ? 'No active tasks' : 'No completed tasks'}</span>
              </div>
            )}
          </div>
        </aside>
      </main>

      {showSummary && (
        <div className="meeting-summary-modal__overlay">
          <div className="meeting-summary-modal">
            {summaryLoading && (
              <div className="meeting-summary-modal__loading-shield">
                <div className="meeting-summary-modal__loading-box">
                  <div className="meeting-summary-modal__spinner" />
                  <p>Generating summary…</p>
                </div>
              </div>
            )}
            <button
              type="button"
              className="meeting-summary-modal__close"
              onClick={() => !summaryLoading && setShowSummary(false)}
              disabled={summaryLoading}
              aria-label="Close summary"
            >
              ×
            </button>

            <div className="meeting-summary__header">
              <div>
                <span className="meeting-summary__eyebrow">Meeting Summary</span>
                <h2>📝 {meetingTitle}</h2>
              </div>
            </div>

            <div className="meeting-summary__facts">
              <article className="meeting-summary__fact">
                <strong>Date</strong>
                <span>{meetingDate}</span>
              </article>
              {actualDuration && (
                <article className="meeting-summary__fact">
                  <strong>Duration</strong>
                  <span>{actualDuration}</span>
                </article>
              )}
              <article className="meeting-summary__fact">
                <strong>Repository</strong>
                <span>{repositoryLabel || '—'}</span>
              </article>
              <article className="meeting-summary__fact">
                <strong>Participants</strong>
                <span>{attendees.length}</span>
              </article>
            </div>

            <article className="meeting-summary__card">
              <h3>✨ Summary</h3>
              {summaryLoading ? (
                <div className="summary-skeleton">
                  <div className="summary-skeleton__line" />
                  <div className="summary-skeleton__line" />
                  <div className="summary-skeleton__line" />
                  <div className="summary-skeleton__line" />
                  <div className="summary-skeleton__line" />
                </div>
              ) : summaryError ? (
                <p>{summaryError}</p>
              ) : (
                <p>{summaryText || summaryNarrative}</p>
              )}
            </article>

            <article className="meeting-summary__card">
              <h3>👥 Participants Who Attended</h3>
              <div className="meeting-summary__participants">
                {attendees.map((attendee) => (
                  <span key={attendee.email || attendee.displayName}>
                    {attendee.displayName}
                  </span>
                ))}
              </div>
            </article>

            <div className="meeting-summary__tasks">
              <article className="meeting-summary__card">
                <h3>✅ Closed Tasks</h3>
                <div className="meeting-summary__task-list">
                  {completedTasks.length > 0 ? (
                    completedTasks.map((task) => (
                      <div key={task.id} className="meeting-summary__task-row">
                        <strong>{task.title}</strong>
                        <span>{task.assignee}</span>
                        <em>{task.tag}</em>
                      </div>
                    ))
                  ) : (
                    <p className="meeting-summary__empty">No tasks were closed in this meeting.</p>
                  )}
                </div>
              </article>

              <article className="meeting-summary__card">
                <h3>💡 Suggested Tasks</h3>
                {suggestedTasks.length === 0 ? (
                  <p className="meeting-summary__empty">No suggested tasks.</p>
                ) : suggestedTasksCreated ? (
                  <p className="meeting-summary__suggested-done">✓ Tasks created successfully</p>
                ) : (
                  <>
                    <div className="meeting-summary__suggested-list">
                      {suggestedTasks.map((task, i) => (
                        <label key={i} className="meeting-summary__suggested-item">
                          <input
                            type="checkbox"
                            checked={selectedSuggestedTaskIndices.has(i)}
                            onChange={() => toggleSuggestedTaskIndex(i)}
                          />
                          <span>{task.title}</span>
                        </label>
                      ))}
                    </div>
                    {suggestedTasksError && (
                      <p className="meeting-summary__suggested-error">{suggestedTasksError}</p>
                    )}
                    <button
                      type="button"
                      className="meeting-summary__suggested-btn"
                      onClick={() => void handleCreateSuggestedTasks()}
                      disabled={selectedSuggestedTaskIndices.size === 0 || isCreatingSuggestedTasks}
                    >
                      {isCreatingSuggestedTasks
                        ? 'Creating…'
                        : `Create ${selectedSuggestedTaskIndices.size} Task${selectedSuggestedTaskIndices.size !== 1 ? 's' : ''}`}
                    </button>
                  </>
                )}
              </article>
            </div>

            <div className="meeting-summary-modal__actions">
              {emailError && <p className="meeting-summary-modal__error">{emailError}</p>}
              <button
                type="button"
                className={`meeting-summary-modal__mail ${emailSent ? 'meeting-summary-modal__mail--sent' : ''}`}
                onClick={handleSendSummaryEmail}
                disabled={emailSent || emailSending || summaryLoading}
              >
                {emailSending ? 'Sending...' : emailSent ? 'Summary Sent' : 'Send by Email'}
              </button>
              <button
                type="button"
                className="meeting-summary-modal__home"
                onClick={() => navigate('/dashboard')}
              >
                Back to Home
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingPage;
