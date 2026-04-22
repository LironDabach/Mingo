import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header/Header";
import { getMeetingsByUser, getUserTasks, type Meeting, type MeetingTask } from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import "./TasksPage.css";

const TasksPage = () => {
  const navigate = useNavigate();
  const currentUser = getCurrentUser();
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const loadData = async () => {
      if (!currentUser?._id) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        const [taskResponse, meetingResponse] = await Promise.all([
          getUserTasks(currentUser._id),
          getMeetingsByUser(currentUser._id),
        ]);

        setTasks(taskResponse);
        setMeetings(meetingResponse);
      } catch (apiError: any) {
        setError(apiError.response?.data?.message || "Unable to load tasks.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const taskMeetingMap = useMemo(() => {
    const map = new Map<string, Meeting>();
    meetings.forEach((meeting) => {
      meeting.tasks.forEach((taskId) => {
        map.set(taskId, meeting);
      });
    });
    return map;
  }, [meetings]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!query) {
        return true;
      }

      const linkedMeeting = taskMeetingMap.get(task._id);
      return (
        task.gitHubRepoName.toLowerCase().includes(query) ||
        String(task.gitHubIssueId).includes(query) ||
        linkedMeeting?.title.toLowerCase().includes(query)
      );
    });
  }, [tasks, search, taskMeetingMap]);

  return (
    <div className="page-shell">
      <Header />

      <main className="page-main">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Task tracking</span>
            <h1>GitHub-linked tasks</h1>
            <p>
              These tasks come directly from the backend task model, which currently tracks repo
              name, issue id and owner.
            </p>
          </div>
          <div className="search-card">
            <input
              type="search"
              placeholder="Search by repo, issue or meeting..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </section>

        {error ? <div className="page-feedback page-feedback--error">{error}</div> : null}

        <section className="stats-grid">
          <article className="stat-tile">
            <span className="stat-label">Total tasks</span>
            <strong>{loading ? "--" : tasks.length}</strong>
          </article>
          <article className="stat-tile">
            <span className="stat-label">Unique repositories</span>
            <strong>{loading ? "--" : new Set(tasks.map((task) => task.gitHubRepoName)).size}</strong>
          </article>
          <article className="stat-tile">
            <span className="stat-label">Meetings linked</span>
            <strong>{loading ? "--" : new Set(filtered.map((task) => taskMeetingMap.get(task._id)?._id)).size}</strong>
          </article>
        </section>

        <section className="data-panel tasks-panel">
          {loading ? <div className="empty-state">Loading tasks...</div> : null}
          {!loading && filtered.length === 0 ? <div className="empty-state">No tasks found.</div> : null}

          {filtered.map((task) => {
            const meeting = taskMeetingMap.get(task._id);
            return (
              <button
                key={task._id}
                className="task-line"
                onClick={() => navigate(meeting ? `/meeting/${meeting._id}` : "/history")}
              >
                <div>
                  <strong>{`Issue #${task.gitHubIssueId}`}</strong>
                  <span>{task.gitHubRepoName}</span>
                </div>
                <div className="task-line-meta">
                  <span>{meeting?.title || "No linked meeting found"}</span>
                  <span className="status-chip">Owner: {task.gitHubRepoOwner === currentUser?._id ? "You" : "Shared"}</span>
                </div>
              </button>
            );
          })}
        </section>
      </main>
    </div>
  );
};

export default TasksPage;
