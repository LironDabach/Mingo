import type { FormEvent } from "react";
import { useState } from "react";
import { createMeetingFromText } from "../../lib/api";
import "./NewFutureMeetingModal.css";

interface NewFutureMeetingModalProps {
  onClose: () => void;
  onCreated: (meetingId: string) => void;
}

const NewFutureMeetingModal = ({ onClose, onCreated }: NewFutureMeetingModalProps) => {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("Planned meeting created from the dashboard.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const dateTime = date && time ? new Date(`${date}T${time}`).toISOString() : undefined;
      const payload: { title: string; content: string; date?: string } = {
        title: title.trim() || "Planned Meeting",
        content: notes.trim() || "Planned meeting created from the dashboard.",
      };

      if (dateTime) {
        payload.date = dateTime;
      }

      const response = await createMeetingFromText(payload);

      onCreated(response.meeting._id);
    } catch (apiError: any) {
      setError(apiError.response?.data?.error || "Unable to create the meeting.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-kicker">Planning</span>
            <h2>Create a future meeting</h2>
          </div>
          <button className="modal-close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <form className="modal-form" onSubmit={handleCreate}>
          <label className="modal-field">
            <span>Meeting title</span>
            <input
              type="text"
              placeholder="Quarterly review"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </label>

          <div className="modal-grid">
            <label className="modal-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>

            <label className="modal-field">
              <span>Time</span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
          </div>

          <label className="modal-field">
            <span>Agenda note</span>
            <textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {error ? <div className="modal-error">{error}</div> : null}

          <button className="modal-submit" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create meeting"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default NewFutureMeetingModal;
