import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import './TranscribePage.css';

const TranscribePage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'audio/mpeg') {
      setFile(selectedFile);
      setError('');
      // Create URL for audio playback
      const url = URL.createObjectURL(selectedFile);
      setAudioUrl(url);
    } else {
      setError('Please select a valid MP3 file');
      setFile(null);
      setAudioUrl('');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError('');
    setTranscription('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Transcription failed');
      }

      const data = await response.json();
      setTranscription(data.transcription || data.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during transcription');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="transcribe-container">
      <div className="transcribe-card">
        <h1>Audio Transcriber</h1>
        <p className="subtitle">Upload an MP3 file to transcribe using OpenAI Whisper</p>

        <div className="upload-section">
          <input
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={handleFileChange}
            disabled={loading}
            className="file-input"
          />
          {file && (
            <>
              <p className="file-name">
                Selected: <strong>{file.name}</strong>
              </p>
              <div className="audio-player-section">
                <audio
                  ref={audioRef}
                  src={audioUrl}
                  controls
                  className="audio-player"
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="upload-button"
        >
          {loading ? 'Transcribing...' : 'Transcribe'}
        </button>

        {error && <div className="error-message">{error}</div>}

        {transcription && (
          <div className="transcription-section">
            <h2>Transcription Result</h2>
            <div className="transcription-text">{transcription}</div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(transcription);
                alert('Copied to clipboard!');
              }}
              className="copy-button"
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TranscribePage;
