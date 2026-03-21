import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthPage.css';

const RegisterPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem('token', 'prototype');
    navigate('/dashboard');
  };

  return (
    <div className="auth-container">
      <div className="auth-brand">
        <div className="auth-brand-logo">Mingo</div>
        <div className="auth-brand-tagline">Manage your meetings smarter</div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-wrapper">
          <a className="auth-back-link" onClick={() => navigate('/login')}>
            ← Back to Login
          </a>

          <h1>Register</h1>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Username <span className="required">*</span></label>
              <input
                type="text"
                placeholder="ex. jhon_dalorin (no spaces)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label>Password <span className="required">*</span></label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label>Approve Password <span className="required">*</span></label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                placeholder="ex. jackson@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button type="submit" className="auth-submit-btn">
              Register
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
