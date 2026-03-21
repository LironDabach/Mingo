import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthPage.css';

const GOOGLE_ICON = 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
          <h1>Login</h1>

          <form onSubmit={handleSubmit}>
            <div className="auth-field">
              <label>Email</label>
              <input
                type="email"
                placeholder="ex. jackson@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="auth-submit-btn">
              Login
            </button>
          </form>

          <button className="auth-google-btn" type="button">
            <img src={GOOGLE_ICON} alt="Google" />
            Sign in with Google
          </button>

          <div className="auth-footer">
            Don't have user? <a onClick={() => navigate('/register')}>Subscribe</a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
