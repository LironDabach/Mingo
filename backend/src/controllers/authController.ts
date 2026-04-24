import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/usersModel";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { OAuth2Client } from "google-auth-library";

const sendError = (code: number, message: string, res: Response) => {
  res.status(code).json({ message });
};

type GeneratedTokens = {
  token: string;
  refreshToken: string;
};

type AuthProviderProfile = {
  provider: "google" | "github";
  providerId: string;
  email: string;
  fullname?: string;
};

const getRegisterDuplicateMessage = (field?: string) => {
  switch (field) {
    case "email":
      return "Email already exists";
    case "fullname":
      return "Fullname already exists";
    default:
      return "User already exists";
  }
};

type GitHubTokenDetails = {
  accessToken: string;
  tokenType?: string | undefined;
  scope?: string | undefined;
};

const buildAuthResponse = (user: any, tokens: GeneratedTokens) => ({
  ...tokens,
  user: {
    _id: user._id,
    username: user.username,
    fullname: user.fullname,
    email: user.email,
  },
});

const getAuthenticatedUserId = (req: Request) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return null;
  }

  try {
    const secret = process.env.JWT_SECRET || "default_secret";
    const decoded = jwt.verify(token, secret) as { _id: string };
    return decoded._id;
  } catch (_err) {
    return null;
  }
};

const normalizeUsername = (value: string) =>
  value.replace(/[^a-zA-Z0-9._-]/g, "");

const buildUniqueUsername = async (seed: string) => {
  const baseUsername = normalizeUsername(seed) || "user";
  let username = baseUsername;
  let counter = 1;

  while (await User.exists({ username })) {
    username = `${baseUsername}${counter}`;
    counter += 1;
  }

  return username;
};

const applyProfileData = (user: any, profile: AuthProviderProfile, shouldOverwriteEmail = true) => {
  if (profile.provider === "github") {
    user.githubId = profile.providerId;
  } else {
    user.googleId = profile.providerId;
  }

  if (shouldOverwriteEmail) {
    user.email = profile.email;
  }
  if (!user.fullname && profile.fullname) {
    user.fullname = profile.fullname;
  }
};

const saveGitHubTokenData = (user: any, tokenDetails?: GitHubTokenDetails) => {
  if (!tokenDetails?.accessToken) {
    return;
  }

  user.githubAccessToken = tokenDetails.accessToken;
  user.githubTokenType = tokenDetails.tokenType || "bearer";
  user.githubTokenScope = tokenDetails.scope || "";
};

const findOrCreateOAuthUser = async (
  profile: AuthProviderProfile,
  req: Request,
  providerTokens?: GitHubTokenDetails,
) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  const providerLookup =
    profile.provider === "github"
      ? { githubId: profile.providerId }
      : { googleId: profile.providerId };

  let providerOwner = await User.findOne(providerLookup);

  if (authenticatedUserId) {
    const authenticatedUser = await User.findById(authenticatedUserId);

    if (!authenticatedUser) {
      return { error: { code: 401, message: "Invalid access token" } };
    }

    if (providerOwner && providerOwner._id.toString() !== authenticatedUserId) {
      return {
        error: {
          code: 409,
          message: `${profile.provider} account is already linked to another user`,
        },
      };
    }

    // When a signed-in user links an OAuth provider, keep the app's primary
    // email as-is so Google/GitHub can belong to a different address.
    applyProfileData(authenticatedUser, profile, false);
    if (profile.provider === "github") {
      saveGitHubTokenData(authenticatedUser, providerTokens);
    }
    await authenticatedUser.save();
    return { user: authenticatedUser };
  }

  if (providerOwner) {
    applyProfileData(providerOwner, profile);
    if (profile.provider === "github") {
      saveGitHubTokenData(providerOwner, providerTokens);
    }
    await providerOwner.save();
    return { user: providerOwner };
  }

  let user = await User.findOne({ email: profile.email });
  if (user) {
    applyProfileData(user, profile);
    if (profile.provider === "github") {
      saveGitHubTokenData(user, providerTokens);
    }
    await user.save();
    return { user };
  }

  const username = await buildUniqueUsername(profile.email.split("@")[0] || profile.email);
  const createPayload: Record<string, any> = {
    username,
    fullname: profile.fullname || username,
    email: profile.email,
    ...(profile.provider === "github"
      ? { githubId: profile.providerId }
      : { googleId: profile.providerId }),
  };
  if (profile.provider === "github" && providerTokens?.accessToken) {
    createPayload.githubAccessToken = providerTokens.accessToken;
    createPayload.githubTokenType = providerTokens.tokenType || "bearer";
    createPayload.githubTokenScope = providerTokens.scope || "";
  }

  user = await User.create(createPayload);

  return { user };
};

