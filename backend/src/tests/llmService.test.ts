import http from "http";
import { AddressInfo } from "net";
import { LlmService, LlmServiceError } from "../services/LLM/llmService";

jest.setTimeout(30000);

let server: http.Server;
let service: LlmService;
let baseUrl: string;
let originalBaseUrl: string | undefined;
let originalUser: string | undefined;
let originalPass: string | undefined;
let originalTimeout: string | undefined;
let originalModel: string | undefined;

beforeAll(async () => {
  originalBaseUrl = process.env.LLM_BASE_URL;
  originalUser = process.env.LLM_USER;
  originalPass = process.env.LLM_PASS;
  originalTimeout = process.env.LLM_TIMEOUT_MS;
  originalModel = process.env.LLM_MODEL;

  server = http.createServer((req, res) => {
    if (req.url === "/generate-success/api/generate") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ response: "ok", model: "test-model" }));
      return;
    }

    if (req.url === "/generate-401/api/generate") {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    if (req.url === "/generate-429/api/generate") {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "rate limit" }));
      return;
    }

    if (req.url === "/generate-500/api/generate") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "server error" }));
      return;
    }

    if (req.url === "/generate-400/api/generate") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad request" }));
      return;
    }

    if (req.url === "/generate-invalid-json/api/generate") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{invalid-json");
      return;
    }

    if (req.url === "/generate-timeout/api/generate") {
      setTimeout(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ response: "slow" }));
      }, 200);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;

  process.env.LLM_USER = "test-user";
  process.env.LLM_PASS = "test-pass";
  process.env.LLM_TIMEOUT_MS = "50";
  process.env.LLM_MODEL = "fallback-model";

  service = new LlmService();
}, 30000);

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  process.env.LLM_BASE_URL = originalBaseUrl;
  process.env.LLM_USER = originalUser;
  process.env.LLM_PASS = originalPass;
  process.env.LLM_TIMEOUT_MS = originalTimeout;
  process.env.LLM_MODEL = originalModel;
});

describe("LlmService", () => {
  describe("generate", () => {
    test("returns a successful response", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-success`;

      const response = await service.generate({
        prompt: "hello",
        options: { temperature: 0.1 },
      });

      expect(response.response).toBe("ok");
      expect(response.model).toBe("test-model");
    });

    test("uses the configured default model", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-success`;

      const response = await service.generate({
        prompt: "hello again",
      });

      expect(response.response).toBe("ok");
    });

    test("throws when credentials are missing", async () => {
      delete process.env.LLM_USER;

      await expect(
        service.generate({
          prompt: "missing creds",
        }),
      ).rejects.toMatchObject({
        message: "LLM service credentials are missing",
        statusCode: 500,
      });

      process.env.LLM_USER = "test-user";
    });

    test("throws for invalid json responses", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-invalid-json`;

      await expect(
        service.generate({
          prompt: "invalid json",
        }),
      ).rejects.toMatchObject({
        message: "Invalid JSON response from LLM service",
        statusCode: 502,
      });
    });

    test("throws for authentication failures", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-401`;

      await expect(
        service.generate({
          prompt: "auth fail",
        }),
      ).rejects.toMatchObject({
        message: "LLM authentication failed",
        statusCode: 401,
      });
    });

    test("throws for rate limits", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-429`;

      await expect(
        service.generate({
          prompt: "rate limit",
        }),
      ).rejects.toMatchObject({
        message: "LLM rate limit exceeded",
        statusCode: 429,
      });
    });

    test("throws for service unavailability", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-500`;

      await expect(
        service.generate({
          prompt: "server error",
        }),
      ).rejects.toMatchObject({
        message: "LLM service unavailable",
        statusCode: 503,
      });
    });

    test("throws with the upstream error message for other failures", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-400`;

      await expect(
        service.generate({
          prompt: "bad request",
        }),
      ).rejects.toMatchObject({
        message: "bad request",
        statusCode: 400,
      });
    });

    test("throws on request timeout", async () => {
      process.env.LLM_BASE_URL = `${baseUrl}/generate-timeout`;

      await expect(
        service.generate({
          prompt: "slow request",
        }),
      ).rejects.toMatchObject({
        message: "LLM service request timed out",
        statusCode: 504,
      });
    });

    test("throws when the server cannot be reached", async () => {
      process.env.LLM_BASE_URL = "http://127.0.0.1:1";

      await expect(
        service.generate({
          prompt: "no server",
        }),
      ).rejects.toMatchObject({
        message: "Failed to connect to LLM service",
        statusCode: 503,
      });
    });
  });
});
