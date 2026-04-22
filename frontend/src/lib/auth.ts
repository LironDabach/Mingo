export type StoredUser = {
  _id: string;
  username: string;
  fullname?: string;
  email: string;
  profilePicture?: string;
};

export type AuthSession = {
  token: string;
  refreshToken: string;
  user: StoredUser;
};

const TOKEN_KEY = "mingo.token";
const REFRESH_TOKEN_KEY = "mingo.refreshToken";
const USER_KEY = "mingo.user";

export function saveSession(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getCurrentUser(): StoredUser | null {
  const rawUser = localStorage.getItem(USER_KEY);
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as StoredUser;
  } catch {
    clearSession();
    return null;
  }
}

export function isAuthenticated() {
  return Boolean(getToken());
}
