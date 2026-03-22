import { Request, Response } from "express";
import bcrypt from "bcrypt";
import User from "../models/usersModel";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";

const sendError = (code: number, message: string, res: Response) => {
  res.status(code).json({ message });
};

type GeneratedTokens = {
  token: string;
  refreshToken: string;
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

const register = async (req: Request, res: Response) => {
  const username = req.body.username;
  const email = req.body.email;
  const password = req.body.password;

  if (!username || !email || !password) {
    return sendError(400, "Username, email and password are required", res);
  }

  // Allow common username characters while still rejecting spaces/special symbols.
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return sendError(
      400,
      "Username can only contain English letters, numbers, dots, underscores, and hyphens",
      res,
    );
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const user = await User.create({
      username: username,
      email: email,
      password: hashedPassword,
    });
    const tokens = generateToken(user._id.toString());
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();
    res.status(201).json({
      ...tokens,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (err: any) {
    if (err?.code === 11000) {
      const field = Object.keys(err.keyPattern || {})[0];
      if (field === "email") {
        return sendError(400, "Email already exists", res);
      }
      return sendError(400, "Username already exists", res);
    }
    return sendError(500, "Internal server error", res);
  }
};

const login = async (req: Request, res: Response) => {
  const username = req.body.username;
  const password = req.body.password;

  if (!username || !password) {
    return sendError(400, "Username and password are required", res);
  }

  try {
    const user = await User.findOne({ username: username });
    if (!user) {
      return sendError(401, "Invalid username or password", res);
    }
    
    // Check if user has a password (Google users might not have one)
    if (!user.password) {
      return sendError(401, "Please use Google to sign in", res);
    }
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(401, "Invalid username or password", res);
    }

    const tokens = generateToken(user._id.toString());
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();
    res.status(200).json({
      ...tokens,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
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
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      },
    );

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
    };

    if (!tokenResponse.ok || !tokenData.access_token) {
      return sendError(401, "Failed to authenticate with GitHub", res);
    }

    const githubToken = tokenData.access_token;

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "User-Agent": "Mingo",
      },
    });

    if (!userResponse.ok) {
      return sendError(401, "Failed to fetch GitHub user", res);
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
      const emailsResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${githubToken}`,
          "User-Agent": "Mingo",
        },
      });

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

    const profilePicture = githubUser.avatar_url || null;

    let user = await User.findOne({ githubId: githubUser.id.toString() });

    if (!user) {
      user = await User.findOne({ email });
    }

    if (!user) {
      const baseUsername = githubUser.login.replace(/[^a-zA-Z0-9._-]/g, "") || "githubuser";
      let username = baseUsername;
      let counter = 1;

      while (await User.exists({ username })) {
        username = `${baseUsername}${counter}`;
        counter += 1;
      }

      user = await User.create({
        username,
        email,
        githubId: githubUser.id.toString(),
        profilePicture,
      });
    } else {
      user.githubId = githubUser.id.toString();
      user.email = email;
      if (profilePicture) {
        user.profilePicture = profilePicture;
      }
    }

    const tokens = generateToken(user._id.toString());
    user.refreshTokens.push(tokens.refreshToken);
    await user.save();

    res.status(200).json({
      ...tokens,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        profilePicture: user.profilePicture,
      },
    });
  } catch (err) {
    return sendError(500, "Internal server error", res);
  }
};

export default {
  register,
  login,
  logout,
  refreshToken,
  gitHubLogin,
};