const generateToken = (userId: string): GeneratedTokens => {
  const secret = process.env.JWT_SECRET || "default_secret";
  if (!process.env.JWT_SECRET) {
    console.error("JWT_SECRET is not set - Shutting down.");
    process.exit(1);
  }

  const expiresIn = parseInt(process.env.JWT_EXPIRES_IN || "3600");
  const token = jwt.sign({ _id: userId }, secret, { expiresIn: expiresIn });

  const refreshExpiresIn = parseInt(
    process.env.REFRESH_TOKEN_EXPIRES_IN || "1440",
  );
  const rand = Math.floor(Math.random() * 1000);
  const refreshToken = jwt.sign({ _id: userId, rand: rand }, secret, {
    expiresIn: refreshExpiresIn,
  });
  return { token, refreshToken };
};

const fetchGitHubResource = async (
  url: string,
  authHeaders: string[],
): Promise<any> => {
  let lastResponse: any = null;

  for (const authorization of authHeaders) {
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: authorization,
        "User-Agent": "Mingo",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (response.ok) {
      return response;
    }

    lastResponse = response;

    if (response.status !== 401) {
      return response;
    }
  }

  return lastResponse;
};

const register = async (req: Request, res: Response) => {
  const email = req.body.email;
  const password = req.body.password;
  const fullname = req.body.fullname?.trim() || email;

  if (!email || !password) {
    return sendError(400, "Email and password are required", res);
  }

  try {
    const username = await buildUniqueUsername(email.split("@")[0] || email);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({
      username: username,
      fullname: fullname,
      email: email,
      password: hashedPassword,
    });
    const tokens = generateToken(user._id.toString());
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();
    res.status(201).json(buildAuthResponse(user, tokens));
  } catch (err: any) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      return sendError(400, getRegisterDuplicateMessage(field), res);
    }
    return sendError(500, "Internal server error", res);
  }
};

const login = async (req: Request, res: Response) => {
  const email = req.body.email;
  const password = req.body.password;

  if (!email || !password) {
    return sendError(400, "Email and password are required", res);
  }

  try {
    const user = await User.findOne({ email: email.trim() });
    if (!user) {
      return sendError(401, "Invalid email or password", res);
    }
    
    // Check if user has a password (Google users might not have one)
    if (!user.password) {
      return sendError(401, "Please use Google to sign in", res);
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(401, "Invalid email or password", res);
    }

    const tokens = generateToken(user._id.toString());
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();
    res.status(200).json(buildAuthResponse(user, tokens));
  } catch (err) {
    return sendError(500, "Internal server error", res);
  }
};

const logout = async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken;

  if (!refreshToken) {
    return sendError(400, "Refresh token is required", res);
  }

  try {
    const decoded = jwt.decode(refreshToken) as { _id: string };
    const user = await User.findById(decoded._id);
    if (!user) {
      return sendError(401, "Invalid refresh token", res);
    }
    user.refreshTokens = user.refreshTokens.filter(
      (token) => token !== refreshToken,
    );
    await user.save();
    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    return sendError(500, "Internal server error", res);
  }
};

const refreshToken = async (req: Request, res: Response) => {
  const refreshToken = req.body.refreshToken;

  if (!refreshToken) {
    return sendError(400, "Refresh token is required", res);
  }

  const secret = process.env.JWT_SECRET || "default_secret";

  try {
    const decoded = jwt.verify(refreshToken, secret) as { _id: string };
    const user = await User.findById(decoded._id);
    if (!user) {
      return sendError(401, "Invalid refresh token", res);
    }
    if (!user.refreshTokens.includes(refreshToken)) {
      user.refreshTokens = [];
      await user.save();
      console.log(" Probably stolen token for: ", user._id);
      return sendError(401, "Invalid refresh token", res);
    }
    const tokens = generateToken(decoded._id);

    user.refreshTokens = user.refreshTokens.filter(
      (token) => token !== refreshToken,
    );
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();
    res.status(200).json(tokens);
  } catch (err) {
    return sendError(401, "Invalid refresh token", res);
  }
};

