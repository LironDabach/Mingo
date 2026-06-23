import { useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import { fetchWithAuth, getStoredUser } from '../lib/auth';
import './MeetingPage.css';
import { useEffect } from 'react';

type DraftAttendee = {
  email: string;
  displayName: string;
  isRegistered: boolean;
};

type MeetingDraft = {
  id?: string;
  title?: string;
  date?: string;
  gitHubRepoName?: string;
  attendees?: DraftAttendee[];
};

type ChatMessage = {
  id: number;
  sender: 'user' | 'mingo';
  text: string;
};

type Task = {
  id: number;
  title: string;
  assignee: string;
  due: string;
  tag: string;
  done: boolean;
  htmlUrl?: string;
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
  const parsedDraft = rawDraft ? (JSON.parse(rawDraft) as MeetingDraft) : null;
  const initialMeetingId =
    parsedDraft?.id ||
    localStorage.getItem('currentMeetingId') ||
    localStorage.getItem('lastSummaryMeetingId') ||
    '';
  const meetingIdRef = useRef(initialMeetingId);

  const attendees = useMemo(() => {
    const draftAttendees = parsedDraft?.attendees || [];
    const currentUserName = storedUser?.fullname || storedUser?.email || 'You';
    const merged = [{ displayName: currentUserName, email: storedUser?.email || '', isRegistered: true }, ...draftAttendees];

    return merged.filter(
      (attendee, index, array) =>
        array.findIndex((candidate) => candidate.email === attendee.email) === index,
    );
  }, [parsedDraft?.attendees, storedUser?.email, storedUser?.fullname]);

  const meetingTitle = parsedDraft?.title || 'Live Meeting';
  const repositoryLabel = parsedDraft?.gitHubRepoName || '';
  const meetingDate = formatMeetingDate(parsedDraft?.date);
  const [actualDuration, setActualDuration] = useState('');

  const [messages, setMessages] = useState<ChatMessage[]>([]);

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

        if (data?.messages) {
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

  const [isMingoTyping, setIsMingoTyping] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summaryText, setSummaryText] = useState('');
  const [summaryMeetingId, setSummaryMeetingId] = useState(initialMeetingId);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    const loadTasks = async () => {

      const meetingId =
        meetingIdRef.current ||
        parsedDraft?.id ||
        localStorage.getItem('currentMeetingId') ||
        '';

      const repo = parsedDraft?.gitHubRepoName || repositoryLabel;

      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const userId = user.id || user._id;

      if (!userId || !repo) return;

      try {
        const response = await fetchWithAuth(
          `/api/users/${userId}/tasks?repo=${encodeURIComponent(repo)}`
        );

        if (!response.ok) {
          throw new Error('Failed to load tasks');
        }

        const data = await response.json();

        const backendTasks = (data.tasks || data || []).map(
          (task: any, index: number) => ({
            id: task.id || task._id || Date.now() + index,
            title: task.title || task.description || 'Untitled task',
            assignee: task.assignee || task.assigneeName || task.owner || 'Unassigned',
            due: task.due || task.dueDate || 'No due date',
            tag: task.tag || task.jiraKey || `TASK-${task.gitHubIssueId || index + 1}`,
            htmlUrl: task.htmlUrl || task.html_url || '',
            done:
              typeof task.status === 'string' &&
              task.status.toLowerCase() === 'done',
          })
        );

        if (backendTasks.length > 0) {
          setTasks(backendTasks);
        }
      } catch (error) {
        console.error('Failed to load tasks:', error);
      }
    };

    loadTasks();
  }, []);

  const completedTasks = tasks.filter((task) => task.done);
  const openTasks = tasks.filter((task) => !task.done);
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
          body: JSON.stringify({ message: trimmed }),
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

  const toggleTask = (taskId: number) => {
    setTasks((prev) =>
      prev.map((task) => (task.id === taskId ? { ...task, done: !task.done } : task)),
    );
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
                Live
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
            <header className="meeting-card__header">
              <h2>
                Chat with <span>Mingo</span>
              </h2>
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
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2a8 8 0 0 0-8 8v3.6c0 .7-.3 1.3-.8 1.7L2 16.5V18h20v-1.5l-1.2-1.2c-.5-.5-.8-1.1-.8-1.7V10a8 8 0 0 0-8-8Zm-3 7h6v2H9V9Zm0 4h4v2H9v-2Z" />
                      </svg>
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
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2a8 8 0 0 0-8 8v3.6c0 .7-.3 1.3-.8 1.7L2 16.5V18h20v-1.5l-1.2-1.2c-.5-.5-.8-1.1-.8-1.7V10a8 8 0 0 0-8-8Zm-3 7h6v2H9V9Zm0 4h4v2H9v-2Z" />
                    </svg>
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

          <div className="meeting-side">
            <article className="meeting-card">
              <header className="meeting-card__header">
                <h2>Open Tasks</h2>
              </header>

              <div className="meeting-tasks">
                {openTasks.length > 0 ? (
                  openTasks.map((task) => (
                    <div key={task.id} className="meeting-task-row">
                      <button
                        type="button"
                        className="meeting-task-status-dot meeting-task-status-dot--todo"
                        onClick={() => toggleTask(task.id)}
                        aria-label="Mark as done"
                      />

                      <div className="meeting-task-row-info">
                        <strong className="meeting-task-row-title">
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
                    <span>No open tasks</span>
                  </div>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>

      {showSummary && (
        <div className="meeting-summary-modal__overlay">
          <div className="meeting-summary-modal">
            <button
              type="button"
              className="meeting-summary-modal__close"
              onClick={() => setShowSummary(false)}
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
                <span>{repositoryLabel}</span>
              </article>
              <article className="meeting-summary__fact">
                <strong>Participants</strong>
                <span>{attendees.length}</span>
              </article>
            </div>

            <article className="meeting-summary__card">
              <h3>✨ Summary</h3>
              {summaryLoading ? (
                <p>Generating summary...</p>
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
                <h3>🕒 Remaining Tasks</h3>
                <div className="meeting-summary__task-list">
                  {openTasks.length > 0 ? (
                    openTasks.map((task) => (
                      <div key={task.id} className="meeting-summary__task-row">
                        <strong>{task.title}</strong>
                        <span>{task.assignee}</span>
                        <em>{task.due}</em>
                      </div>
                    ))
                  ) : (
                    <div className="meeting-summary__empty">
                      No open tasks.
                    </div>
                  )}
                </div>
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
