import type { ChangeEvent, FormEvent } from "react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header/Header";
import { uploadMeetingAudio } from "../lib/api";
import "./TranscribePage.css";

const TranscribePage = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setError("");
  };

  const handleUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setError("Please select an MP3 file first.");
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
      const result = await uploadMeetingAudio(formData);
      navigate(`/meeting/${result.meeting._id}`);
    } catch (apiError: any) {
      setError(apiError.response?.data?.error || "Transcription failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <Header />

      <main className="page-main">
        <section className="page-hero">
          <div>
            <span className="eyebrow">Transcript import</span>
            <h1>Upload and transcribe</h1>
            <p>Send an MP3 recording to the backend and open the generated meeting workspace.</p>
          </div>
        </section>

        <form className="data-panel transcribe-form" onSubmit={handleUpload}>
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
            <input
              type="datetime-local"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>

          <button
            className="upload-picker upload-picker--large"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <strong>{file ? file.name : "Choose MP3 file"}</strong>
            <span>{file ? "File attached and ready." : "Click here to pick a recording from your device."}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,.mp3"
            hidden
            onChange={handleFileChange}
          />

          {error ? <div className="page-feedback page-feedback--error">{error}</div> : null}

          <button className="modal-submit" type="submit" disabled={loading}>
            {loading ? "Uploading and transcribing..." : "Upload to backend"}
          </button>
        </form>
      </main>
    </div>
  );
};

export default TranscribePage;
