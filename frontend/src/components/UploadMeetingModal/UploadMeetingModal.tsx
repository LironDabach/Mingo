import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
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
  const [usersLoadError, setUsersLoadError] = useState('');
  const [reposLoadError, setReposLoadError] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await fetchWithAuth('/api/user');

        if (!response.ok) {
          throw new Error('Unable to load users right now.');
        }

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
              : 'Unable to load GitHub repositories right now.';
          throw new Error(message);
        }

        setRepositories(Array.isArray(data) ? (data as GitHubRepository[]) : []);
      } catch (err) {
        setReposLoadError(err instanceof Error ? err.message : 'Unable to load GitHub repositories right now.');
      }
    };

    void loadRepositories();
  }, []);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];

    if (!selected) {
      setFile(null);
      return;
    }

    const isMp3 = selected.type === 'audio/mpeg' || selected.name.toLowerCase().endsWith('.mp3');
    if (!isMp3) {
      setError('Please upload an MP3 file.');
      setFile(null);
      return;
    }

    setFile(selected);
    setError('');
  };

  const handleRemoveAttendee = (email: string) => {
    setAttendees((prev) => prev.filter((attendee) => attendee.email !== email));
  };

  const handleAddAttendee = () => {
    const normalizedEmail = emailInput.trim().toLowerCase();

    if (!normalizedEmail) {
      return;
    }

    if (!emailPattern.test(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (attendees.some((attendee) => attendee.email === normalizedEmail)) {
      setEmailInput('');
      return;
    }

    const matchedUser = availableUsers.find(
      (user) => user.email.toLowerCase() === normalizedEmail,
    );

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
  const attendeeCount = attendees.length + (pendingEmail ? 1 : 0);
  const isCreateDisabled =
    isSubmitting ||
    !title.trim() ||
    !repository.trim() ||
    !file ||
    attendeeCount === 0 ||
    Boolean(pendingEmail && !emailPattern.test(pendingEmail));

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    if (!file) {
      setError('Please upload an MP3 file.');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a meeting title.');
      return;
    }

    if (!repository.trim()) {
      setError('Please choose a GitHub repository.');
      return;
    }

    if (pendingEmail && !emailPattern.test(pendingEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    const attendeeEmails = [
      ...attendees.map((attendee) => attendee.email),
      ...(pendingEmail && !attendees.some((attendee) => attendee.email === pendingEmail)
        ? [pendingEmail]
        : []),
    ];

    if (attendeeEmails.length === 0) {
      setError('Please add at least one attendee.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', title.trim());
      formData.append('gitHubRepoName', repository.trim());
      formData.append('attendeeEmails', attendeeEmails.join(','));

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
      <div className="modal-content start-meeting-modal upload-meeting-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h1 className="modal-title">Upload Meeting</h1>

        <form onSubmit={handleCreate}>
          <div className="start-meeting-grid">
            <div className="start-meeting-column">
              <div className="start-meeting-field">
                <h3 className="modal-column-title">Title</h3>
                <input
                  className="start-meeting-repository"
                  type="text"
                  placeholder="Meeting title"
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setError('');
                  }}
                />
              </div>

              <div className="start-meeting-field">
                <h3 className="modal-column-title">GitHub Repository</h3>
                <select
                  className="start-meeting-repository"
                  value={repository}
                  onChange={(event) => setRepository(event.target.value)}
                >
                  <option value="">Select repository</option>
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.name}>
                      {repo.fullName}
                    </option>
                  ))}
                </select>
                {reposLoadError && <p className="start-meeting-users-error">{reposLoadError}</p>}
              </div>

              <div className="start-meeting-field">
                <h3 className="modal-column-title">Meeting Recording</h3>
                <button
                  type="button"
                  className="upload-zone upload-meeting-zone"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/mpeg,.mp3"
                    onChange={handleFileChange}
                    hidden
                  />
                  {file ? (
                    <span className="upload-zone-file">
                      <span className="upload-filename">{file.name}</span>
                    </span>
                  ) : (
                    <>
                      <span className="upload-label">MP3</span>
                      <span className="upload-sublabel">Upload File</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="start-meeting-column">
              <div className="start-meeting-field">
                <h3 className="modal-column-title">Attendees</h3>
                <div className="attendees-search start-meeting-attendees-search">
                  <input
                    type="email"
                    placeholder="Add email and press Enter"
                    value={emailInput}
                    onChange={(event) => setEmailInput(event.target.value)}
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

          <button className="modal-create-btn" type="submit" disabled={isCreateDisabled}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {isSubmitting ? 'Uploading...' : 'Create'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UploadMeetingModal;
