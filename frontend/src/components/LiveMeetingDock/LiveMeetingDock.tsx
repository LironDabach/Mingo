import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './LiveMeetingDock.css';

type MeetingDraft = {
  title?: string;
  gitHubRepoName?: string;
};

const LiveMeetingDock = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [hasLiveMeeting, setHasLiveMeeting] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('Live Meeting');
  const [repositoryLabel, setRepositoryLabel] = useState('');

  useEffect(() => {
    const syncFromStorage = () => {
      const currentMeetingId = localStorage.getItem('currentMeetingId');
      const rawDraft = localStorage.getItem('currentMeetingDraft');
      const draft = rawDraft ? (JSON.parse(rawDraft) as MeetingDraft) : null;

      setHasLiveMeeting(Boolean(currentMeetingId));
      setMeetingTitle(draft?.title || 'Live Meeting');
      setRepositoryLabel(draft?.gitHubRepoName || '');
    };

    syncFromStorage();
    window.addEventListener('storage', syncFromStorage);

    return () => window.removeEventListener('storage', syncFromStorage);
  }, []);

  useEffect(() => {
    const rawDraft = localStorage.getItem('currentMeetingDraft');
    const draft = rawDraft ? (JSON.parse(rawDraft) as MeetingDraft) : null;
    setHasLiveMeeting(Boolean(localStorage.getItem('currentMeetingId')));
    setMeetingTitle(draft?.title || 'Live Meeting');
    setRepositoryLabel(draft?.gitHubRepoName || '');
  }, [location.pathname]);

  if (!hasLiveMeeting || location.pathname === '/meetings/live') {
    return null;
  }

  return (
    <button
      type="button"
      className="live-meeting-dock"
      onClick={() => navigate('/meetings/live')}
    >
      <span className="live-meeting-dock__pulse" />
      <div className="live-meeting-dock__content">
        <strong>LIVE MEETING</strong>
        <span>{repositoryLabel || meetingTitle}</span>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 9l5 3-5 3V9Z" />
        <rect x="3" y="7" width="11" height="10" rx="2" />
      </svg>
    </button>
  );
};

export default LiveMeetingDock;
