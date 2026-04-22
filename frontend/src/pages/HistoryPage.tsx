import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header/Header";
import { getMeetingsByUser, type Meeting } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { formatDateTime, formatDuration } from "../lib/format";
import "./HistoryPage.css";

type FilterTab = "All" | "Last Week" | "Last Month" | "Upcoming";

const HistoryPage = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("All");

  useEffect(() => {
    const loadMeetings = async () => {
      if (!currentUser?._id) {
        return;
      }

      setLoading(true);
      setError("");
      try {
        const response = await getMeetingsByUser(currentUser._id);
        setMeetings(response);
      } catch (apiError: any) {
        setError(apiError.response?.data?.message || "Unable to load meeting history.");
      } finally {
        setLoading(false);
      }
    };

    void loadMeetings();
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return meetings
      .filter((meeting) => {
        const meetingDate = new Date(meeting.date);
        if (activeTab === "Upcoming") {
          return meetingDate >= now;
        }
        if (activeTab === "Last Week") {
          return meetingDate >= weekAgo && meetingDate <= now;
        }
        if (activeTab === "Last Month") {
          return meetingDate >= monthAgo && meetingDate <= now;
        }
        return true;
      })
      .filter((meeting) => {
        const query = search.trim().toLowerCase();
        if (!query) {
          return true;
        }
        return (
          meeting.title.toLowerCase().includes(query) ||
          formatDateTime(meeting.date).toLowerCase().includes(query)
        );
      })
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
  }, [meetings, search, activeTab]);

  const tabs: FilterTab[] = ["All", "Last Week", "Last Month", "Upcoming"];

  return (
    <div className="page-shell">
      <Header />

      <main className="page-main">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Meeting archive</span>
            <h1>History</h1>
            <p>Search and filter all meetings linked to your account from the backend.</p>
          </div>
          <div className="search-card">
            <input
              type="search"
              placeholder="Search by title or date..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </section>

        <section className="tabs-row">
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`tab-pill ${tab === activeTab ? "tab-pill--active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
            </button>
          ))}
        </section>

        {error ? <div className="page-feedback page-feedback--error">{error}</div> : null}

        <section className="data-panel history-panel">
          {loading ? <div className="empty-state">Loading meeting history...</div> : null}
          {!loading && filtered.length === 0 ? (
            <div className="empty-state">No meetings matched the current filter.</div>
          ) : null}

          {filtered.map((meeting) => {
            const isUpcoming = new Date(meeting.date) > new Date();

            return (
              <button
                key={meeting._id}
                className="history-row"
                onClick={() => navigate(`/meeting/${meeting._id}`)}
              >
                <div>
                  <strong>{meeting.title}</strong>
                  <span>{formatDateTime(meeting.date)}</span>
                </div>
                <div className="history-meta">
                  <span>{meeting.participants.length} participants</span>
                  <span className={`status-chip ${isUpcoming ? "status-chip--upcoming" : ""}`}>
                    {isUpcoming ? "Upcoming" : formatDuration(meeting.duration)}
                  </span>
                </div>
              </button>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default HistoryPage;
