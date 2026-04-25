import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchWithAuth,
  getAuthHeaders,
  getStoredUser,
  parseResponseBody,
  saveAuthSession,
  type OAuthConfigResponse,
} from '../lib/auth';
import './SettingsPage.css';

const GOOGLE_ICON =
  'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';
const GITHUB_REDIRECT_KEY = 'github-oauth:redirect';
const GITHUB_OAUTH_STATE_KEY = 'github-oauth:active';

type SettingsUser = {
  _id: string;
  username: string;
  fullname: string;
  email: string;
  profilePicture?: string | null;
  googleId?: string | null;
  githubId?: string | null;
};

type GoogleTokenClient = {
  requestAccessToken: () => void;
};

const SettingsPage = () => {
  const navigate = useNavigate();
  const storedUser = useMemo(() => getStoredUser(), []);

  const [profile, setProfile] = useState<SettingsUser | null>(null);
  const [fullname, setFullname] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigResponse | null>(null);
  const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);
  const [isGitHubSyncing, setIsGitHubSyncing] = useState(false);
  const [isGoogleDisconnecting, setIsGoogleDisconnecting] = useState(false);
  const [isGitHubDisconnecting, setIsGitHubDisconnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const loadPageData = async () => {
      if (!storedUser?._id) {
        navigate('/login', { replace: true });
        return;
      }

      try {
        const [profileResponse, providersResponse] = await Promise.all([
          fetchWithAuth(`/api/user/${storedUser._id}`),
          fetch('/api/auth/providers'),
        ]);

        const profileData = await parseResponseBody(profileResponse);
        const providersData = await parseResponseBody(providersResponse);

        if (
          !profileResponse.ok ||
          !profileData ||
          !('_id' in profileData) ||
          !('fullname' in profileData) ||
          !('username' in profileData) ||
          !('email' in profileData)
        ) {
          throw new Error('Unable to load your settings right now.');
        }

        const nextProfile = profileData as SettingsUser;
        setProfile(nextProfile);
        setFullname(nextProfile.fullname || '');
        setUsername(nextProfile.username || '');
        setEmail(nextProfile.email || '');

        if (
          providersData &&
          'googleClientId' in providersData &&
          'githubClientId' in providersData &&
          'githubCallbackUrl' in providersData
        ) {
          setOauthConfig(providersData);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Unable to load your settings right now.',
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadPageData();
  }, [navigate, storedUser]);

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

  const persistStoredUser = (nextProfile: SettingsUser) => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        _id: nextProfile._id,
        username: nextProfile.username,
        fullname: nextProfile.fullname,
        email: nextProfile.email,
        profilePicture: nextProfile.profilePicture || null,
      }),
    );
  };

  const refreshProfile = async () => {
    if (!storedUser?._id) {
      return;
    }

    const response = await fetchWithAuth(`/api/user/${storedUser._id}`);
    const data = await parseResponseBody(response);

    if (
      !response.ok ||
      !data ||
      !('_id' in data) ||
      !('fullname' in data) ||
      !('username' in data) ||
      !('email' in data)
    ) {
      throw new Error('Unable to refresh your profile right now.');
    }

    const nextProfile = data as SettingsUser;
    setProfile(nextProfile);
    setFullname(nextProfile.fullname || '');
    setUsername(nextProfile.username || '');
    setEmail(nextProfile.email || '');
    persistStoredUser(nextProfile);
  };

  const verifyCurrentPassword = async () => {
    if (!profile) {
      return;
    }

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: profile.email,
        password: currentPassword,
      }),
    });

    const data = await parseResponseBody(response);

    if (!response.ok) {
      throw new Error(
        data && 'message' in data && data.message
          ? data.message
          : 'Current password is incorrect.',
      );
    }
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();

    if (!profile) {
      return;
    }

    setError('');
    setSuccess('');

    if (!fullname.trim() || !username.trim() || !email.trim()) {
      setError('Full name, username, and email are required.');
      return;
    }

    if (newPassword && !currentPassword) {
      setError('Enter your current password before setting a new one.');
      return;
    }

    setIsSaving(true);

    try {
      if (newPassword) {
        await verifyCurrentPassword();
      }

      const formData = new FormData();
      formData.append('fullname', fullname.trim());
      formData.append('username', username.trim());
      formData.append('email', email.trim());

      if (newPassword) {
        formData.append('password', newPassword);
      }

      const response = await fetchWithAuth(`/api/user/${profile._id}`, {
        method: 'PUT',
        body: formData,
      });

      const data = await parseResponseBody(response);

      if (
        !response.ok ||
        !data ||
        !('_id' in data) ||
        !('fullname' in data) ||
        !('username' in data) ||
        !('email' in data)
      ) {
        throw new Error(
          data && 'message' in data && data.message
            ? data.message
            : 'Unable to save your changes right now.',
        );
      }

      const nextProfile = data as SettingsUser;
      setProfile(nextProfile);
      setCurrentPassword('');
      setNewPassword('');
      persistStoredUser(nextProfile);
      setSuccess('Your settings were updated.');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to save your changes right now.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleGoogleSync = () => {
    setError('');
    setSuccess('');

    if (!oauthConfig?.googleClientId) {
      setError('Google sync is not configured yet.');
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
          setError('Google sync failed. Please try again.');
          setIsGoogleSyncing(false);
          return;
        }

        try {
          const response = await fetchWithAuth('/api/auth/google', {
            method: 'POST',
            headers: getAuthHeaders(),
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
                : 'Unable to sync Google right now.',
            );
          }

          if (!data || !('token' in data) || !('refreshToken' in data) || !('user' in data)) {
            throw new Error('The server returned an invalid Google sync response.');
          }

          saveAuthSession(data);
          await refreshProfile();
          setSuccess('Google account synced successfully.');
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Unable to sync Google right now.',
          );
        } finally {
          setIsGoogleSyncing(false);
        }
      },
    }) as GoogleTokenClient;

    setIsGoogleSyncing(true);
    tokenClient.requestAccessToken();
  };

  const handleGitHubSync = () => {
    setError('');
    setSuccess('');

    if (!oauthConfig?.githubClientId || !oauthConfig.githubCallbackUrl) {
      setError('GitHub sync is not configured yet.');
      return;
    }

    setIsGitHubSyncing(true);
    sessionStorage.removeItem(GITHUB_OAUTH_STATE_KEY);
    sessionStorage.setItem(GITHUB_REDIRECT_KEY, '/settings');

    const params = new URLSearchParams({
      client_id: oauthConfig.githubClientId,
      redirect_uri: oauthConfig.githubCallbackUrl,
      scope: 'read:user user:email repo read:project read:org',
    });

    window.location.href = `https://github.com/login/oauth/authorize?${params.toString()}`;
  };

  const handleDisconnectProvider = async (provider: 'google' | 'github') => {
    setError('');
    setSuccess('');

    if (provider === 'google') {
      setIsGoogleDisconnecting(true);
    } else {
      setIsGitHubDisconnecting(true);
    }

    try {
      const response = await fetchWithAuth(`/api/auth/${provider}/disconnect`, {
        method: 'POST',
      });
      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error(
          data && 'message' in data && data.message
            ? data.message
            : `Unable to disconnect ${provider} right now.`,
        );
      }

      await refreshProfile();
      setSuccess(
        `${provider === 'google' ? 'Google' : 'GitHub'} account disconnected successfully.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Unable to disconnect ${provider} right now.`,
      );
    } finally {
      if (provider === 'google') {
        setIsGoogleDisconnecting(false);
      } else {
        setIsGitHubDisconnecting(false);
      }
    }
  };

  const connectedGoogle = Boolean(profile?.googleId);
  const connectedGitHub = Boolean(profile?.githubId);

  return (
    <div className="settings-page">
      <div className="settings-card">
        <button
          type="button"
          className="settings-close"
          onClick={() => navigate('/dashboard')}
          aria-label="Close settings"
        >
          ×
        </button>

        <h1 className="settings-title">Settings</h1>

        {isLoading ? (
          <div className="settings-feedback settings-feedback--muted">
            Loading your settings...
          </div>
        ) : (
          <form className="settings-form" onSubmit={handleSave}>
            {error && <div className="settings-feedback settings-feedback--error">{error}</div>}
            {success && (
              <div className="settings-feedback settings-feedback--success">{success}</div>
            )}

            <div className="settings-fields">
              <label className="settings-field">
                <span>Fullname</span>
                <input
                  type="text"
                  value={fullname}
                  onChange={(event) => setFullname(event.target.value)}
                  placeholder="Fullname"
                  required
                />
              </label>

              <label className="settings-field">
                <span>Username</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="Username"
                  required
                />
              </label>

              <label className="settings-field">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  required
                />
              </label>

              <label className="settings-field">
                <span>Current Password</span>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  placeholder="****************"
                />
              </label>

              <label className="settings-field">
                <span>New Password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="****************"
                />
              </label>
            </div>

            <button type="submit" className="settings-save" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save changes'}
            </button>

            <div className="settings-provider-row">
              <button
                type="button"
                className="settings-sync settings-sync--google"
                onClick={handleGoogleSync}
                disabled={isGoogleSyncing || isGoogleDisconnecting}
              >
                <img src={GOOGLE_ICON} alt="Google" />
                <span>
                  {isGoogleSyncing
                    ? 'Syncing Google account...'
                    : connectedGoogle
                      ? 'Re-sync Google account'
                      : 'Sync Google account'}
                </span>
              </button>

              {connectedGoogle && <span className="settings-synced-badge">SYNCED</span>}

              {connectedGoogle && (
                <button
                  type="button"
                  className="settings-disconnect"
                  onClick={() => handleDisconnectProvider('google')}
                  disabled={isGoogleDisconnecting || isGoogleSyncing}
                >
                  {isGoogleDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              )}
            </div>

            <div className="settings-provider-row">
              <button
                type="button"
                className="settings-sync settings-sync--github"
                onClick={handleGitHubSync}
                disabled={connectedGitHub || isGitHubSyncing || isGitHubDisconnecting}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 0C5.37 0 0 5.49 0 12.26c0 5.42 3.44 10.02 8.2 11.64.6.12.82-.27.82-.6 0-.3-.01-1.1-.02-2.16-3.34.75-4.04-1.67-4.04-1.67-.55-1.43-1.33-1.81-1.33-1.81-1.09-.76.08-.75.08-.75 1.2.09 1.84 1.27 1.84 1.27 1.07 1.9 2.8 1.35 3.49 1.03.11-.8.42-1.35.76-1.66-2.67-.31-5.48-1.38-5.48-6.14 0-1.36.47-2.46 1.24-3.33-.13-.31-.54-1.58.12-3.3 0 0 1.01-.33 3.3 1.27a11.2 11.2 0 0 1 6 0c2.3-1.6 3.3-1.27 3.3-1.27.66 1.72.25 2.99.12 3.3.77.87 1.24 1.97 1.24 3.33 0 4.77-2.82 5.82-5.5 6.13.43.38.82 1.12.82 2.27 0 1.64-.02 2.95-.02 3.35 0 .33.22.73.83.6A12.27 12.27 0 0 0 24 12.26C24 5.49 18.63 0 12 0Z" />
                </svg>
                <span>
                  {isGitHubSyncing
                    ? 'Opening GitHub...'
                    : 'Sync GitHub account'}
                </span>
              </button>

              {connectedGitHub && <span className="settings-synced-badge">SYNCED</span>}

              {connectedGitHub && (
                <button
                  type="button"
                  className="settings-disconnect"
                  onClick={() => handleDisconnectProvider('github')}
                  disabled={isGitHubDisconnecting || isGitHubSyncing}
                >
                  {isGitHubDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
