import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import { uploadMeetingAudio } from "../../lib/api";
import "../StartMeetingModal/StartMeetingModal.css";

interface UploadMeetingModalProps {
  onClose: () => void;
  onCreated: (meetingId: string) => void;
}

const UploadMeetingModal = ({ onClose, onCreated }: UploadMeetingModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Please choose an MP3 file.");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", file);
    if (title.trim()) {
      formData.append("title", title.trim());
    }
    if (date) {
      formData.append("date", new Date(date).toISOString());
    }

    try {
      const response = await uploadMeetingAudio(formData);
      onCreated(response.meeting._id);
    } catch (apiError: any) {
      setError(apiError.response?.data?.error || "Unable to upload the recording.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="modal-kicker">Audio import</span>
            <h2>Upload an MP3 meeting</h2>
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
              placeholder="Optional title override"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="modal-field">
            <span>Meeting date</span>
            <input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>

          <button
            className="upload-picker"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <strong>{file ? file.name : "Choose MP3 file"}</strong>
            <span>{file ? "Ready to upload" : "Open your local recording and attach it here."}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,.mp3"
            hidden
            onChange={handleFileChange}
          />

          {error ? <div className="modal-error">{error}</div> : null}

          <button className="modal-submit" type="submit" disabled={loading}>
            {loading ? "Uploading..." : "Upload and transcribe"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default UploadMeetingModal;
