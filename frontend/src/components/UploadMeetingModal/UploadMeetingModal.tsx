import { useState, useRef } from 'react';
import type { ChangeEvent } from 'react';
import '../StartMeetingModal/StartMeetingModal.css';

interface UploadMeetingModalProps {
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

const UploadMeetingModal = ({ onClose }: UploadMeetingModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [attendees, setAttendees] = useState<string[]>(MOCK_ATTENDEES);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
    }
  };

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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <h1 className="modal-title">Upload</h1>

        <div className="modal-body">
          {/* Left — Meeting Recording */}
          <div className="modal-column">
            <h3 className="modal-column-title">Meeting Recording</h3>
            <div
              className="upload-zone"
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
                <div className="upload-zone-file">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="upload-icon">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span className="upload-filename">{file.name}</span>
                </div>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="upload-icon">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <line x1="9" y1="15" x2="12" y2="12" />
                    <line x1="15" y1="15" x2="12" y2="12" />
                  </svg>
                  <span className="upload-label">MP3</span>
                  <span className="upload-sublabel">Upload File</span>
                </>
              )}
            </div>
            <p className="upload-note">
              * Meetings' headline, date and time will be imported from this MP3 file
            </p>
          </div>

          {/* Right — Attendees */}
          <div className="modal-column">
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
        </div>

        <button className="modal-create-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Create
        </button>
      </div>
    </div>
  );
};

export default UploadMeetingModal;
