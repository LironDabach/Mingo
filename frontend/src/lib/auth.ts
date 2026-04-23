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