const gitHubLogin = async (req: Request, res: Response) => {
  const code = req.body.code;

  if (!code) {
    return sendError(400, "GitHub authorization code is required", res);
  }

  const clientId = process.env.GITHUB_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GITHUB_CALLBACK_URL?.trim();

  if (!clientId || !clientSecret || !redirectUri) {
    return sendError(500, "GitHub OAuth is not configured", res);
  }

  try {
    const tokenRequestBody = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenRequestBody.toString(),
      },
    );

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
      token_type?: string;
    };

    if (!tokenResponse.ok || !tokenData.access_token) {
      return sendError(
        401,
        tokenData.error_description || tokenData.error || "Failed to authenticate with GitHub",
        res,
      );
    }

    const githubToken = tokenData.access_token;
    const primaryAuthHeader =
      tokenData.token_type?.toLowerCase() === "bearer"
        ? `Bearer ${githubToken}`
        : `token ${githubToken}`;
    const fallbackAuthHeader =
      primaryAuthHeader.startsWith("Bearer ")
        ? `token ${githubToken}`
        : `Bearer ${githubToken}`;
    const authHeaders = [primaryAuthHeader, fallbackAuthHeader];

    const userResponse = await fetchGitHubResource(
      "https://api.github.com/user",
      authHeaders,
    );

    if (!userResponse.ok) {
      const userErrorText = await userResponse.text();
      return sendError(
        401,
        `Failed to fetch GitHub user${userErrorText ? `: ${userErrorText}` : ""}`,
        res,
      );
    }

    const githubUser = (await userResponse.json()) as {
      id?: number;
      login?: string;
      avatar_url?: string;
      email?: string | null;
      name?: string | null;
    };

    if (!githubUser.id || !githubUser.login) {
      return sendError(401, "Invalid GitHub user data", res);
    }

    let email = githubUser.email;

    if (!email) {
      const emailsResponse = await fetchGitHubResource(
        "https://api.github.com/user/emails",
        authHeaders,
      );

      if (emailsResponse.ok) {
        const emails = (await emailsResponse.json()) as Array<{
          email: string;
          primary?: boolean;
          verified?: boolean;
        }>;
        email =
          emails.find((entry) => entry.primary && entry.verified)?.email ||
          emails.find((entry) => entry.verified)?.email ||
          emails[0]?.email ||
          null;
      }
    }

    if (!email) {
      return sendError(400, "GitHub account does not have a usable email", res);
    }

    const result = await findOrCreateOAuthUser(
      {
        provider: "github",
        providerId: githubUser.id.toString(),
        email,
        fullname: githubUser.name?.trim() || githubUser.login,
      },
      req,
      {
        accessToken: githubToken,
        tokenType: tokenData.token_type,
        scope:
          typeof (tokenData as { scope?: string }).scope === "string"
            ? (tokenData as { scope?: string }).scope
            : "",
      },
    );

    if (result.error) {
      return sendError(result.error.code, result.error.message, res);
    }

    const user = result.user!;

    const tokens = generateToken(user._id.toString());
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();

    res.status(200).json(buildAuthResponse(user, tokens));
  } catch (err) {
    return sendError(500, "Internal server error", res);
  }
};

const googleClient = new OAuth2Client();

