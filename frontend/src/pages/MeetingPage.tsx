import { useState } from 'react';
import type { FormEvent } from 'react';
import Header from '../components/Header/Header';
import './MeetingPage.css';

interface ChatMessage {
  id: number;
  sender: 'user' | 'mingo';
  text: string;
}

interface Task {
  id: number;
  title: string;
  assignee: string;
  due: string;
  priority: 'High' | 'Medium' | 'Low';
  tag: string;
  done: boolean;
  fromMeeting?: string;
}

const ATTENDEES = ['Liron Dabach', 'Shiran Levi', 'Sean Nedorez', 'Tal Gohar'];

const MOCK_MESSAGES: ChatMessage[] = [
  { id: 1, sender: 'user', text: "What's the last task given in this meeting?" },
  { id: 2, sender: 'mingo', text: 'The Figma Design task that Liron Dabach is assigned to.\nPay attention that this task has to be done by 30.12.25!' },
  { id: 3, sender: 'user', text: 'Thank you Mingo!' },
  { id: 4, sender: 'mingo', text: 'Always here to manage your meetings smarter!' },
];

const PREVIOUS_TASKS: Task[] = [
  { id: 101, title: 'Setup CI/CD Pipeline', assignee: 'Sean Nedorez', due: 'Due to 15.11.25', priority: 'High', tag: 'MINGO-08', done: true, fromMeeting: 'Sprint 4 Kickoff â€” 10.11.25' },
  { id: 102, title: 'API Documentation', assignee: 'Liron Dabach', due: 'Due to 20.11.25', priority: 'Medium', tag: 'MINGO-09', done: false, fromMeeting: 'Sprint 4 Kickoff â€” 10.11.25' },
  { id: 103, title: 'Database Schema Review', assignee: 'Tal Gohar', due: 'Due to 12.11.25', priority: 'Low', tag: 'MINGO-07', done: true, fromMeeting: 'Architecture Review â€” 05.11.25' },
];

const INITIAL_CURRENT_TASKS: Task[] = [
  { id: 1, title: 'Project description', assignee: 'Liron Dabach', due: 'Due to 30.12.25', priority: 'High', tag: 'MINGO-12', done: true },
  { id: 2, title: 'Figma Design', assignee: 'Liron Dabach', due: 'Due to 30.12.25', priority: 'Low', tag: 'MINGO-41', done: false },
  { id: 3, title: 'Architecture', assignee: 'Tal Gohar', due: 'Due to 30.12.25', priority: 'Medium', tag: 'MINGO-32', done: false },
];

