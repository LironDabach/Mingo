import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../../lib/auth';
import './StartMeetingModal.css';

interface StartMeetingModalProps {
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

const StartMeetingModal = ({ onClose }: StartMeetingModalProps) => {
  const navigate = useNavigate();
  const currentUser = getStoredUser();
  const hasActiveMeeting = Boolean(localStorage.getItem('currentMeetingId'));
  const [title, setTitle] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [attendees, setAttendees] = useState<AttendeeEntry[]>([]);
  const [repository, setRepository] = useState('');
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [usersLoadError, setUsersLoadError] = useState('');
  const [reposLoadError, setReposLoadError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const response = await fetchWithAuth('/api/user');

        if (!response.ok) {
          const body = await parseResponseBody(response);
          const message =
            typeof body === 'object' && body && 'message' in body && typeof body.message === 'string'
              ? body.message
              : response.status === 401
                ? 'Your session expired. Please sign in again.'
                : 'Unable to load users right now.';
          throw new Error(message);
        }

        const data = (await response.json()) as UserOption[];
        const users = Array.isArray(data) ? data : [];
        setAvailableUsers(
          users.filter((user) => user.email && user._id !== currentUser?._id),
        );
        setUsersLoadError('');
      } catch (err) {
        setUsersLoadError(
          err instanceof Error ? err.message : 'Unable to load users right now.',
        );
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
        setReposLoadError('');
      } catch (err) {
        setReposLoadError(
          err instanceof Error
            ? err.message
            : 'Unable to load GitHub repositories right now.',
        );
      }
    };

    void loadRepositories();
  }, []);

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

  const handleCreateMeeting = async () => {
    if (isSubmitting) {
      return;
    }

    const pendingEmail = emailInput.trim().toLowerCase();
    const attendeeEmails = [
      ...attendees.map((attendee) => attendee.email),
      ...(pendingEmail && !attendees.some((attendee) => attendee.email === pendingEmail)
        ? [pendingEmail]
        : []),
    ];
    const attendeesForDraft = [
      ...attendees,
      ...(pendingEmail && !attendees.some((attendee) => attendee.email === pendingEmail)
        ? [
            {
              email: pendingEmail,
              displayName: pendingEmail,
              isRegistered: Boolean(
                availableUsers.some((user) => user.email.toLowerCase() === pendingEmail),
              ),
            },
          ]
        : []),
    ];

    if (hasActiveMeeting) {
      setError('A live meeting is already active. Return to it before creating another one.');
      return;
    }

    if (!repository.trim()) {
      setError('Please choose a GitHub repository before creating the meeting.');
      return;
    }

    if (!title.trim()) {
      setError('Please enter a meeting title.');
      return;
    }

    if (pendingEmail && !emailPattern.test(pendingEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetchWithAuth('/api/meetings/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          gitHubRepoName: repository.trim(),
          attendeeEmails,
          status: 'live',
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Unable to start meeting right now.');
      }

      const meeting = await response.json();
      localStorage.setItem('currentMeetingId', meeting._id);
      localStorage.setItem(
        'currentMeetingDraft',
        JSON.stringify({
          id: meeting._id,
          title: meeting.title,
          date: meeting.date,
          gitHubRepoName: repository.trim(),
          attendees: attendeesForDraft,
        }),
      );
      onClose();
      navigate('/meetings/live');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to start meeting right now.';
      setError(
        message.includes('Google Calendar')
          ? `${message} Open Settings and click Re-sync Google account.`
          : message,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content start-meeting-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h1 className="modal-title">Start Meeting</h1>

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
              {reposLoadError && (
                <p className="start-meeting-users-error">{reposLoadError}</p>
              )}
            </div>
          </div>

          <div className="start-meeting-column">
            <div className="start-meeting-field">
              <h3 className="modal-column-title">
                Attendees
                <span className="upload-optional-badge">optional</span>
              </h3>
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
              {usersLoadError && (
                <p className="start-meeting-users-error">{usersLoadError}</p>
              )}
            </div>
          </div>
        </div>

        {error && <p className="start-meeting-error">{error}</p>}

        <button
          className="modal-create-btn"
          type="button"
          onClick={handleCreateMeeting}
          disabled={isSubmitting || !title.trim() || !repository.trim()}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
};

export default StartMeetingModal;
