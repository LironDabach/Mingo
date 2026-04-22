import type { FormEvent } from "react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register } from "../lib/api";
import { saveSession } from "../lib/auth";
import "./AuthPage.css";

const RegisterPage = () => {
  const navigate = useNavigate();
  const [fullname, setFullname] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const session = await register({
        fullname: fullname.trim() || username.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
      });

      saveSession(session);
      navigate("/dashboard", { replace: true });
    } catch (apiError: any) {
      setError(apiError.response?.data?.message || "Unable to create your account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <section className="auth-hero">
        <div className="auth-hero-badge">Mingo onboarding</div>
        <h1>Create your account and start managing meeting output from one place.</h1>
        <p>
          Registration is connected directly to your backend auth flow, including token storage
          and redirect into the workspace.
        </p>
      </section>

      <section className="auth-card">
        <div className="auth-card-header">
          <span className="auth-kicker">Get started</span>
          <h2>Create account</h2>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Full name</span>
            <input
              type="text"
              placeholder="Shiran Levi"
              value={fullname}
              onChange={(event) => setFullname(event.target.value)}
            />
          </label>

          <label className="auth-field">
            <span>Username</span>
            <input
              type="text"
              placeholder="shiran_levi"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              placeholder="Choose a password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>

          <label className="auth-field">
            <span>Confirm password</span>
            <input
              type="password"
              placeholder="Repeat your password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-submit-btn" type="submit" disabled={loading}>
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="auth-footer">
          <span>Already registered?</span>
          <Link to="/login">Back to sign in</Link>
        </div>
      </section>
    </div>
  );
};

export default RegisterPage;