const MeetingPage = () => {
  const [messages, setMessages] = useState<ChatMessage[]>(MOCK_MESSAGES);
  const [input, setInput] = useState('');
  const [currentTasks, setCurrentTasks] = useState<Task[]>(INITIAL_CURRENT_TASKS);
  const [showCreateTask, setShowCreateTask] = useState(false);

  // New task form state
  const [showSummary, setShowSummary] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // New task form state
  const [newTitle, setNewTitle] = useState('');
  const [newAssignee, setNewAssignee] = useState(ATTENDEES[0] ?? '');
  const [newPriority, setNewPriority] = useState<'High' | 'Medium' | 'Low'>('Medium');
  const [newDue, setNewDue] = useState('');

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMsg: ChatMessage = { id: Date.now(), sender: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    setTimeout(() => {
      const mingoMsg: ChatMessage = {
        id: Date.now() + 1,
        sender: 'mingo',
        text: "I'm analyzing your request. Let me check the meeting data...",
      };
      setMessages((prev) => [...prev, mingoMsg]);
    }, 800);
  };

  const handleCreateTask = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const task: Task = {
      id: Date.now(),
      title: newTitle.trim(),
      assignee: newAssignee,
      due: newDue ? `Due to ${newDue}` : '',
      priority: newPriority,
      tag: `MINGO-${Math.floor(Math.random() * 90) + 10}`,
      done: false,
    };
    setCurrentTasks((prev) => [...prev, task]);
    setNewTitle('');
    setNewAssignee(ATTENDEES[0] ?? '');
    setNewPriority('Medium');
    setNewDue('');
    setShowCreateTask(false);
  };

  const toggleTaskDone = (id: number) => {
    setCurrentTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t))
    );
  };

  const handleEndMeeting = () => {
    setShowSummary(true);
    setEmailSent(false);
  };

  const handleSendEmail = () => {
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 3000);
  };

  const completedCurrent = currentTasks.filter((t) => t.done);
  const remainingCurrent = currentTasks.filter((t) => !t.done);
  const completedPrevious = PREVIOUS_TASKS.filter((t) => t.done);
  const remainingPrevious = PREVIOUS_TASKS.filter((t) => !t.done);

  return (
    <div className="meeting-layout">
      <div className="meeting-top-bar">Live Meeting</div>
      <Header />

      <main className="meeting-main">
        {/* Meeting Header */}
        <div className="meeting-header">
          <div className="meeting-header-left">
            <div className="meeting-title-row">
              <h1>Planning Mingo Project</h1>
              <button className="meeting-edit-btn" title="Edit">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>
            <div className="meeting-meta">
              <span className="meeting-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                17.11.25, 10:00
              </span>
              <span className="meeting-meta-divider">|</span>
              <span className="meeting-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                4
              </span>
              <span className="meeting-meta-divider">|</span>
              <span className="meeting-meta-item">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                43 min
              </span>
            </div>
          </div>
          <div className="meeting-header-actions">
            <button className="end-meeting-btn" onClick={handleEndMeeting}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              End Meeting
            </button>
          </div>
        </div>

        {/* Content Grid */}
        <div className="meeting-grid">
          {/* Chat */}
          <div className="meeting-chat">
            <div className="meeting-chat-header">
              Chat with <span className="mingo-brand">Min<span>go</span></span>
            </div>
            <div className="meeting-chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-msg chat-msg--${msg.sender}`}>
                  {msg.sender === 'user' && (
                    <div className="chat-avatar chat-avatar--user">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v2h20v-2c0-3.3-6.7-5-10-5z" /></svg>
                    </div>
                  )}
                  <div className="chat-bubble">
                    {msg.text.split('\n').map((line, i) => (
                      <span key={i}>{line}{i < msg.text.split('\n').length - 1 && <br />}</span>
                    ))}
                  </div>
                  {msg.sender === 'mingo' && (
                    <div className="chat-avatar chat-avatar--mingo">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <form className="meeting-chat-input" onSubmit={handleSend}>
              <input
                type="text"
                placeholder="Ask anything"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" className="chat-send-btn">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5H7l5-7v5h4l-5 7z" />
                </svg>
              </button>
            </form>
          </div>

          {/* Right Side */}
          <div className="meeting-right">
            {/* Current Meeting Tasks */}
            <div className="meeting-section">
              <div className="meeting-section-header">
                <h2 className="meeting-section-title">Current Meeting Tasks</h2>
                <button className="add-task-btn" onClick={() => setShowCreateTask(true)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Task
                </button>
              </div>
              <div className="meeting-tasks-list">
                {currentTasks.map((task) => (
                  <div key={task.id} className="meeting-task-item">
                    <span
                      className={`mt-checkbox ${task.done ? 'mt-checkbox--done' : ''}`}
                      onClick={() => toggleTaskDone(task.id)}
                    >
                      {task.done && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                    <div className="mt-task-info">
                      <span className={`mt-task-title ${task.done ? 'mt-task-title--done' : ''}`}>{task.title}</span>
                      <span className="mt-task-meta">
                        <svg className="mt-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        {task.assignee}
                        {task.due && <> Â· {task.due}</>}
                      </span>
                    </div>
                    <div className="mt-task-badges">
                      <span className={`priority-badge priority-badge--${task.priority.toLowerCase()}`}>{task.priority}</span>
                      <span className="task-tag">{task.tag}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Previous Meeting Tasks */}
            <div className="meeting-section">
              <h2 className="meeting-section-title">Tasks from Previous Meetings</h2>
              <div className="meeting-tasks-list">
                {PREVIOUS_TASKS.map((task) => (
                  <div key={task.id} className="meeting-task-item prev-task-item">
                    <span className={`mt-checkbox ${task.done ? 'mt-checkbox--done' : ''}`}>
                      {task.done && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                    <div className="mt-task-info">
                      <span className={`mt-task-title ${task.done ? 'mt-task-title--done' : ''}`}>{task.title}</span>
                      <span className="mt-task-meta">
                        <svg className="mt-meta-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                        {task.assignee}
                        {task.due && <> Â· {task.due}</>}
                      </span>
                    </div>
                    <div className="mt-task-badges">
                      <span className={`priority-badge priority-badge--${task.priority.toLowerCase()}`}>{task.priority}</span>
                      <span className="task-tag">{task.tag}</span>
                    </div>
                    {/* Tooltip */}
                    <div className="prev-task-tooltip">
                      ðŸ“… {task.fromMeeting}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Meeting Summary Overlay */}
      {showSummary && (
        <div className="modal-overlay" onClick={() => setShowSummary(false)}>
          <div className="summary-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowSummary(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            <div className="summary-header">
              <div className="summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
                </svg>
              </div>
              <h2>Meeting Summary</h2>
              <p className="summary-subtitle">Planning Mingo Project</p>
            </div>

            <div className="summary-info-row">
              <div className="summary-info-card">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>17.11.25, 10:00</span>
              </div>
              <div className="summary-info-card">
                <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                </svg>
                <span>Duration: 43 min</span>
              </div>
            </div>

            {/* Participants */}
            <div className="summary-section">
              <h3 className="summary-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                </svg>
                Participants ({ATTENDEES.length})
              </h3>
              <div className="summary-participants">
                {ATTENDEES.map((name) => (
                  <span key={name} className="participant-chip">{name}</span>
                ))}
              </div>
            </div>

            {/* Written Summary */}
            <div className="summary-section">
              <h3 className="summary-section-title">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="8" y1="8" x2="16" y2="8" /><line x1="8" y1="12" x2="16" y2="12" /><line x1="8" y1="16" x2="12" y2="16" />
                </svg>
                Meeting Notes
              </h3>
              <div className="summary-notes">
                <p>The team met to discuss the planning phase of the Mingo project. The meeting covered three main areas:</p>
                <p><strong>1. Project Overview &amp; Description</strong> — Liron Dabach presented the project scope and core functionality. The team agreed that Mingo will serve as an AI-powered meeting management tool that integrates with Jira for task tracking. This task was completed during the meeting.</p>
                <p><strong>2. UI/UX Design</strong> — The Figma design work was assigned to Liron Dabach with a deadline of 30.12.25. The design should include the dashboard, meeting page, and all modal components. The team reviewed initial wireframes and provided feedback.</p>
                <p><strong>3. Architecture &amp; Technical Stack</strong> — Tal Gohar is leading the architecture planning. The team discussed using React + TypeScript for the frontend and Node.js for the backend, with MongoDB as the database. CI/CD pipeline setup (from previous sprint) was confirmed as completed by Sean Nedorez.</p>
                <p>Previous items were also reviewed: API Documentation is still in progress (Liron), and the Database Schema Review was confirmed done by Tal.</p>
                <p><strong>Next Steps:</strong> Complete Figma designs, finalize architecture document, and continue API documentation before the next meeting.</p>
              </div>
            </div>

            {/* Completed Tasks */}
            <div className="summary-section">
              <h3 className="summary-section-title summary-section-title--green">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Completed Tasks ({completedCurrent.length + completedPrevious.length})
              </h3>
              <div className="summary-task-list">
                {completedCurrent.map((t) => (
                  <div key={t.id} className="summary-task-row">
                    <span className="summary-task-check done">&#10003;</span>
                    <span className="summary-task-name">{t.title}</span>
                    <span className="summary-task-assignee">{t.assignee}</span>
                    <span className={`priority-badge priority-badge--${t.priority.toLowerCase()}`}>{t.priority}</span>
                  </div>
                ))}
                {completedPrevious.map((t) => (
                  <div key={t.id} className="summary-task-row">
                    <span className="summary-task-check done">&#10003;</span>
                    <span className="summary-task-name">{t.title} <small className="from-label">(prev)</small></span>
                    <span className="summary-task-assignee">{t.assignee}</span>
                    <span className={`priority-badge priority-badge--${t.priority.toLowerCase()}`}>{t.priority}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Remaining Tasks */}
            <div className="summary-section">
              <h3 className="summary-section-title summary-section-title--orange">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Remaining Tasks ({remainingCurrent.length + remainingPrevious.length})
              </h3>
              <div className="summary-task-list">
                {remainingCurrent.map((t) => (
                  <div key={t.id} className="summary-task-row">
                    <span className="summary-task-check pending">&#9675;</span>
                    <span className="summary-task-name">{t.title}</span>
                    <span className="summary-task-assignee">{t.assignee}</span>
                    <span className={`priority-badge priority-badge--${t.priority.toLowerCase()}`}>{t.priority}</span>
                    {t.due && <span className="summary-task-due">{t.due}</span>}
                  </div>
                ))}
                {remainingPrevious.map((t) => (
                  <div key={t.id} className="summary-task-row">
                    <span className="summary-task-check pending">&#9675;</span>
                    <span className="summary-task-name">{t.title} <small className="from-label">(prev)</small></span>
                    <span className="summary-task-assignee">{t.assignee}</span>
                    <span className={`priority-badge priority-badge--${t.priority.toLowerCase()}`}>{t.priority}</span>
                    {t.due && <span className="summary-task-due">{t.due}</span>}
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="summary-actions">
              <button className={`summary-email-btn ${emailSent ? 'summary-email-btn--sent' : ''}`} onClick={handleSendEmail} disabled={emailSent}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="22 7 12 13 2 7" />
                </svg>
                {emailSent ? 'Summary Sent!' : 'Send Summary via Email'}
              </button>
              <button className="summary-close-btn" onClick={() => setShowSummary(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showCreateTask && (
        <div className="modal-overlay" onClick={() => setShowCreateTask(false)}>
          <div className="create-task-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowCreateTask(false)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
            <h2 className="create-task-title">New Task</h2>
            <form onSubmit={handleCreateTask} className="create-task-form">
              <div className="ct-field">
                <label>Title <span className="required">*</span></label>
                <input type="text" placeholder="ex: Design review" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />
              </div>
              <div className="ct-field">
                <label>Assign to</label>
                <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)}>
                  {ATTENDEES.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="ct-row">
                <div className="ct-field">
                  <label>Priority</label>
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value as 'High' | 'Medium' | 'Low')}>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <div className="ct-field">
                  <label>Due date</label>
                  <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="ct-submit-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Create Task
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MeetingPage;
