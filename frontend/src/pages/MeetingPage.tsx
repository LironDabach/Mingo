import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Header from "../components/Header/Header";
import {
  createTask,
  deleteTask,
  getMeetingById,
  getMeetingTasks,
  getRecentMeetings,
  getTranscriptByMeetingId,
  type Meeting,
  type MeetingTask,
  type Transcript,
} from "../lib/api";
import { getCurrentUser } from "../lib/auth";
import { formatDateTime, formatDuration } from "../lib/format";
import "./MeetingPage.css";

const MeetingPage = () => {
  const navigate = useNavigate();
  const { meetingId } = useParams();
  const currentUser = getCurrentUser();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [tasks, setTasks] = useState<MeetingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [issueId, setIssueId] = useState("");
  const [repoName, setRepoName] = useState("");
  const [taskLoading, setTaskLoading] = useState(false);

  useEffect(() => {
    const loadMeeting = async () => {
      if (!currentUser?._id) {
        return;
      }

      setLoading(true);
      setError("");

      try {
        let activeMeetingId = meetingId;
        if (!activeMeetingId) {
          const recent = await getRecentMeetings(currentUser._id);
          activeMeetingId = recent[0]?._id;
          if (!activeMeetingId) {
            setMeeting(null);
            setTranscript(null);
            setTasks([]);
            setLoading(false);
            return;
          }
          navigate(`/meeting/${activeMeetingId}`, { replace: true });
        }

        const [meetingResponse, transcriptResponse, taskResponse] = await Promise.all([
          getMeetingById(activeMeetingId),
          getTranscriptByMeetingId(activeMeetingId),
          getMeetingTasks(activeMeetingId),
        ]);

        setMeeting(meetingResponse);
        setTranscript(transcriptResponse);
        setTasks(taskResponse);
      } catch (apiError: any) {
        setError(apiError.response?.data?.message || "Unable to load the meeting workspace.");
      } finally {
        setLoading(false);
      }
    };

    void loadMeeting();
  }, [meetingId]);

  const handleCreateTask = async (event: FormEvent) => {
    event.preventDefault();
    if (!meeting?._id || !currentUser?._id) {
      return;
    }

    setTaskLoading(true);
    setError("");

    try {
      const newTask = await createTask(meeting._id, {
        gitHubIssueId: Number(issueId),
        gitHubRepoName: repoName.trim(),
        gitHubRepoOwner: currentUser._id,
      });

      setTasks((currentTasks) => [...currentTasks, newTask]);
      setIssueId("");
      setRepoName("");
    } catch (apiError: any) {
      setError(apiError.response?.data?.message || "Unable to create task.");
    } finally {
      setTaskLoading(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!meeting?._id) {
      return;
    }

    try {
      await deleteTask(meeting._id, taskId);
      setTasks((currentTasks) => currentTasks.filter((task) => task._id !== taskId));
    } catch (apiError: any) {
      setError(apiError.response?.data?.message || "Unable to delete task.");
    }
  };

  const transcriptPreview = useMemo(() => {
    if (!transcript?.content) {
      return [];
    }

    return transcript.content
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);
  }, [transcript]);

  return (
    <div className="page-shell">
      <Header />

      <main className="page-main">
        {loading ? <div className="empty-state">Loading meeting...</div> : null}

        {!loading && !meeting ? (
          <section className="data-panel meeting-empty">
            <h1>No meeting selected</h1>
            <p>Create or upload a meeting from the dashboard to start working here.</p>
            <button className="modal-submit" onClick={() => navigate("/dashboard")}>
              Back to dashboard
            </button>
          </section>
        ) : null}

        {meeting ? (
          <>
            <section className="page-hero">
              <div>
                <span className="eyebrow">Meeting workspace</span>
                <h1>{meeting.title}</h1>
                <p>
                  {formatDateTime(meeting.date)} | {meeting.participants.length} participants |{" "}
                  {formatDuration(meeting.duration)}
                </p>
              </div>
            </section>

            {error ? <div className="page-feedback page-feedback--error">{error}</div> : null}

            <section className="meeting-grid-modern">
              <article className="data-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">Transcript</span>
                    <h2>Meeting notes</h2>
                  </div>
                </div>

                {transcriptPreview.length === 0 ? (
                  <div className="empty-state">No transcript content was found for this meeting.</div>
                ) : (
                  <div className="transcript-stack">
                    {transcriptPreview.map((line, index) => (
                      <p key={`${line}-${index}`}>{line}</p>
                    ))}
                  </div>
                )}
              </article>

              <article className="data-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">Metadata</span>
                    <h2>Meeting details</h2>
                  </div>
                </div>

                <div className="meeting-metadata">
                  <div className="meta-card">
                    <span>Organizer</span>
                    <strong>{meeting.organizerId === currentUser?._id ? "You" : meeting.organizerId}</strong>
                  </div>
                  <div className="meta-card">
                    <span>Transcript ID</span>
                    <strong>{meeting.transcriptId}</strong>
                  </div>
                  <div className="meta-card">
                    <span>Topics tracked</span>
                    <strong>{meeting.topics?.length || 0}</strong>
                  </div>
                </div>
              </article>
            </section>

            <section className="meeting-grid-modern">
              <article className="data-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">Linked tasks</span>
                    <h2>GitHub issue tasks</h2>
                  </div>
                </div>

                {tasks.length === 0 ? <div className="empty-state">No tasks linked to this meeting yet.</div> : null}

                <div className="panel-list">
                  {tasks.map((task) => (
                    <div key={task._id} className="task-row-modern">
                      <div>
                        <strong>{`Issue #${task.gitHubIssueId}`}</strong>
                        <span>{task.gitHubRepoName}</span>
                      </div>
                      <button className="ghost-button" onClick={() => handleDeleteTask(task._id)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </article>

              <article className="data-panel">
                <div className="panel-head">
                  <div>
                    <span className="eyebrow">Add task</span>
                    <h2>Attach a GitHub issue</h2>
                  </div>
                </div>

                <form className="modal-form" onSubmit={handleCreateTask}>
                  <label className="modal-field">
                    <span>Issue ID</span>
                    <input
                      type="number"
                      value={issueId}
                      onChange={(event) => setIssueId(event.target.value)}
                      placeholder="910003"
                      required
                    />
                  </label>

                  <label className="modal-field">
                    <span>Repository name</span>
                    <input
                      type="text"
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      placeholder="mingo-frontend"
                      required
                    />
                  </label>

                  <button className="modal-submit" type="submit" disabled={taskLoading}>
                    {taskLoading ? "Saving..." : "Attach task"}
                  </button>
                </form>
              </article>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};

export default MeetingPage;
