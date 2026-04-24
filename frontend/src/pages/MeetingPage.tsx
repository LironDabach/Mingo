import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import { getStoredUser } from '../lib/auth';
import './MeetingPage.css';

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

type Topic = {
  id: number;
  title: string;
  description: string;
};

type Task = {
  id: number;
  title: string;
  assignee: string;
  due: string;
  priority: 'High' | 'Medium' | 'Low';
  tag: string;
  done: boolean;
};

const DEFAULT_TOPICS: Topic[] = [
  {
    id: 1,
    title: 'Project description and functionality',
    description: 'Define the main flow, product boundaries, and meeting goals.',
  },
  {
    id: 2,
    title: 'Design and product direction',
    description: 'Review the next UI iteration and align on experience details.',
  },
  {
    id: 3,
    title: 'Engineering follow-ups',
    description: 'Track the technical actions that came out of this discussion.',
  },
];

const DEFAULT_TASKS: Task[] = [
  {
    id: 1,
    title: 'Project description',
    assignee: 'Planning owner',
    due: 'Due to 30.12.25',
    priority: 'High',
    tag: 'MINGO-12',
    done: true,
  },
  {
    id: 2,
    title: 'Figma Design',
    assignee: 'Planning owner',
    due: 'Due to 30.12.25',
    priority: 'Low',
    tag: 'MINGO-41',
    done: false,
  },
  {
    id: 3,
    title: 'Architecture',
    assignee: 'Planning owner',
    due: 'Due to 30.12.25',
    priority: 'Medium',
    tag: 'MINGO-32',
    done: false,
  },
];

const INITIAL_MESSAGES: ChatMessage[] = [
  { id: 1, sender: 'user', text: "What's the last task given in this meeting?" },
  {
    id: 2,
    sender: 'mingo',
    text: 'The Figma Design task is assigned and still open. Pay attention that it is due by 30.12.25.',
  },
  { id: 3, sender: 'user', text: 'Thank you Mingo!' },
  { id: 4, sender: 'mingo', text: 'Always here to manage your meetings smarter!' },
];

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

  const attendees = useMemo(() => {
    const draftAttendees = parsedDraft?.attendees || [];
    const currentUserName = storedUser?.fullname || storedUser?.email || 'You';
    const merged = [{ displayName: currentUserName, email: storedUser?.email || '', isRegistered: true }, ...draftAttendees];

    return merged.filter(
      (attendee, index, array) =>
        array.findIndex((candidate) => candidate.email === attendee.email) === index,
    );
  }, [parsedDraft?.attendees, storedUser?.email, storedUser?.fullname]);

  const meetingTitle = parsedDraft?.title || 'Planning Mingo Project';
  const repositoryLabel = parsedDraft?.gitHubRepoName || 'Mingo';
  const meetingDate = formatMeetingDate(parsedDraft?.date);
  const meetingDuration = '43 min';

  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [chatInput, setChatInput] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS);

  const completedTasks = tasks.filter((task) => task.done);
  const openTasks = tasks.filter((task) => !task.done);
  const summaryNarrative = buildMeetingNarrative(
    meetingTitle,
    repositoryLabel,
    attendees.length,
    openTasks.length,
  );

  const handleSend = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = chatInput.trim();

    if (!trimmed) {
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: Date.now(), sender: 'user', text: trimmed },
      {
        id: Date.now() + 1,
        sender: 'mingo',
        text: 'The AI conversation area is ready here. Backend connection can be added later.',
      },
    ]);
    setChatInput('');
  };

  const handleEndMeeting = () => {
    setShowSummary(true);
    setEmailSent(false);
    localStorage.removeItem('currentMeetingDraft');
    localStorage.removeItem('currentMeetingId');
  };

  const handleSendSummaryEmail = () => {
    setEmailSent(true);
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
                43 min
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
              End Meeting
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
                <h2>Topics</h2>
              </header>

              <div className="meeting-topics">
                {DEFAULT_TOPICS.map((topic) => (
                  <div key={topic.id} className="meeting-topic">
                    <div className="meeting-topic__icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v4" />
                        <path d="M12 18v4" />
                        <path d="m4.93 4.93 2.83 2.83" />
                        <path d="m16.24 16.24 2.83 2.83" />
                        <path d="M2 12h4" />
                        <path d="M18 12h4" />
                        <path d="m4.93 19.07 2.83-2.83" />
                        <path d="m16.24 7.76 2.83-2.83" />
                      </svg>
                    </div>
                    <div className="meeting-topic__content">
                      <strong>{topic.title}</strong>
                      <span>{topic.description}</span>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="meeting-card">
              <header className="meeting-card__header">
                <h2>Open Tasks</h2>
              </header>

              <div className="meeting-tasks">
                {tasks.map((task) => (
                  <div key={task.id} className="meeting-task">
                    <button
                      type="button"
                      className={`meeting-task__check ${task.done ? 'meeting-task__check--done' : ''}`}
                      onClick={() => toggleTask(task.id)}
                      aria-label={task.done ? 'Mark as open' : 'Mark as done'}
                    >
                      {task.done && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>

                    <div className="meeting-task__status">
                      <span className={`meeting-task__status-icon meeting-task__status-icon--${task.done ? 'done' : task.priority.toLowerCase()}`}>
                        {task.done ? '✓' : task.priority === 'High' ? '!' : task.priority === 'Medium' ? '◌' : '○'}
                      </span>
                    </div>

                    <div className="meeting-task__content">
                      <strong>{task.title}</strong>
                      <span>
                        {task.assignee} <i>|</i> {task.due}
                      </span>
                    </div>

                    <div className="meeting-task__meta">
                      <span className={`meeting-priority meeting-priority--${task.priority.toLowerCase()}`}>
                        {task.priority}
                      </span>
                      <span className="meeting-tag">{task.tag}</span>
                    </div>
                  </div>
                ))}
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
              <article className="meeting-summary__fact">
                <strong>Duration</strong>
                <span>{meetingDuration}</span>
              </article>
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
              <p>{summaryNarrative}</p>
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
                    <p className="meeting-summary__empty">No open tasks remained after the meeting.</p>
                  )}
                </div>
              </article>
            </div>

            <div className="meeting-summary-modal__actions">
              <button
                type="button"
                className={`meeting-summary-modal__mail ${emailSent ? 'meeting-summary-modal__mail--sent' : ''}`}
                onClick={handleSendSummaryEmail}
                disabled={emailSent}
              >
                {emailSent ? 'Summary Sent' : 'Send by Email'}
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
