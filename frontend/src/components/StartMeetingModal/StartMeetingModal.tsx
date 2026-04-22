import type { FormEvent } from "react";
import { useState } from "react";
import { createMeetingFromText } from "../../lib/api";
import "./StartMeetingModal.css";

interface StartMeetingModalProps {
  onClose: () => void;
  onCreated: (meetingId: string) => void;
}

const StartMeetingModal = ({ onClose, onCreated }: StartMeetingModalProps) => {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("Live meeting started from the dashboard.");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await createMeetingFromText({
        title: title.trim() || "Live Meeting",
        content: notes.trim() || "Live meeting started from the dashboard.",
      });

      onCreated(response.meeting._id);
    } catch (apiError: any) {
      setError(apiError.response?.data?.error || "Unable to start a meeting right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-kicker">Live session</span>
            <h2>Start a meeting now</h2>
          </div>
          <button className="modal-close" onClick={onClose} type="button">
            x
          </button>
        </div>

        <form className="modal-form" onSubmit={handleSubmit}>
          <label className="modal-field">
            <span>Meeting title</span>
            <input
              type="text"
              placeholder="Sprint planning sync"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="modal-field">
            <span>Opening note</span>
            <textarea
              rows={5}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          {error ? <div className="modal-error">{error}</div> : null}

          <button className="modal-submit" type="submit" disabled={loading}>
            {loading ? "Creating..." : "Start meeting"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default StartMeetingModal;
