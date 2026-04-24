export type AuthResponse = {
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

export type OAuthConfigResponse = {
  googleClientId: string | null;
  githubClientId: string | null;
  githubCallbackUrl: string | null;
};

export type StoredUser = AuthResponse['user'];

export const parseResponseBody = async (response: Response) => {
  const rawBody = await response.text();

  if (!rawBody.trim()) {
    return null;
  }

  try {
    return JSON.parse(rawBody) as
      | AuthResponse
      | OAuthConfigResponse
      | { message?: string };
  } catch (_error) {
    return null;
  }
};

export const saveAuthSession = (data: AuthResponse) => {
  localStorage.setItem('token', data.token);
  localStorage.setItem('refreshToken', data.refreshToken);
  localStorage.setItem('user', JSON.stringify(data.user));
};

export const getStoredUser = (): StoredUser | null => {
  const rawUser = localStorage.getItem('user');

  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as StoredUser;
  } catch (_error) {
    return null;
  }
};

export const getAuthHeaders = (body?: BodyInit | null) => {
  const token = localStorage.getItem('token');
  const shouldSetJsonContentType = !(body instanceof FormData);

  return {
    ...(shouldSetJsonContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const refreshAccessToken = async () => {
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    throw new Error('Your session expired. Please sign in again.');
  }

  const response = await fetch('/api/auth/refresh-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  const data = await parseResponseBody(response);

  if (
    !response.ok ||
    !data ||
    typeof data !== 'object' ||
    !('token' in data) ||
    !('refreshToken' in data)
  ) {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    throw new Error('Your session expired. Please sign in again.');
  }

  localStorage.setItem('token', data.token as string);
  localStorage.setItem('refreshToken', data.refreshToken as string);

  return {
    token: data.token as string,
    refreshToken: data.refreshToken as string,
  };
};

export const fetchWithAuth = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  let response = await fetch(input, {
    ...init,
    headers: {
      ...getAuthHeaders(init.body),
      ...(init.headers || {}),
    },
  });

  if (response.status !== 401) {
    return response;
  }

  await refreshAccessToken();

  response = await fetch(input, {
    ...init,
    headers: {
      ...getAuthHeaders(init.body),
      ...(init.headers || {}),
    },
  });

  return response;
};
