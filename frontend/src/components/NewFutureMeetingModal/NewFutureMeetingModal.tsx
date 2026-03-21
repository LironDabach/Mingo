import { useState } from 'react';
import type { FormEvent } from 'react';
import './NewFutureMeetingModal.css';

interface NewFutureMeetingModalProps {
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

const NewFutureMeetingModal = ({ onClose }: NewFutureMeetingModalProps) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
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

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h1 className="modal-title">New Future Meeting</h1>

        <form className="nfm-body" onSubmit={handleCreate}>
          {/* Left — Form fields */}
          <div className="nfm-left">
            <div className="nfm-field">
              <label>Meeting's Title</label>
              <input
                type="text"
                placeholder="ex: Q1 Strategy Review"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="nfm-field">
              <label>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="nfm-input-short"
              />
            </div>

            <div className="nfm-field">
              <label>Time</label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="nfm-input-short"
              />
            </div>
          </div>

          {/* Right — Attendees */}
          <div className="nfm-right">
            <h3 className="nfm-column-title">Attendees</h3>
            <div className="attendees-search">
              <input
                type="text"
                placeholder="ex: liron_dabach"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
              />
              <button type="button" className="attendees-search-btn" onClick={handleAddAttendee}>
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
                  <button type="button" className="attendee-remove" onClick={() => handleRemoveAttendee(name)}>
                    &times;
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Create button spanning full width */}
          <div className="nfm-footer">
            <button type="submit" className="modal-create-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewFutureMeetingModal;
