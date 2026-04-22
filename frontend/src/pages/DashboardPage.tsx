import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header/Header";
import NewFutureMeetingModal from "../components/NewFutureMeetingModal/NewFutureMeetingModal";
import StartMeetingModal from "../components/StartMeetingModal/StartMeetingModal";
import UploadMeetingModal from "../components/UploadMeetingModal/UploadMeetingModal";
import {
  getAverageDuration,
  getRecentMeetings,
  getUpcomingMeetings,
  getUserTasks,
  type Meeting,
  type MeetingTask,
} from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { formatDuration, formatRelativeMeeting } from "../lib/format";
import "./DashboardPage.css";

const DashboardPage = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [upcomingMeetings, setUpcomingMeetings] = useState<Meeting[]>([]);
  const [recentMeetings, setRecentMeetings] = useState<Meeting[]>([]);
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [averageDuration, setAverageDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showStartMeeting, setShowStartMeeting] = useState(false);
  const [showNewFutureMeeting, setShowNewFutureMeeting] = useState(false);
  const [showUploadMeeting, setShowUploadMeeting] = useState(false);

  const loadDashboard = async () => {
    if (!currentUser?._id) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [upcoming, recent, taskList, average] = await Promise.all([
        getUpcomingMeetings(currentUser._id),
        getRecentMeetings(currentUser._id),
        getUserTasks(currentUser._id),
        getAverageDuration(currentUser._id),
      ]);

      setUpcomingMeetings(upcoming);
      setRecentMeetings(recent);
      setTasks(taskList);
      setAverageDuration(average.averageDuration);
    } catch (apiError: any) {
      setError(apiError.response?.data?.message || "Unable to load dashboard data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const meetingsThisMonth = recentMeetings.filter((meeting) => {
    const meetingDate = new Date(meeting.date);
    const now = new Date();
    return (
      meetingDate.getMonth() === now.getMonth() &&
      meetingDate.getFullYear() === now.getFullYear()
    );
  }).length;

  const handleMeetingCreated = (meetingId: string) => {
    setShowStartMeeting(false);
    setShowNewFutureMeeting(false);
    setShowUploadMeeting(false);
    void loadDashboard();
    navigate(`/meeting/${meetingId}`);
  };

  return (
    <div className="page-shell">
      <Header />

      <main className="page-main dashboard-page">
        <section className="dashboard-hero">
          <div>
            <span className="eyebrow">Workspace overview</span>
            <h1>{`Hello ${currentUser?.fullname || currentUser?.username || "there"}`}</h1>
            <p>
              This dashboard is connected to your live backend data: meetings, transcript imports
              and GitHub-linked tasks.
            </p>
          </div>
        </section>

        <section className="dashboard-actions">
          <button className="action-panel" onClick={() => setShowStartMeeting(true)}>
            <strong>Start live meeting</strong>
            <span>Create a meeting record immediately and jump into its workspace.</span>
          </button>

          <button className="action-panel action-panel--warm" onClick={() => setShowNewFutureMeeting(true)}>
            <strong>Create future meeting</strong>
            <span>Schedule a placeholder meeting entry with a date, time and opening agenda.</span>
          </button>

          <button className="action-panel action-panel--dark" onClick={() => setShowUploadMeeting(true)}>
            <strong>Upload recording</strong>
            <span>Send an MP3 to the backend transcription flow and open the generated meeting.</span>
          </button>
        </section>

        {error ? <div className="page-feedback page-feedback--error">{error}</div> : null}

        <section className="stats-grid">
          <article className="stat-tile">
            <span className="stat-label">Meetings this month</span>
            <strong>{loading ? "--" : meetingsThisMonth}</strong>
          </article>
          <article className="stat-tile">
            <span className="stat-label">Upcoming meetings</span>
            <strong>{loading ? "--" : upcomingMeetings.length}</strong>
          </article>
          <article className="stat-tile">
            <span className="stat-label">Tracked GitHub tasks</span>
            <strong>{loading ? "--" : tasks.length}</strong>
          </article>
          <article className="stat-tile">
            <span className="stat-label">Average duration</span>
            <strong>{loading ? "--" : formatDuration(Math.round(averageDuration))}</strong>
          </article>
        </section>

        <section className="dashboard-columns">
          <article className="data-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">Upcoming</span>
                <h2>Next meetings</h2>
              </div>
            </div>

            <div className="panel-list">
              {!loading && upcomingMeetings.length === 0 ? (
                <div className="empty-state">No upcoming meetings yet.</div>
              ) : null}

              {upcomingMeetings.slice(0, 4).map((meeting) => (
                <button
                  key={meeting._id}
                  className="list-row"
                  onClick={() => navigate(`/meeting/${meeting._id}`)}
                >
                  <div>
                    <strong>{meeting.title}</strong>
                    <span>{formatRelativeMeeting(meeting.date)}</span>
                  </div>
                  <small>{meeting.participants.length} participants</small>
                </button>
              ))}
            </div>
          </article>

          <article className="data-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">GitHub tasks</span>
                <h2>Open tracked issues</h2>
              </div>
              <button className="text-link" onClick={() => navigate("/tasks")}>
                View all
              </button>
            </div>

            <div className="panel-list">
              {!loading && tasks.length === 0 ? <div className="empty-state">No tasks available.</div> : null}

              {tasks.slice(0, 5).map((task) => (
                <div key={task._id} className="list-row list-row--static">
                  <div>
                    <strong>{`Issue #${task.gitHubIssueId}`}</strong>
                    <span>{task.gitHubRepoName}</span>
                  </div>
                  <small>{task.gitHubRepoOwner === currentUser?._id ? "Owned by you" : "Shared"}</small>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="data-panel">
          <div className="panel-head">
            <div>
              <span className="eyebrow">Recent meetings</span>
              <h2>Latest activity</h2>
            </div>
            <button className="text-link" onClick={() => navigate("/history")}>
              Open history
            </button>
          </div>

          <div className="recent-grid">
            {!loading && recentMeetings.length === 0 ? <div className="empty-state">No completed meetings yet.</div> : null}

            {recentMeetings.slice(0, 6).map((meeting) => (
              <button
                key={meeting._id}
                className="recent-card"
                onClick={() => navigate(`/meeting/${meeting._id}`)}
              >
                <span className="recent-date">{formatRelativeMeeting(meeting.date)}</span>
                <strong>{meeting.title}</strong>
                <span>{formatDuration(meeting.duration)}</span>
              </button>
            ))}
          </div>
        </section>
      </main>

      {showStartMeeting ? (
        <StartMeetingModal
          onClose={() => setShowStartMeeting(false)}
          onCreated={handleMeetingCreated}
        />
      ) : null}

      {showNewFutureMeeting ? (
        <NewFutureMeetingModal
          onClose={() => setShowNewFutureMeeting(false)}
          onCreated={handleMeetingCreated}
        />
      ) : null}

      {showUploadMeeting ? (
        <UploadMeetingModal
          onClose={() => setShowUploadMeeting(false)}
          onCreated={handleMeetingCreated}
        />
      ) : null}
    </div>
  );
};

export default DashboardPage;
