import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header/Header';
import {
  fetchWithAuth,
  getAuthHeaders,
  getStoredUser,
  parseResponseBody,
  saveAuthSession,
  type OAuthConfigResponse,
} from '../lib/auth';
import './SettingsPage.css';

const GOOGLE_ICON = 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';
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

type FieldErrors = {
  fullname?: string;
  username?: string;
  email?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

const validateProfile = (fullname: string, username: string): FieldErrors => {
  const errors: FieldErrors = {};

  if (!fullname.trim()) {
    errors.fullname = 'Full name is required.';
  } else if (fullname.trim().length < 2) {
    errors.fullname = 'Full name must be at least 2 characters.';
  }

  if (!username.trim()) {
    errors.username = 'Username is required.';
  } else if (!USERNAME_RE.test(username.trim())) {
    errors.username = '3–20 characters, letters, numbers, _ or - only.';
  }

  return errors;
};

const validatePassword = (
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): FieldErrors => {
  const errors: FieldErrors = {};

  if (newPassword && !currentPassword) {
    errors.currentPassword = 'Enter your current password first.';
  }

  if (newPassword && newPassword.length < 8) {
    errors.newPassword = 'New password must be at least 8 characters.';
  }

  if (newPassword && confirmPassword && newPassword !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (confirmPassword && !newPassword) {
    errors.newPassword = 'Enter a new password first.';
  }

  return errors;
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oauthConfig, setOauthConfig] = useState<OAuthConfigResponse | null>(null);
  const [isGoogleScriptReady, setIsGoogleScriptReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isGoogleSyncing, setIsGoogleSyncing] = useState(false);
  const [isGitHubSyncing, setIsGitHubSyncing] = useState(false);
  const [isGoogleDisconnecting, setIsGoogleDisconnecting] = useState(false);
  const [isGitHubDisconnecting, setIsGitHubDisconnecting] = useState(false);

  const [profileErrors, setProfileErrors] = useState<FieldErrors>({});
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [integrationMessage, setIntegrationMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

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
        setGlobalError(err instanceof Error ? err.message : 'Unable to load your settings right now.');
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

    return () => { script.onload = null; };
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
    if (!storedUser?._id) return;

    const response = await fetchWithAuth(`/api/user/${storedUser._id}`);
    const data = await parseResponseBody(response);

    if (
      !response.ok || !data ||
      !('_id' in data) || !('fullname' in data) ||
      !('username' in data) || !('email' in data)
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
    if (!profile) return;

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: profile.email, password: currentPassword }),
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

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setProfileSuccess('');
    const errors = validateProfile(fullname, username);

    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }

    setProfileErrors({});
    setIsSavingProfile(true);

    try {
      const formData = new FormData();
      formData.append('fullname', fullname.trim());
      formData.append('username', username.trim());
      formData.append('email', profile.email);

      const response = await fetchWithAuth(`/api/user/${profile._id}`, {
        method: 'PUT',
        body: formData,
      });

      const data = await parseResponseBody(response);

      if (
        !response.ok || !data ||
        !('_id' in data) || !('fullname' in data) ||
        !('username' in data) || !('email' in data)
      ) {
        throw new Error(
          data && 'message' in data && data.message
            ? data.message
            : 'Unable to save your profile right now.',
        );
      }

      const nextProfile = data as SettingsUser;
      setProfile(nextProfile);
      persistStoredUser(nextProfile);
      setProfileSuccess('Profile updated successfully.');
    } catch (err) {
      setProfileErrors({ fullname: err instanceof Error ? err.message : 'Unable to save your profile.' });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSavePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;

    setPasswordSuccess('');
    const errors = validatePassword(currentPassword, newPassword, confirmPassword);

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      return;
    }

    if (!newPassword) {
      setPasswordErrors({ newPassword: 'Enter a new password to save.' });
      return;
    }

    setPasswordErrors({});
    setIsSavingPassword(true);

    try {
      await verifyCurrentPassword();

      const formData = new FormData();
      formData.append('fullname', profile.fullname);
      formData.append('username', profile.username);
      formData.append('email', profile.email);
      formData.append('password', newPassword);

      const response = await fetchWithAuth(`/api/user/${profile._id}`, {
        method: 'PUT',
        body: formData,
      });

      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error(
          data && 'message' in data && data.message
            ? data.message
            : 'Unable to update password right now.',
        );
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Password updated successfully.');
    } catch (err) {
      setPasswordErrors({ currentPassword: err instanceof Error ? err.message : 'Unable to update password.' });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleGoogleSync = () => {
    setIntegrationMessage(null);

    if (!oauthConfig?.googleClientId) {
      setIntegrationMessage({ type: 'error', text: 'Google sync is not configured yet.' });
      return;
    }

    if (!isGoogleScriptReady || !window.google?.accounts?.oauth2) {
      setIntegrationMessage({ type: 'error', text: 'Google sign-in is still loading. Please try again.' });
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: oauthConfig.googleClientId,
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.send',
      prompt: 'consent',
      include_granted_scopes: true,
      callback: async (tokenResponse: { access_token?: string; error?: string; scope?: string }) => {
        if (tokenResponse.error || !tokenResponse.access_token) {
          setIntegrationMessage({ type: 'error', text: 'Google sync failed. Please try again.' });
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
          setIntegrationMessage({ type: 'success', text: 'Google account connected successfully.' });
        } catch (err) {
          setIntegrationMessage({ type: 'error', text: err instanceof Error ? err.message : 'Unable to sync Google right now.' });
        } finally {
          setIsGoogleSyncing(false);
        }
      },
    }) as GoogleTokenClient;

    setIsGoogleSyncing(true);
    tokenClient.requestAccessToken();
  };

  const handleGitHubSync = () => {
    setIntegrationMessage(null);

    if (!oauthConfig?.githubClientId || !oauthConfig.githubCallbackUrl) {
      setIntegrationMessage({ type: 'error', text: 'GitHub sync is not configured yet.' });
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
    setIntegrationMessage(null);

    if (provider === 'google') setIsGoogleDisconnecting(true);
    else setIsGitHubDisconnecting(true);

    try {
      const response = await fetchWithAuth(`/api/auth/${provider}/disconnect`, { method: 'POST' });
      const data = await parseResponseBody(response);

      if (!response.ok) {
        throw new Error(
          data && 'message' in data && data.message
            ? data.message
            : `Unable to disconnect ${provider} right now.`,
        );
      }

      await refreshProfile();
      setIntegrationMessage({
        type: 'success',
        text: `${provider === 'google' ? 'Google' : 'GitHub'} account disconnected.`,
      });
    } catch (err) {
      setIntegrationMessage({
        type: 'error',
        text: err instanceof Error ? err.message : `Unable to disconnect ${provider} right now.`,
      });
    } finally {
      if (provider === 'google') setIsGoogleDisconnecting(false);
      else setIsGitHubDisconnecting(false);
    }
  };

  const connectedGoogle = Boolean(profile?.googleId);
  const connectedGitHub = Boolean(profile?.githubId);

  return (
    <div className="settings-layout">
      <Header />
      <main className="settings-main">
        <h1 className="settings-page-title">Account Settings</h1>
        <p className="settings-page-sub">Manage your profile, security, and connected accounts.</p>

        {globalError && (
          <div className="settings-feedback settings-feedback--error">{globalError}</div>
        )}

        {isLoading ? (
          <div className="settings-loading">
            <div className="settings-skeleton" />
            <div className="settings-skeleton" style={{ height: '180px' }} />
            <div className="settings-skeleton" style={{ height: '160px' }} />
          </div>
        ) : (
          <>
            {/* ── Profile ── */}
            <section className="settings-section">
              <div className="settings-section-header">
                <p className="settings-section-title">Profile</p>
                <p className="settings-section-desc">Update your display name and username.</p>
              </div>
              <form onSubmit={handleSaveProfile} noValidate>
                <div className="settings-section-body">
                  {profileSuccess && (
                    <div className="settings-feedback settings-feedback--success">{profileSuccess}</div>
                  )}

                  <div className="settings-field-row">
                    <div className="settings-field">
                      <label className="settings-field-label">
                        Full name <span className="required">*</span>
                      </label>
                      <input
                        className={`settings-field-input${profileErrors.fullname ? ' settings-field-input--error' : ''}`}
                        type="text"
                        value={fullname}
                        onChange={(e) => {
                          setFullname(e.target.value);
                          if (profileErrors.fullname) setProfileErrors((prev) => ({ ...prev, fullname: undefined }));
                        }}
                        placeholder="Your full name"
                      />
                      {profileErrors.fullname && (
                        <span className="settings-field-error">{profileErrors.fullname}</span>
                      )}
                    </div>

                    <div className="settings-field">
                      <label className="settings-field-label">
                        Username <span className="required">*</span>
                      </label>
                      <input
                        className={`settings-field-input${profileErrors.username ? ' settings-field-input--error' : ''}`}
                        type="text"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          if (profileErrors.username) setProfileErrors((prev) => ({ ...prev, username: undefined }));
                        }}
                        placeholder="your_username"
                      />
                      {profileErrors.username ? (
                        <span className="settings-field-error">{profileErrors.username}</span>
                      ) : (
                        <span className="settings-field-hint">Letters, numbers, _ or - (3–20 chars)</span>
                      )}
                    </div>
                  </div>

                  <div className="settings-field">
                    <label className="settings-field-label">Email</label>
                    <input
                      className="settings-field-input settings-field-input--readonly"
                      type="email"
                      value={email}
                      readOnly
                    />
                    <span className="settings-field-hint">Email address cannot be changed.</span>
                  </div>
                </div>

                <div className="settings-section-footer">
                  <button type="submit" className="settings-save-btn" disabled={isSavingProfile}>
                    {isSavingProfile ? 'Saving…' : 'Save profile'}
                  </button>
                </div>
              </form>
            </section>

            {/* ── Security ── */}
            <section className="settings-section">
              <div className="settings-section-header">
                <p className="settings-section-title">Security</p>
                <p className="settings-section-desc">Change your password. Leave blank if you don't want to update it.</p>
              </div>
              <form onSubmit={handleSavePassword} noValidate>
                <div className="settings-section-body">
                  {passwordSuccess && (
                    <div className="settings-feedback settings-feedback--success">{passwordSuccess}</div>
                  )}

                  <div className="settings-field">
                    <label className="settings-field-label">Current password</label>
                    <input
                      className={`settings-field-input${passwordErrors.currentPassword ? ' settings-field-input--error' : ''}`}
                      type="password"
                      value={currentPassword}
                      onChange={(e) => {
                        setCurrentPassword(e.target.value);
                        if (passwordErrors.currentPassword) setPasswordErrors((prev) => ({ ...prev, currentPassword: undefined }));
                      }}
                      placeholder="Enter your current password"
                      autoComplete="current-password"
                    />
                    {passwordErrors.currentPassword && (
                      <span className="settings-field-error">{passwordErrors.currentPassword}</span>
                    )}
                  </div>

                  <div className="settings-field-row">
                    <div className="settings-field">
                      <label className="settings-field-label">New password</label>
                      <input
                        className={`settings-field-input${passwordErrors.newPassword ? ' settings-field-input--error' : ''}`}
                        type="password"
                        value={newPassword}
                        onChange={(e) => {
                          setNewPassword(e.target.value);
                          if (passwordErrors.newPassword) setPasswordErrors((prev) => ({ ...prev, newPassword: undefined }));
                        }}
                        placeholder="Min. 8 characters"
                        autoComplete="new-password"
                      />
                      {passwordErrors.newPassword ? (
                        <span className="settings-field-error">{passwordErrors.newPassword}</span>
                      ) : (
                        <span className="settings-field-hint">At least 8 characters</span>
                      )}
                    </div>

                    <div className="settings-field">
                      <label className="settings-field-label">Confirm new password</label>
                      <input
                        className={`settings-field-input${passwordErrors.confirmPassword ? ' settings-field-input--error' : ''}`}
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (passwordErrors.confirmPassword) setPasswordErrors((prev) => ({ ...prev, confirmPassword: undefined }));
                        }}
                        placeholder="Repeat new password"
                        autoComplete="new-password"
                      />
                      {passwordErrors.confirmPassword && (
                        <span className="settings-field-error">{passwordErrors.confirmPassword}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="settings-section-footer">
                  <button type="submit" className="settings-save-btn" disabled={isSavingPassword}>
                    {isSavingPassword ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </form>
            </section>

            {/* ── Integrations ── */}
            <section className="settings-section">
              <div className="settings-section-header">
                <p className="settings-section-title">Connected accounts</p>
                <p className="settings-section-desc">Link your Google or GitHub account for additional features.</p>
              </div>
              <div className="settings-section-body">
                {integrationMessage && (
                  <div className={`settings-feedback settings-feedback--${integrationMessage.type}`}>
                    {integrationMessage.text}
                  </div>
                )}

                {/* Google */}
                <div className="settings-provider-item">
                  <div className="settings-provider-logo">
                    <img src={GOOGLE_ICON} alt="Google" />
                  </div>
                  <div className="settings-provider-info">
                    <span className="settings-provider-name">Google</span>
                    <span className={`settings-provider-status${connectedGoogle ? ' settings-provider-status--connected' : ''}`}>
                      {connectedGoogle ? 'Connected' : 'Not connected'}
                    </span>
                  </div>
                  <div className="settings-provider-actions">
                    {connectedGoogle && (
                      <span className="settings-connected-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="10" height="10">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Connected
                      </span>
                    )}
                    <button
                      type="button"
                      className="settings-connect-btn"
                      onClick={handleGoogleSync}
                      disabled={isGoogleSyncing || isGoogleDisconnecting}
                    >
                      {isGoogleSyncing ? 'Syncing…' : connectedGoogle ? 'Re-sync' : 'Connect'}
                    </button>
                    {connectedGoogle && (
                      <button
                        type="button"
                        className="settings-disconnect-btn"
                        onClick={() => handleDisconnectProvider('google')}
                        disabled={isGoogleDisconnecting || isGoogleSyncing}
                      >
                        {isGoogleDisconnecting ? 'Removing…' : 'Disconnect'}
                      </button>
                    )}
                  </div>
                </div>

                {/* GitHub */}
                <div className="settings-provider-item">
                  <div className="settings-provider-logo">
                    <svg viewBox="0 0 24 24" fill="currentColor" color="#0f172a">
                      <path d="M12 0C5.37 0 0 5.49 0 12.26c0 5.42 3.44 10.02 8.2 11.64.6.12.82-.27.82-.6 0-.3-.01-1.1-.02-2.16-3.34.75-4.04-1.67-4.04-1.67-.55-1.43-1.33-1.81-1.33-1.81-1.09-.76.08-.75.08-.75 1.2.09 1.84 1.27 1.84 1.27 1.07 1.9 2.8 1.35 3.49 1.03.11-.8.42-1.35.76-1.66-2.67-.31-5.48-1.38-5.48-6.14 0-1.36.47-2.46 1.24-3.33-.13-.31-.54-1.58.12-3.3 0 0 1.01-.33 3.3 1.27a11.2 11.2 0 0 1 6 0c2.3-1.6 3.3-1.27 3.3-1.27.66 1.72.25 2.99.12 3.3.77.87 1.24 1.97 1.24 3.33 0 4.77-2.82 5.82-5.5 6.13.43.38.82 1.12.82 2.27 0 1.64-.02 2.95-.02 3.35 0 .33.22.73.83.6A12.27 12.27 0 0 0 24 12.26C24 5.49 18.63 0 12 0Z" />
                    </svg>
                  </div>
                  <div className="settings-provider-info">
                    <span className="settings-provider-name">GitHub</span>
                    <span className={`settings-provider-status${connectedGitHub ? ' settings-provider-status--connected' : ''}`}>
                      {connectedGitHub ? 'Connected — repositories synced' : 'Not connected'}
                    </span>
                  </div>
                  <div className="settings-provider-actions">
                    {connectedGitHub && (
                      <span className="settings-connected-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="10" height="10">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Connected
                      </span>
                    )}
                    {!connectedGitHub && (
                      <button
                        type="button"
                        className="settings-connect-btn"
                        onClick={handleGitHubSync}
                        disabled={isGitHubSyncing || isGitHubDisconnecting}
                      >
                        {isGitHubSyncing ? 'Redirecting…' : 'Connect'}
                      </button>
                    )}
                    {connectedGitHub && (
                      <button
                        type="button"
                        className="settings-disconnect-btn"
                        onClick={() => handleDisconnectProvider('github')}
                        disabled={isGitHubDisconnecting || isGitHubSyncing}
                      >
                        {isGitHubDisconnecting ? 'Removing…' : 'Disconnect'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default SettingsPage;