const disconnectOAuthProvider = async (
  req: Request,
  res: Response,
  provider: "google" | "github",
) => {
  const authenticatedUserId = getAuthenticatedUserId(req);
  if (!authenticatedUserId) {
    return sendError(
      401,
      "Unauthorized: missing or invalid Authorization header",
      res,
    );
  }

  try {
    const fieldToUnset = provider === "github" ? "githubId" : "googleId";
    const user = await User.findById(authenticatedUserId);

    if (!user) {
      return sendError(401, "Invalid access token", res);
    }

    if (!user.get(fieldToUnset)) {
      return sendError(
        400,
        `${provider === "github" ? "GitHub" : "Google"} account is not linked`,
        res,
      );
    }

    await User.findByIdAndUpdate(
      authenticatedUserId,
      provider === "github"
        ? {
            $unset: {
              [fieldToUnset]: 1,
              githubAccessToken: 1,
              githubTokenType: 1,
              githubTokenScope: 1,
            },
          }
        : { $unset: { [fieldToUnset]: 1 } },
    );

    return res.status(200).json({
      message: `${provider === "github" ? "GitHub" : "Google"} account disconnected successfully`,
    });
  } catch (_err) {
    return sendError(500, "Internal server error", res);
  }
};

const googleLogin = async (req: Request, res: Response) => {
  const credential = req.body.credential;
  const accessToken = req.body.accessToken;

  if (!credential && !accessToken) {
    return sendError(400, "Google credential is required", res);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    return sendError(500, "Google OAuth is not configured", res);
  }

  try {
    let profile:
      | {
          sub?: string;
          email?: string;
          name?: string;
          picture?: string;
        }
      | undefined;

    if (credential) {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });

      profile = ticket.getPayload();
    } else if (accessToken) {
      const googleProfileResponse = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!googleProfileResponse.ok) {
        return sendError(401, "Invalid Google credential", res);
      }

      profile = (await googleProfileResponse.json()) as {
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      };
    }

    if (!profile?.sub || !profile?.email) {
      return sendError(401, "Invalid Google credential", res);
    }

    const result = await findOrCreateOAuthUser(
      {
        provider: "google",
        providerId: profile.sub,
        email: profile.email,
        fullname: profile.name || profile.email,
      },
      req,
    );

    if (result.error) {
      return sendError(result.error.code, result.error.message, res);
    }

    const user = result.user!;
    const tokens = generateToken(user._id.toString());
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();

    return res.status(200).json(buildAuthResponse(user, tokens));
  } catch (err) {
    return sendError(401, "Invalid Google credential", res);
  }
};

const disconnectGoogle = async (req: Request, res: Response) => {
  return disconnectOAuthProvider(req, res, "google");
};

const disconnectGitHub = async (req: Request, res: Response) => {
  return disconnectOAuthProvider(req, res, "github");
};

const getOAuthConfig = (_req: Request, res: Response) => {
  return res.status(200).json({
    googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    githubClientId: process.env.GITHUB_CLIENT_ID?.trim() || null,
    githubCallbackUrl: process.env.GITHUB_CALLBACK_URL?.trim() || null,
  });
};

const getGitHubRepositories = async (req: Request, res: Response) => {
  const authenticatedUserId = getAuthenticatedUserId(req);

  if (!authenticatedUserId) {
    return sendError(
      401,
      "Unauthorized: missing or invalid Authorization header",
      res,
    );
  }

  try {
    const user = await User.findById(authenticatedUserId);

    if (!user?.githubAccessToken) {
      return sendError(
        400,
        "GitHub is not synced yet. Connect it from settings when available.",
        res,
      );
    }

    const tokenType =
      typeof user.githubTokenType === "string" &&
      user.githubTokenType.trim().toLowerCase() === "bearer"
        ? "Bearer"
        : "token";

    const response = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `${tokenType} ${user.githubAccessToken}`,
        "User-Agent": "Mingo",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return sendError(
        response.status === 401 ? 401 : 502,
        errorText || "Failed to load GitHub repositories",
        res,
      );
    }

    const repos = (await response.json()) as Array<{
      id: number;
      name: string;
      full_name: string;
      private?: boolean;
      owner?: { login?: string };
    }>;

    return res.status(200).json(
      repos.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner?.login || "",
        private: Boolean(repo.private),
      })),
    );
  } catch (_err) {
    return sendError(500, "Failed to load GitHub repositories", res);
  }
};

export default {
  register,
  login,
  logout,
  refreshToken,
  googleLogin,
  gitHubLogin,
  disconnectGoogle,
  disconnectGitHub,
  getOAuthConfig,
  getGitHubRepositories,
};

