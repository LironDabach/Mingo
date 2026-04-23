import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './AuthPage.css';

type AuthResponse = {
  token: string;
  refreshToken: string;
  user: {
    _id: string;
    username: string;
    fullname: string;
    email: string;
    profilePicture?: string | null;
  };
};

const parseResponseBody = async (response: Response) => {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as AuthResponse | { message?: string };
  } catch (_error) {
    return null;
  }
};

const RegisterPage = () => {
  const navigate = useNavigate();
  const [fullname, setFullname] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullname: fullname.trim() || email.trim(),
          email: email.trim(),
          password,
        }),
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error(
          data && 'message' in data && data.message
            ? data.message
            : 'Unable to create your account right now.',
        );
      }

      if (!data || !('token' in data) || !('refreshToken' in data) || !('user' in data)) {
        throw new Error('The server returned an invalid registration response.');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create your account right now.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-brand">
        <div className="auth-brand-shell">
          <div className="auth-brand-logo">Mingo</div>
          <div className="auth-brand-tagline">Manage your meetings smarter</div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-shell auth-form-shell--register">
          <div className="auth-form-wrapper">
            <Link className="auth-back-link" to="/login">
              &larr; Back to Login
            </Link>

            <h1>Register</h1>

            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="fullname">
                  Full Name <span className="required">*</span>
                </label>
              <input
                id="fullname"
                type="text"
                placeholder="Full Name"
                value={fullname}
                onChange={(e) => setFullname(e.target.value)}
                autoComplete="name"
                required
                />
              </div>

            <div className="auth-field">
              <label htmlFor="email">
                Email <span className="required">*</span>
              </label>
              <input
                id="email"
                type="email"
                placeholder="ex: jon.smith@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

              <div className="auth-field">
                <label htmlFor="password">
                  Password <span className="required">*</span>
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="****************"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="auth-field">
                <label htmlFor="confirmPassword">
                  Approve Password <span className="required">*</span>
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  placeholder="****************"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Creating account...' : 'Register'}
              </button>
            </form>

            <div className="auth-footer">
              Already have an account? <Link to="/login">Login</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
