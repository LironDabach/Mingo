import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { fetchWithAuth, getStoredUser, parseResponseBody } from '../../lib/auth';
import '../StartMeetingModal/StartMeetingModal.css';
import './NewFutureMeetingModal.css';

interface NewFutureMeetingModalProps {
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

const padDatePart = (value: number) => String(value).padStart(2, '0');

const formatDateInputValue = (value: Date) =>
  `${value.getFullYear()}-${padDatePart(value.getMonth() + 1)}-${padDatePart(value.getDate())}`;

const formatTimeInputValue = (value: Date) =>
  `${padDatePart(value.getHours())}:${padDatePart(value.getMinutes())}`;

const isSameLocalDate = (left: Date, right: Date) =>
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate();

const NewFutureMeetingModal = ({ onClose }: NewFutureMeetingModalProps) => {
  const currentUser = getStoredUser();
  const [emailInput, setEmailInput] = useState('');
  const [attendees, setAttendees] = useState<AttendeeEntry[]>([]);
  const [repository, setRepository] = useState('');
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserOption[]>([]);
  const [usersLoadError, setUsersLoadError] = useState('');
  const [reposLoadError, setReposLoadError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const now = new Date();
  const minDate = formatDateInputValue(now);
  const minTime = date && isSameLocalDate(new Date(`${date}T00:00`), now)
    ? formatTimeInputValue(now)
    : undefined;

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

  const buildScheduledDate = () => {
    const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);

    if (!dateMatch || !timeMatch) {
      return null;
    }

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    const scheduledDate = new Date(year, month - 1, day, hours, minutes);

    if (
      scheduledDate.getFullYear() !== year ||
      scheduledDate.getMonth() !== month - 1 ||
      scheduledDate.getDate() !== day ||
      scheduledDate.getHours() !== hours ||
      scheduledDate.getMinutes() !== minutes
    ) {
      return null;
    }

    return scheduledDate;
  };

  const handleDateChange = (nextDate: string) => {
    setError('');

    if (nextDate && nextDate < minDate) {
      setDate(minDate);
      setTime('');
      return;
    }

    setDate(nextDate);

    if (nextDate === minDate && time && time < formatTimeInputValue(new Date())) {
      setTime('');
    }
  };

  const handleTimeChange = (nextTime: string) => {
    setError('');

    if (date === minDate && nextTime && nextTime < formatTimeInputValue(new Date())) {
      setError('Please choose a future time.');
      setTime('');
      return;
    }

    setTime(nextTime);
  };

  const pendingEmail = emailInput.trim().toLowerCase();
  const attendeeCount = attendees.length + (pendingEmail ? 1 : 0);
  const scheduledDate = buildScheduledDate();
  const isCreateDisabled =
    isSubmitting ||
    !repository.trim() ||
    !scheduledDate ||
    scheduledDate.getTime() <= Date.now() ||
    attendeeCount === 0 ||
    Boolean(pendingEmail && !emailPattern.test(pendingEmail));

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const attendeeEmails = [
      ...attendees.map((attendee) => attendee.email),
      ...(pendingEmail && !attendees.some((attendee) => attendee.email === pendingEmail)
        ? [pendingEmail]
        : []),
    ];

    if (!repository.trim()) {
      setError('Please choose a GitHub repository before creating the meeting.');
      return;
    }

    if (!scheduledDate) {
      setError('Please choose a valid date and time.');
      return;
    }

    if (scheduledDate.getTime() <= Date.now()) {
      setError('Please choose a future date and time.');
      return;
    }

    if (pendingEmail && !emailPattern.test(pendingEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    if (attendeeEmails.length === 0) {
      setError('Please add at least one attendee before creating the meeting.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');

      const response = await fetchWithAuth('/api/meetings/meetings', {
        method: 'POST',
        body: JSON.stringify({
          title: `${repository.trim()} Future Meeting`,
          gitHubRepoName: repository.trim(),
          attendeeEmails,
          date: scheduledDate.toISOString(),
          status: 'upcoming',
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Unable to create the meeting right now.');
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the meeting right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content start-meeting-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={onClose} type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h1 className="modal-title">New Future Meeting</h1>

        <form onSubmit={handleCreate}>
          <div className="start-meeting-grid future-meeting-grid">
            <div className="start-meeting-column">
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

              <div className="future-meeting-datetime">
                <div className="start-meeting-field">
                  <h3 className="modal-column-title">Date</h3>
                  <input
                    className="future-meeting-input"
                    type="date"
                    min={minDate}
                    value={date}
                    onChange={(event) => handleDateChange(event.target.value)}
                  />
                </div>

                <div className="start-meeting-field">
                  <h3 className="modal-column-title">Time</h3>
                  <input
                    className="future-meeting-input"
                    type="time"
                    min={minTime}
                    value={time}
                    onChange={(event) => handleTimeChange(event.target.value)}
                  />
                </div>
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
                {usersLoadError && (
                  <p className="start-meeting-users-error">{usersLoadError}</p>
                )}
              </div>
            </div>
          </div>

          {error && <p className="start-meeting-error">{error}</p>}

          <button
            className="modal-create-btn"
            type="submit"
            disabled={isCreateDisabled}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewFutureMeetingModal;
