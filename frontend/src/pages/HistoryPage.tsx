import { useState, useMemo } from 'react';
import Header from '../components/Header/Header';
import './HistoryPage.css';

interface Meeting {
  id: number;
  title: string;
  date: string;
  time: string;
  participants: number;
  duration: string;
  status: 'Completed' | 'Upcoming';
  tasksCount: number;
}

const MOCK_MEETINGS: Meeting[] = [
  { id: 1,  title: 'Q1 Strategy Review',       date: '17.11.25', time: '14:00', participants: 5,  duration: '43 min', status: 'Completed', tasksCount: 4 },
  { id: 2,  title: 'Code Review',              date: '17.11.25', time: '15:00', participants: 2,  duration: '28 min', status: 'Completed', tasksCount: 2 },
  { id: 3,  title: 'Q2 Strategy Review',       date: '01.01.26', time: '09:00', participants: 10, duration: '—',      status: 'Upcoming',  tasksCount: 0 },
  { id: 4,  title: 'Q3 Strategy Review',       date: '01.04.26', time: '09:00', participants: 8,  duration: '—',      status: 'Upcoming',  tasksCount: 0 },
  { id: 5,  title: 'Sprint 4 Kickoff',         date: '10.11.25', time: '10:00', participants: 4,  duration: '55 min', status: 'Completed', tasksCount: 3 },
  { id: 6,  title: 'Architecture Review',      date: '05.11.25', time: '11:00', participants: 3,  duration: '40 min', status: 'Completed', tasksCount: 5 },
  { id: 7,  title: 'Planning Mingo Project',   date: '17.11.25', time: '10:00', participants: 4,  duration: '43 min', status: 'Completed', tasksCount: 3 },
  { id: 8,  title: 'Design Review',            date: '12.11.25', time: '14:00', participants: 6,  duration: '35 min', status: 'Completed', tasksCount: 2 },
  { id: 9,  title: 'Backend Sync',             date: '15.11.25', time: '09:30', participants: 3,  duration: '20 min', status: 'Completed', tasksCount: 1 },
  { id: 10, title: 'Q4 Planning',              date: '15.06.26', time: '10:00', participants: 12, duration: '—',      status: 'Upcoming',  tasksCount: 0 },
  { id: 11, title: 'Stakeholder Demo',         date: '20.12.25', time: '16:00', participants: 15, duration: '—',      status: 'Upcoming',  tasksCount: 0 },
  { id: 12, title: 'Team Retrospective',       date: '18.11.25', time: '11:00', participants: 4,  duration: '30 min', status: 'Completed', tasksCount: 2 },
];

type FilterTab = 'All' | 'Last Week' | 'Last Month' | 'Upcoming';

// Parse dd.mm.yy to Date
const parseDate = (d: string): Date => {
  const [day, month, year] = d.split('.').map(Number);
  return new Date(2000 + year, month - 1, day);
};

const HistoryPage = () => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('All');

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const stats = useMemo(() => ({
    total: MOCK_MEETINGS.length,
    thisWeek: MOCK_MEETINGS.filter((m) => {
      const d = parseDate(m.date);
      return d >= oneWeekAgo && d <= now;
    }).length,
    future: MOCK_MEETINGS.filter((m) => m.status === 'Upcoming').length,
  }), []);

  const filtered = useMemo(() => {
    let result = [...MOCK_MEETINGS];

    // Tab filter
    if (activeTab === 'Last Week') {
      result = result.filter((m) => {
        const d = parseDate(m.date);
        return d >= oneWeekAgo && d <= now;
      });
    } else if (activeTab === 'Last Month') {
      result = result.filter((m) => {
        const d = parseDate(m.date);
        return d >= oneMonthAgo && d <= now;
      });
    } else if (activeTab === 'Upcoming') {
      result = result.filter((m) => m.status === 'Upcoming');
    }

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          m.date.includes(q)
      );
    }

    // Sort by date descending (newest first), upcoming at end for 'All'
    result.sort((a, b) => {
      if (activeTab === 'All') {
        if (a.status === 'Upcoming' && b.status !== 'Upcoming') return 1;
        if (a.status !== 'Upcoming' && b.status === 'Upcoming') return -1;
      }
      return parseDate(b.date).getTime() - parseDate(a.date).getTime();
    });

    return result;
  }, [search, activeTab]);

  const tabs: FilterTab[] = ['All', 'Last Week', 'Last Month', 'Upcoming'];

  return (
    <div className="history-layout">
      <Header />

      <main className="history-main">
        {/* Stats */}
        <div className="history-stats-row">
          <div className="history-stat-card" onClick={() => setActiveTab('All')}>
            <div className="hstat-icon hstat-icon--total">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <span className="hstat-number">{stats.total}</span>
            <span className="hstat-label">Total Meetings</span>
          </div>
          <div className="history-stat-card" onClick={() => setActiveTab('Last Week')}>
            <div className="hstat-icon hstat-icon--week">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
              </svg>
            </div>
            <span className="hstat-number">{stats.thisWeek}</span>
            <span className="hstat-label">This Week</span>
          </div>
          <div className="history-stat-card" onClick={() => setActiveTab('Upcoming')}>
            <div className="hstat-icon hstat-icon--future">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" fill="currentColor" />
              </svg>
            </div>
            <span className="hstat-number">{stats.future}</span>
            <span className="hstat-label">Future Meetings</span>
          </div>
        </div>

        {/* Search + Tabs */}
        <div className="history-toolbar">
          <div className="history-search-box">
            <svg className="hsearch-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search meetings..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="hsearch-clear" onClick={() => setSearch('')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>

          <div className="history-filter-tabs">
            {tabs.map((tab) => (
              <button
                key={tab}
                className={`hfilter-tab ${activeTab === tab ? 'hfilter-tab--active' : ''}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'Last Month' ? 'Last month' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Meeting List */}
        <div className="history-card">
          <div className="history-card-header">
            <h2>Your Meetings</h2>
            <span className="history-count">{filtered.length} {filtered.length === 1 ? 'meeting' : 'meetings'}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="history-empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <p>No meetings match your search</p>
            </div>
          ) : (
            <div className="history-list">
              {filtered.map((meeting) => (
                <div key={meeting.id} className="history-row">
                  <div className={`history-row-icon ${meeting.status === 'Upcoming' ? 'history-row-icon--upcoming' : ''}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>

                  <div className="history-row-info">
                    <span className="history-row-title">{meeting.title}</span>
                    <span className="history-row-meta">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {meeting.date}, {meeting.time}
                      <span className="hmeta-sep">|</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
                      </svg>
                      {meeting.participants}
                    </span>
                  </div>

                  <div className="history-row-right">
                    {meeting.status === 'Completed' ? (
                      <span className="history-badge history-badge--completed">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        {meeting.duration}
                      </span>
                    ) : (
                      <span className="history-badge history-badge--upcoming">Upcoming</span>
                    )}
                    {meeting.tasksCount > 0 && (
                      <span className="history-tasks-badge">{meeting.tasksCount} tasks</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default HistoryPage;
