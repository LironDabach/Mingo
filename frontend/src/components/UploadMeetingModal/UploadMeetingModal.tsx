import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../../lib/auth';
import '../StartMeetingModal/StartMeetingModal.css';
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const formatFileSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const UploadMeetingModal = ({ onClose }: UploadMeetingModalProps) => {
  const currentUser = getStoredUser();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [repository, setRepository] = useState('');
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [attendees, setAttendees] = useState<AttendeeEntry[]>([]);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [usersLoadError, setUsersLoadError] = useState('');
  const [reposLoadError, setReposLoadError] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    setError('');
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

  const pendingEmail = emailInput.trim().toLowerCase();
  const isCreateDisabled =
    isSubmitting ||
    !title.trim() ||
    !file ||
    Boolean(pendingEmail && !emailPattern.test(pendingEmail));

  const handleCreate = async (event: FormEvent) => {
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

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload meeting right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
