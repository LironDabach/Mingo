import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import StartMeetingModal from '../components/StartMeetingModal/StartMeetingModal';
import NewFutureMeetingModal from '../components/NewFutureMeetingModal/NewFutureMeetingModal';
import UploadMeetingModal from '../components/UploadMeetingModal/UploadMeetingModal';
import './DashboardPage.css';

const upcomingMeetings = [
  { id: 1, title: 'Q1 Strategy Review', date: 'Friday, 15:00', participants: 3, icon: '📋' },
  { id: 2, title: 'Code Review', date: 'Today, 09:00', participants: 1, icon: '📋' },
  { id: 3, title: 'Q7 Strategy Review', date: '21.01.26, 09:00', participants: 1, icon: '📋' },
  { id: 4, title: 'Q3 Strategy Review', date: '24.01.26, 09:00', participants: 1, icon: '📋' },
];

const openTasks = [
  { id: 1, title: 'Figma Design', assignee: 'Planning...', dueDate: 'John Deborah', priority: 'Low', tag: 'MNGO-41', done: false },
  { id: 2, title: 'Work Plan', assignee: 'Planning...', dueDate: 'Noel Reston', priority: 'Low', tag: 'MNGO-40', done: false },
  { id: 3, title: 'Architecture', assignee: 'Planning...', dueDate: 'Sul...', priority: 'Medium', tag: 'MNGO-32', done: false },
  { id: 4, title: 'Project description', assignee: 'Planning...', dueDate: '', priority: 'High', tag: 'MNGO-12', done: true },
];

const recentMeetings = [
  { id: 1, title: '2025 Retro', date: '01.12.25, 15:00', duration: '45 min', bullets: 4, color: '#3b82f6' },
  { id: 2, title: '2025 Retro', date: '01.12.25, 15:00', duration: '45 min', bullets: 4, color: '#a855f7' },
  { id: 3, title: '2025 Retro', date: '01.12.25, 15:00', duration: '45 min', bullets: 4, color: '#22c55e' },
  { id: 4, title: '2025 Retro', date: '01.12.25, 15:00', duration: '45 min', bullets: 4, color: '#f97316' },
];

const DashboardPage = () => {
  const navigate = useNavigate();
  const [showStartMeeting, setShowStartMeeting] = useState(false);
  const [showNewFutureMeeting, setShowNewFutureMeeting] = useState(false);
  const [showUploadMeeting, setShowUploadMeeting] = useState(false);
  const [hasActiveMeeting, setHasActiveMeeting] = useState(
    Boolean(localStorage.getItem('currentMeetingId')),
  );

  useEffect(() => {
    const syncMeetingState = () => {
      setHasActiveMeeting(Boolean(localStorage.getItem('currentMeetingId')));
    };

    syncMeetingState();
    window.addEventListener('storage', syncMeetingState);

    return () => window.removeEventListener('storage', syncMeetingState);
  }, []);

  return (
    <div className="dashboard-layout">
      <Header />
      <main className="dashboard-main">
        {/* Greeting */}
        <h1 className="dashboard-greeting">Hi Natali! 👋</h1>

        {/* Action Cards */}
        <div className="dashboard-actions">
          <div
            className={`action-card action-card--blue ${hasActiveMeeting ? 'action-card--disabled' : ''}`}
            onClick={() => {
              if (!hasActiveMeeting) {
                setShowStartMeeting(true);
              }
            }}
          >
            <div className="action-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <h3>Start Live Meeting</h3>
            <p>
              {hasActiveMeeting
                ? 'A live meeting is already running. Return to it before starting another one.'
                : 'Launch real-time AI assistant'}
            </p>
            {hasActiveMeeting && (
              <button
                type="button"
                className="action-card-inline-btn"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate('/meetings/live');
                }}
              >
                Go to Live Meeting
              </button>
            )}
          </div>
          <div className="action-card action-card--orange" onClick={() => setShowNewFutureMeeting(true)}>
            <div className="action-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <h3>Create New Meeting</h3>
            <p>Set your up-coming meeting</p>
          </div>
          <div className="action-card action-card--purple" onClick={() => setShowUploadMeeting(true)}>
            <div className="action-card-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </div>
            <h3>Upload Meeting</h3>
            <p>Transcribe &amp; analyze MP3</p>
          </div>
        </div>

        {/* Stats Row */}
        <div className="dashboard-stats">
          <div className="stat-card">
            <div className="stat-icon stat-icon--blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            </div>
            <span className="stat-number">24</span>
            <span className="stat-label">Meetings this month</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon--yellow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <span className="stat-number">48</span>
            <span className="stat-label">Average duration</span>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon--purple">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <span className="stat-number">7</span>
            <span className="stat-label">Following meetings</span>
          </div>
        </div>

        {/* Bottom Sections */}
        <div className="dashboard-bottom">
          {/* Upcoming */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>Upcoming</h2>
              <a href="#" className="view-all">View All</a>
            </div>
            <div className="section-list">
              {upcomingMeetings.map((m) => (
                <div className="upcoming-item" key={m.id}>
                  <div className="upcoming-info">
                    <span className="upcoming-title">{m.title}</span>
                    <span className="upcoming-meta">
                      📅 {m.date} &nbsp; 👤 {m.participants}
                    </span>
                  </div>
                  <button className="btn-start">Start</button>
                </div>
              ))}
            </div>
          </div>

          {/* Open Tasks */}
          <div className="dashboard-section">
            <div className="section-header">
              <h2>Open Tasks</h2>
              <a href="#" className="view-all">View All</a>
            </div>
            <div className="section-list">
              {openTasks.map((t) => (
                <div className="task-item" key={t.id}>
                  <div className="task-check">
                    <span className={`task-checkbox ${t.done ? 'task-checkbox--done' : ''}`}>
                      {t.done && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </span>
                  </div>
                  <div className="task-info">
                    <span className="task-title">{t.title}</span>
                    <span className="task-meta">{t.assignee} · {t.dueDate}</span>
                  </div>
                  <div className="task-badges">
                    <span className={`priority-badge priority-badge--${t.priority.toLowerCase()}`}>
                      {t.priority}
                    </span>
                    <span className="task-tag">{t.tag}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Meetings */}
        <div className="dashboard-section dashboard-section--wide">
          <div className="section-header">
            <h2>Recent Meetings</h2>
            <a href="#" className="view-all">View All</a>
          </div>
          <div className="section-list">
            {recentMeetings.map((m) => (
              <div className="recent-item" key={m.id}>
                <div className="recent-color" style={{ background: m.color }} />
                <div className="recent-info">
                  <span className="recent-title">{m.title}</span>
                  <span className="recent-meta">📅 {m.date} &nbsp; ⏱ {m.duration}</span>
                </div>
                <div className="recent-bullets">
                  <span className="bullet-badge" style={{ background: m.color }}>● {m.bullets}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {showStartMeeting && (
        <StartMeetingModal onClose={() => setShowStartMeeting(false)} />
      )}
      {showNewFutureMeeting && (
        <NewFutureMeetingModal onClose={() => setShowNewFutureMeeting(false)} />
      )}
      {showUploadMeeting && (
        <UploadMeetingModal onClose={() => setShowUploadMeeting(false)} />
      )}
    </div>
  );
};

export default DashboardPage;
