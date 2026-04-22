import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { login } from "../lib/api";
import { saveSession } from "../lib/auth";
import "./AuthPage.css";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const session = await login({
        username: username.trim(),
        password,
      });

      saveSession(session);
      navigate(redirectTo || "/dashboard", { replace: true });
    } catch (apiError: any) {
      setError(apiError.response?.data?.message || "Unable to sign in right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="auth-hero-badge">Mingo workspace</div>
        <h1>Bring your meetings, transcripts and GitHub tasks into one calm flow.</h1>
        <p>
          The frontend is now wired to your real server, so sign in with an existing backend
          account to see live data.
        </p>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <span className="auth-kicker">Welcome back</span>
          <h2>Sign in</h2>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Username</span>
            <input
              type="text"
              placeholder="your_username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-submit-btn" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="auth-footer">
          <span>Need an account?</span>
          <Link to="/register">Create one</Link>
        </div>
      </section>
    </div>
  );
};

export default LoginPage;
