import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './AuthPage.css';
import {
  parseResponseBody,
  saveAuthSession,
  type OAuthConfigResponse,
} from '../lib/auth';

const GOOGLE_ICON =
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';
const GITHUB_REDIRECT_KEY = 'github-oauth:redirect';
const GITHUB_OAUTH_STATE_KEY = 'github-oauth:active';

type GoogleTokenClient = {
  requestAccessToken: () => void;
};

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [isGitHubSubmitting, setIsGitHubSubmitting] = useState(false);
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigResponse | null>(null);
  const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(false);

  useEffect(() => {
    const loadOAuthConfig = async () => {
      try {
        const response = await fetch('/api/auth/providers');
        const data = await parseResponseBody(response);

        if (!response.ok || !data) {
          return;
        }

        if (
          'googleClientId' in data &&
          'githubClientId' in data &&
          'githubCallbackUrl' in data
        ) {
          setOauthConfig(data);
        }
      } catch (_error) {
        // Keep password login usable even if OAuth config cannot be loaded.
      }
    };

    void loadOAuthConfig();
  }, []);

  useEffect(() => {
    if (window.google?.accounts?.oauth2) {
      setIsGoogleScriptReady(true);
      return;
    }

    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]',
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', () => setIsGoogleScriptReady(true));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => setIsGoogleScriptReady(true);
    document.body.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email.trim(),
          password,
        }),
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error(
          data && 'message' in data && data.message
            ? data.message
            : 'Unable to sign in right now.',
        );
      }

      if (!data || !('token' in data) || !('refreshToken' in data) || !('user' in data)) {
        throw new Error('The server returned an invalid login response.');
      }

      saveAuthSession(data);

      const nextPath =
        (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ||
        '/dashboard';

      navigate(nextPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    setError('');

    if (!oauthConfig?.googleClientId) {
      setError('Google OAuth is not configured yet.');
      return;
    }

    if (!isGoogleScriptReady || !window.google?.accounts?.oauth2) {
      setError('Google sign-in is still loading. Please try again.');
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: oauthConfig.googleClientId,
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send',
      prompt: 'consent',
      include_granted_scopes: true,
      callback: async (tokenResponse: { access_token?: string; error?: string; scope?: string }) => {
        if (tokenResponse.error || !tokenResponse.access_token) {
          setError('Google sign-in failed. Please try again.');
          setIsGoogleSubmitting(false);
          return;
        }

        try {
          const response = await fetch('/api/auth/google', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              accessToken: tokenResponse.access_token,
              scope: tokenResponse.scope || 'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send',
            }),
          });

          const data = await parseResponseBody(response);

          if (!response.ok) {
            throw new Error(
              data && 'message' in data && data.message
                ? data.message
                : 'Unable to sign in with Google right now.',
            );
          }

          if (!data || !('token' in data) || !('refreshToken' in data) || !('user' in data)) {
            throw new Error('The server returned an invalid Google login response.');
          }

          saveAuthSession(data);

          const nextPath =
            (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ||
            '/dashboard';
          navigate(nextPath, { replace: true });
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Unable to sign in with Google right now.',
          );
        } finally {
          setIsGoogleSubmitting(false);
        }
      },
    } as any) as GoogleTokenClient;

    setIsGoogleSubmitting(true);
    tokenClient.requestAccessToken();
  };

  const handleGitHubLogin = () => {
    setError('');

    if (!oauthConfig?.githubClientId || !oauthConfig.githubCallbackUrl) {
      setError('GitHub OAuth is not configured yet.');
      return;
    }

    setIsGitHubSubmitting(true);
    sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
    sessionStorage.setItem(GITHUB_REDIRECT_KEY, '/dashboard');

    const params = new URLSearchParams({
      client_id: oauthConfig.githubClientId,
      redirect_uri: oauthConfig.githubCallbackUrl,
      scope: 'read:user user:email repo read:project read:org',
    });

    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
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
        <div className="auth-form-shell">
          <div className="auth-form-wrapper">
            <h1>Login</h1>

            {error && <div className="auth-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="auth-field">
                <label htmlFor="email">Email</label>
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
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="****************"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </div>

              <button type="submit" className="auth-submit-btn" disabled={isSubmitting}>
                {isSubmitting ? 'Signing in...' : 'Login'}
              </button>
            </form>

            <button
              className="auth-google-btn"
              type="button"
              onClick={handleGoogleLogin}
              disabled={isGoogleSubmitting}
            >
              <img src={GOOGLE_ICON} alt="Google" />
              {isGoogleSubmitting ? 'Connecting to Google...' : 'Login with Google'}
            </button>

            <button
              className="auth-google-btn auth-github-btn"
              type="button"
              onClick={handleGitHubLogin}
              disabled={isGitHubSubmitting}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.49 0 12.26c0 5.42 3.44 10.02 8.2 11.64.6.12.82-.27.82-.6 0-.3-.01-1.1-.02-2.16-3.34.75-4.04-1.67-4.04-1.67-.55-1.43-1.33-1.81-1.33-1.81-1.09-.76.08-.75.08-.75 1.2.09 1.84 1.27 1.84 1.27 1.07 1.9 2.8 1.35 3.49 1.03.11-.8.42-1.35.76-1.66-2.67-.31-5.48-1.38-5.48-6.14 0-1.36.47-2.46 1.24-3.33-.13-.31-.54-1.58.12-3.3 0 0 1.01-.33 3.3 1.27a11.2 11.2 0 0 1 6 0c2.3-1.6 3.3-1.27 3.3-1.27.66 1.72.25 2.99.12 3.3.77.87 1.24 1.97 1.24 3.33 0 4.77-2.82 5.82-5.5 6.13.43.38.82 1.12.82 2.27 0 1.64-.02 2.95-.02 3.35 0 .33.22.73.83.6A12.27 12.27 0 0 0 24 12.26C24 5.49 18.63 0 12 0Z" />
              </svg>
              {isGitHubSubmitting ? 'Redirecting to GitHub...' : 'Login with GitHub'}
            </button>

            <div className="auth-footer">
              Don&apos;t have user? <Link to="/register">Register</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
