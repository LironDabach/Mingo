import React, { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../../lib/auth';
import '../StartMeetingModal/StartMeetingModal.css';
import '../../pages/MeetingPage.css';
import './UploadMeetingModal.css';

interface UploadMeetingModalProps {
  onClose: () => void;
}

type UserOption = {
  _id: string;
  username: string;
  fullname: string;
  email: string;
};

type AttendeeEntry = {
  email: string;
  displayName: string;
  isRegistered: boolean;
};

type GitHubRepository = {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
};

type SuggestedTask = { title: string; description: string };

type UploadResult = {
  meeting: {
    _id: string;
    title: string;
    date: string;
    duration?: number;
    gitHubRepoName?: string;
    participants: string[];
    inviteEmails: string[];
  };
  transcript: { _id: string; content: string };
  text: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

const formatTranscript = (text: string) =>
  text
    .replace(/([.!?])\s+([A-Z])/g, '$1\n\n$2')
    .trim();

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const UploadMeetingModal = ({ onClose }: UploadMeetingModalProps) => {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [repository, setRepository] = useState('');
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [attendees, setAttendees] = useState<AttendeeEntry[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [fileDurationSeconds, setFileDurationSeconds] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [usersLoadError, setUsersLoadError] = useState('');
  const [reposLoadError, setReposLoadError] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);

  const [suggestedTasks, setSuggestedTasks] = useState<SuggestedTask[]>([]);
  const [selectedTaskIndices, setSelectedTaskIndices] = useState<Set<number>>(new Set());
  const [isSuggestingTasks, setIsSuggestingTasks] = useState(false);
  const [isCreatingTasks, setIsCreatingTasks] = useState(false);
  const [tasksCreated, setTasksCreated] = useState(false);
  const [taskCreateError, setTaskCreateError] = useState('');
  const [summaryRepo, setSummaryRepo] = useState('');

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await fetchWithAuth('/api/user');
        if (!response.ok) throw new Error('Unable to load users right now.');
        const data = (await response.json()) as UserOption[];
        setAvailableUsers(
          Array.isArray(data)
            ? data.filter((user) => user.email && user._id !== currentUser?._id)
            : [],
        );
      } catch (err) {
        setUsersLoadError(err instanceof Error ? err.message : 'Unable to load users right now.');
      }
    };
    void loadUsers();
  }, [currentUser?._id]);

  useEffect(() => {
    const loadRepositories = async () => {
      try {
        const response = await fetchWithAuth('/api/auth/github/repos');
        const data = await parseResponseBody(response);
        if (!response.ok) {
          const message =
            data && typeof data === 'object' && 'message' in data && typeof data.message === 'string'
              ? data.message
              : 'Unable to load GitHub repositories.';
          throw new Error(message);
        }
        setRepositories(Array.isArray(data) ? (data as GitHubRepository[]) : []);
      } catch (err) {
        setReposLoadError(err instanceof Error ? err.message : 'Unable to load GitHub repositories.');
      }
    };
    void loadRepositories();
  }, []);

  const validateAndSetFile = (selected: File) => {
    const isMp3 = selected.type === 'audio/mpeg' || selected.name.toLowerCase().endsWith('.mp3');
    if (!isMp3) {
      setError('Only MP3 files are supported.');
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setError('File must be smaller than 25 MB.');
      return;
    }
    setFile(selected);
    setFileDurationSeconds(null);
    setError('');

    const url = URL.createObjectURL(selected);
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setFileDurationSeconds(Math.round(audio.duration));
      }
      URL.revokeObjectURL(url);
    });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (selected) validateAndSetFile(selected);
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleRemoveFile = (event: React.MouseEvent) => {
    event.stopPropagation();
    setFile(null);
    setFileDurationSeconds(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveAttendee = (email: string) => {
    setAttendees((prev) => prev.filter((a) => a.email !== email));
  };

  const handleAddAttendee = () => {
    const normalizedEmail = emailInput.trim().toLowerCase();
    if (!normalizedEmail) return;
    if (!emailPattern.test(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (attendees.some((a) => a.email === normalizedEmail)) {
      setEmailInput('');
      return;
    }
    const matchedUser = availableUsers.find((u) => u.email.toLowerCase() === normalizedEmail);
    setAttendees((prev) => [
      ...prev,
      {
        email: normalizedEmail,
        displayName: matchedUser?.fullname || normalizedEmail,
        isRegistered: Boolean(matchedUser),
      },
    ]);
    setEmailInput('');
    setError('');
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleAddAttendee();
    }
  };

  const fetchTaskSuggestions = async (meetingId: string) => {
    setIsSuggestingTasks(true);
    try {
      const response = await fetchWithAuth(`/api/meetings/${meetingId}/suggest-tasks`, { method: 'POST' });
      if (!response.ok) return;
      const data = (await response.json()) as { tasks: SuggestedTask[] };
      const tasks = data.tasks ?? [];
      setSuggestedTasks(tasks);
      setSelectedTaskIndices(new Set(tasks.map((_, i) => i)));
    } catch {
      // silently — task suggestions are optional
    } finally {
      setIsSuggestingTasks(false);
    }
  };

  const toggleTaskIndex = (index: number) => {
    setSelectedTaskIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleCreateTasks = async () => {
    if (!result || selectedTaskIndices.size === 0 || isCreatingTasks) return;

    const selectedRepoFullName =
      repositories.find((r) => r.name === summaryRepo)?.fullName ?? null;

    setIsCreatingTasks(true);
    setTaskCreateError('');

    const tasksToCreate = suggestedTasks.filter((_, i) => selectedTaskIndices.has(i));

    try {
      await Promise.all(
        tasksToCreate.map(async (task) => {
          const response = await fetchWithAuth(`/api/meetings/${result.meeting._id}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: task.title,
              description: task.description,
              createGitHubIssue: Boolean(selectedRepoFullName),
              gitHubRepoFullName: selectedRepoFullName,
            }),
          });

          if (!response.ok) {
            throw new Error('Task creation failed');
          }
        }),
      );
      setTasksCreated(true);
    } catch {
      setTaskCreateError('Some tasks could not be created. Please try again.');
    } finally {
      setIsCreatingTasks(false);
    }
  };

  const pendingEmail = emailInput.trim().toLowerCase();
  const isCreateDisabled =
    isSubmitting ||
    !title.trim() ||
    !file ||
    Boolean(pendingEmail && !emailPattern.test(pendingEmail));

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting || !file || !title.trim()) return;

    if (pendingEmail && !emailPattern.test(pendingEmail)) {
      setError('Please enter a valid email address or clear the field.');
      return;
    }

    const attendeeEmails = [
      ...attendees.map((a) => a.email),
      ...(pendingEmail && !attendees.some((a) => a.email === pendingEmail) ? [pendingEmail] : []),
    ];

    try {
      setIsSubmitting(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      if (repository.trim()) formData.append('gitHubRepoName', repository.trim());
      if (attendeeEmails.length > 0) formData.append('attendeeEmails', attendeeEmails.join(','));
      if (fileDurationSeconds !== null) formData.append('durationSeconds', String(fileDurationSeconds));

      const response = await fetchWithAuth('/api/transcript/mp3', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await parseResponseBody(response);
        const message =
          data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Unable to upload meeting right now.';
        throw new Error(message);
      }

      const data = (await response.json()) as UploadResult;
      setResult(data);
      setSummaryRepo(data.meeting.gitHubRepoName ?? '');
      void fetchTaskSuggestions(data.meeting._id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload meeting right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Summary view ────────────────────────────────────────────────────────────
  if (result) {
    const { meeting, text } = result;
    return (
      <div className="meeting-summary-modal__overlay" onClick={onClose}>
        <div className="meeting-summary-modal upload-summary-modal" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="meeting-summary-modal__close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>

          <div className="meeting-summary__header">
            <div>
              <span className="meeting-summary__eyebrow">Meeting Summary</span>
              <h2>📝 {meeting.title}</h2>
            </div>
          </div>

          <div className="meeting-summary__facts">
            <article className="meeting-summary__fact">
              <strong>Date</strong>
              <span>{formatDate(meeting.date)}</span>
            </article>
            <article className="meeting-summary__fact">
              <strong>Duration</strong>
              <span>{meeting.duration ? formatDuration(meeting.duration) : '—'}</span>
            </article>
            <article className="meeting-summary__fact">
              <strong>Repository</strong>
              <span>{meeting.gitHubRepoName || '—'}</span>
            </article>
            <article className="meeting-summary__fact">
              <strong>Attendees</strong>
              <span>{attendees.length > 0 ? attendees.length : '—'}</span>
            </article>
          </div>

          <div className="upload-summary-columns">
            <article className="meeting-summary__card upload-transcript-card">
              <h3>📄 Transcript</h3>
              <p className="upload-transcript-text">{formatTranscript(text)}</p>
            </article>

            <div className="upload-summary-right">
              {attendees.length > 0 && (
                <article className="meeting-summary__card">
                  <h3>👥 Attendees</h3>
                  <div className="meeting-summary__participants">
                    {attendees.map((a) => (
                      <span key={a.email}>{a.displayName}</span>
                    ))}
                  </div>
                </article>
              )}

              <article className="meeting-summary__card">
                <h3>
                  ✅ Suggested Tasks
                  {isSuggestingTasks && <span className="upload-tasks-loading"> — analyzing…</span>}
                </h3>

                <div className="upload-repo-selector">
                  <label htmlFor="summary-repo-select">GitHub Repository</label>
                  <select
                    id="summary-repo-select"
                    value={summaryRepo}
                    onChange={(e) => setSummaryRepo(e.target.value)}
                    disabled={isCreatingTasks || tasksCreated}
                  >
                    <option value="">— No repository (save locally only) —</option>
                    {repositories.map((r) => (
                      <option key={r.id} value={r.name}>{r.fullName}</option>
                    ))}
                  </select>
                </div>

                {!isSuggestingTasks && suggestedTasks.length === 0 && (
                  <p className="meeting-summary__empty">No tasks identified in this transcript.</p>
                )}

                {suggestedTasks.length > 0 && (
                  <div className="upload-tasks-list">
                    {suggestedTasks.map((task, i) => (
                      <label key={i} className="upload-task-item">
                        <input
                          type="checkbox"
                          checked={selectedTaskIndices.has(i)}
                          onChange={() => toggleTaskIndex(i)}
                        />
                        <div className="upload-task-text">
                          <strong>{task.title}</strong>
                          {task.description && <span>{task.description}</span>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}

                {taskCreateError && (
                  <p className="start-meeting-error upload-task-error">{taskCreateError}</p>
                )}
              </article>
            </div>
          </div>

          <div className="meeting-summary-modal__actions">
            {tasksCreated ? (
              <span className="upload-tasks-done">✓ Tasks created successfully</span>
            ) : selectedTaskIndices.size > 0 ? (
              <button
                type="button"
                className="meeting-summary-modal__mail"
                onClick={handleCreateTasks}
                disabled={isCreatingTasks}
              >
                {isCreatingTasks
                  ? 'Creating…'
                  : summaryRepo
                    ? `Create ${selectedTaskIndices.size} Task${selectedTaskIndices.size > 1 ? 's' : ''} in ${summaryRepo}`
                    : `Save ${selectedTaskIndices.size} Task${selectedTaskIndices.size > 1 ? 's' : ''} Locally`}
              </button>
            ) : null}
            <button
              type="button"
              className="meeting-summary-modal__mail"
              onClick={() => {
                localStorage.setItem('currentMeetingId', meeting._id);
                localStorage.setItem(
                  'currentMeetingDraft',
                  JSON.stringify({
                    id: meeting._id,
                    title: meeting.title,
                    date: meeting.date,
                    gitHubRepoName: meeting.gitHubRepoName || '',
                    attendees,
                  }),
                );
                localStorage.setItem(
                  'uploadedTranscript',
                  JSON.stringify({ transcriptId: result.transcript._id, content: text }),
                );
                localStorage.setItem('uploadedSuggestedTasks', JSON.stringify(suggestedTasks));
                onClose();
                navigate('/meeting');
              }}
            >
              View in Meeting
            </button>
            <button type="button" className="meeting-summary-modal__home" onClick={onClose}>
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Upload form ─────────────────────────────────────────────────────────────
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content start-meeting-modal upload-meeting-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" onClick={onClose} type="button" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h1 className="modal-title">Upload Meeting</h1>
        <p className="upload-meeting-subtitle">Transcribe and summarize a recorded meeting automatically</p>

        <form onSubmit={handleCreate}>
          <div className="start-meeting-grid">
            <div className="start-meeting-column">
              <div className="start-meeting-field">
                <h3 className="modal-column-title">Meeting Title</h3>
                <input
                  className="start-meeting-repository"
                  type="text"
                  placeholder="e.g. Sprint Planning — June 2025"
                  value={title}
                  onChange={(e) => { setTitle(e.target.value); setError(''); }}
                />
              </div>

              <div className="start-meeting-field">
                <h3 className="modal-column-title">Recording File</h3>
                <button
                  type="button"
                  className={[
                    'upload-zone upload-meeting-zone',
                    isDragging ? 'upload-meeting-zone--dragging' : '',
                    file ? 'upload-meeting-zone--has-file' : '',
                  ].join(' ')}
                  onClick={() => { if (!file) fileInputRef.current?.click(); }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mpeg,.mp3"
                    onChange={handleFileChange}
                    hidden
                  />
                  {file ? (
                    <div className="upload-file-info">
                      <div className="upload-file-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18V5l12-2v13" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="16" r="3" />
                        </svg>
                      </div>
                      <span className="upload-filename">{file.name}</span>
                      <span className="upload-filesize">{formatFileSize(file.size)}</span>
                      <button type="button" className="upload-remove-file" onClick={handleRemoveFile}>
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="upload-empty">
                      <svg className="upload-cloud-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 16 12 12 8 16" />
                        <line x1="12" y1="12" x2="12" y2="21" />
                        <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
                      </svg>
                      <span className="upload-label">Drag & drop or click to upload</span>
                      <span className="upload-sublabel">MP3 · max 25 MB</span>
                    </div>
                  )}
                </button>
              </div>
            </div>

            <div className="start-meeting-column">
              <div className="start-meeting-field">
                <h3 className="modal-column-title">
                  GitHub Repository
                  <span className="upload-optional-badge">optional</span>
                </h3>
                {reposLoadError ? (
                  <p className="start-meeting-users-error upload-repos-error">{reposLoadError}</p>
                ) : (
                  <select
                    className="start-meeting-repository"
                    value={repository}
                    onChange={(e) => setRepository(e.target.value)}
                  >
                    <option value="">No repository</option>
                    {repositories.map((repo) => (
                      <option key={repo.id} value={repo.name}>
                        {repo.fullName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="start-meeting-field">
                <h3 className="modal-column-title">
                  Attendees
                  <span className="upload-optional-badge">optional</span>
                </h3>
                <div className="attendees-search start-meeting-attendees-search">
                  <input
                    type="text"
                    placeholder="Add email and press Enter"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                  />
                  <button type="button" className="attendees-search-btn" onClick={handleAddAttendee}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </button>
                </div>

                <ul className="attendees-list start-meeting-attendees-list">
                  {attendees.map((attendee) => (
                    <li key={attendee.email} className="attendee-item start-meeting-attendee-item">
                      <span className="attendee-dot" />
                      <span className="attendee-name">
                        <strong>{attendee.displayName}</strong>
                        {!attendee.isRegistered && attendee.displayName !== attendee.email && (
                          <small>{attendee.email}</small>
                        )}
                      </span>
                      <button
                        type="button"
                        className="attendee-remove"
                        onClick={() => handleRemoveAttendee(attendee.email)}
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
                {usersLoadError && <p className="start-meeting-users-error">{usersLoadError}</p>}
              </div>
            </div>
          </div>

          {error && <p className="start-meeting-error">{error}</p>}

          <button className="modal-create-btn upload-submit-btn" type="submit" disabled={isCreateDisabled}>
            {isSubmitting ? (
              <>
                <span className="upload-spinner" />
                Transcribing…
              </>
            ) : (
              <>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 16 12 12 8 16" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
                </svg>
                Upload & Transcribe
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UploadMeetingModal;
