import { useState } from 'react';
import './StartMeetingModal.css';

interface StartMeetingModalProps {
  onClose: () => void;
}

const MOCK_ATTENDEES = [
  'liron_dabach',
  'shiran_levi',
  'sean_nedorez',
  'tal_gohar',
  'or_sivan',
  'matan_gal',
];

const StartMeetingModal = ({ onClose }: StartMeetingModalProps) => {
  const [search, setSearch] = useState('');
  const [attendees, setAttendees] = useState<string[]>(MOCK_ATTENDEES);

  const handleRemoveAttendee = (name: string) => {
    setAttendees((prev) => prev.filter((a) => a !== name));
  };

  const handleAddAttendee = () => {
    const trimmed = search.trim();
    if (trimmed && !attendees.includes(trimmed)) {
      setAttendees((prev) => [...prev, trimmed]);
      setSearch('');
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddAttendee();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content start-meeting-narrow" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h1 className="modal-title">Start Meeting</h1>

        <div className="start-meeting-body">
          <h3 className="modal-column-title">Attendees</h3>
          <div className="attendees-search">
            <input
              type="text"
              placeholder="ex: liron_dabach"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
            <button className="attendees-search-btn" onClick={handleAddAttendee}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
          </div>
          <ul className="attendees-list">
            {attendees.map((name) => (
              <li key={name} className="attendee-item">
                <span className="attendee-dot" />
                <span className="attendee-name">{name}</span>
                <button className="attendee-remove" onClick={() => handleRemoveAttendee(name)}>
                  &times;
                </button>
              </li>
            ))}
          </ul>
        </div>

        <button className="modal-create-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Start
        </button>
      </div>
    </div>
  );
};

export default StartMeetingModal;
