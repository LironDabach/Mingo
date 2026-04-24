import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parseResponseBody, refreshAccessToken, saveAuthSession } from '../lib/auth';
import './AuthPage.css';

const GITHUB_OAUTH_STATE_KEY = 'github-oauth:active';
const GITHUB_REDIRECT_KEY = 'github-oauth:redirect';

const GitHubCallbackPage = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const exchangeCode = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const providerError = params.get('error');
      const existingExchangeState = sessionStorage.getItem(GITHUB_OAUTH_STATE_KEY);

      if (providerError) {
        setError('GitHub sign-in was cancelled or denied.');
        return;
      }

      if (!code) {
        if (existingExchangeState === 'pending' || existingExchangeState === 'done') {
          if (existingExchangeState === 'done' && localStorage.getItem('token')) {
            navigate('/dashboard', { replace: true });
          }
          return;
        }

        setError('Missing GitHub authorization code.');
        return;
      }

      if (existingExchangeState === 'done' && localStorage.getItem('token')) {
        const redirectTarget = sessionStorage.getItem(GITHUB_REDIRECT_KEY) || '/dashboard';
        navigate(redirectTarget, { replace: true });
        return;
      }

      if (existingExchangeState === 'pending') {
        return;
      }

      sessionStorage.setItem(GITHUB_OAUTH_STATE_KEY, 'pending');
      window.history.replaceState({}, document.title, '/auth/github/callback');

      try {
        const redirectTarget = sessionStorage.getItem(GITHUB_REDIRECT_KEY) || '/dashboard';
        const shouldRefreshSession = redirectTarget === '/settings' && localStorage.getItem('refreshToken');

        if (shouldRefreshSession) {
          try {
            await refreshAccessToken();
          } catch (_error) {
            // If refresh fails, the request below will continue as a plain sign-in flow.
          }
        }

        const response = await fetch('/api/auth/github', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(localStorage.getItem('token')
              ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
              : {}),
          },
          body: JSON.stringify({ code }),
        });

        const data = await parseResponseBody(response);

        if (!response.ok) {
          throw new Error(
            data && 'message' in data && data.message
              ? data.message
              : 'Unable to sign in with GitHub right now.',
          );
        }

        if (!data || !('token' in data) || !('refreshToken' in data) || !('user' in data)) {
          throw new Error('The server returned an invalid GitHub login response.');
        }

        saveAuthSession(data);
        sessionStorage.setItem(GITHUB_OAUTH_STATE_KEY, 'done');
        sessionStorage.removeItem(GITHUB_REDIRECT_KEY);
        navigate(redirectTarget, { replace: true });
      } catch (err) {
        sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
        sessionStorage.removeItem(GITHUB_REDIRECT_KEY);
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to sign in with GitHub right now.',
        );
      }
    };

    void exchangeCode();
  }, [navigate]);

  return (
    <div className="auth-container">
      <div className="auth-brand">
        <div className="auth-brand-shell">
          <div className="auth-brand-logo">Mingo</div>
          <div className="auth-brand-tagline">Manage your meetings smarter</div>
        </div>
      </div>

      <div className="auth-form-panel">
        <div className="auth-form-shell">
          <div className="auth-form-wrapper">
            <h1>GitHub</h1>
            {error ? (
              <>
                <div className="auth-error">{error}</div>
                <div className="auth-footer">
                  Back to <Link to="/login">Login</Link>
                </div>
              </>
            ) : (
              <p className="auth-status-text">Finishing your GitHub sign-in...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GitHubCallbackPage;
