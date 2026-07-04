import { LlmService } from "../services/LLM/llmService";

jest.setTimeout(30000);

const mockFetch = jest.fn();

let service: LlmService;
let originalApiKey: string | undefined;
let originalModel: string | undefined;
let originalFetch: typeof global.fetch;

const mockOpenAIResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: jest.fn().mockResolvedValue(body),
});

beforeAll(() => {
  originalApiKey = process.env.OPENAI_API_KEY;
  originalModel = process.env.LLM_MODEL;
  originalFetch = global.fetch;

  global.fetch = mockFetch as unknown as typeof global.fetch;
  service = new LlmService();
});

beforeEach(() => {
  mockFetch.mockReset();
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.LLM_MODEL = "fallback-model";
});

afterAll(() => {
  if (originalApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalApiKey;
  }

  process.env.LLM_MODEL = originalModel;
  global.fetch = originalFetch;
});

describe("LlmService", () => {
  describe("generate", () => {
    test("returns a successful response", async () => {
      mockFetch.mockResolvedValue(
        mockOpenAIResponse({
          choices: [{ message: { content: " ok " } }],
          model: "test-model",
        }),
      );

      const response = await service.generate({
        prompt: "hello",
        options: { temperature: 0.1 },
      });

      expect(response.response).toBe("ok");
      expect(response.model).toBe("test-model");
      expect(response.done).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.openai.com/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-openai-key",
            "Content-Type": "application/json",
          }),
        }),
      );
    });

    test("uses the configured default model", async () => {
      mockFetch.mockResolvedValue(
        mockOpenAIResponse({
          choices: [{ message: { content: "ok" } }],
          model: "fallback-model",
        }),
      );

      await service.generate({
        prompt: "hello again",
      });

      const [, requestInit] = mockFetch.mock.calls[0];
      expect(JSON.parse(requestInit.body)).toMatchObject({
        model: "fallback-model",
        messages: [{ role: "user", content: "hello again" }],
        temperature: 0.2,
        top_p: 0.9,
        max_tokens: 400,
      });
    });

    test("uses json response format when requested", async () => {
      mockFetch.mockResolvedValue(
        mockOpenAIResponse({
          choices: [{ message: { content: "{\"ok\":true}" } }],
          model: "fallback-model",
        }),
      );

      await service.generate({
        prompt: "json please",
        format: "json",
      });

      const [, requestInit] = mockFetch.mock.calls[0];
      expect(JSON.parse(requestInit.body)).toMatchObject({
        response_format: { type: "json_object" },
      });
    });

    test("throws when the OpenAI API key is missing", async () => {
      delete process.env.OPENAI_API_KEY;

      await expect(
        service.generate({
          prompt: "missing creds",
        }),
      ).rejects.toMatchObject({
        message: "OpenAI API key is missing",
        statusCode: 500,
      });
    });

    test("throws for authentication failures", async () => {
      mockFetch.mockResolvedValue(mockOpenAIResponse({}, false, 401));

      await expect(
        service.generate({
          prompt: "auth fail",
        }),
      ).rejects.toMatchObject({
        message: "OpenAI authentication failed",
        statusCode: 401,
      });
    });

    test("throws for rate limits", async () => {
      mockFetch.mockResolvedValue(mockOpenAIResponse({}, false, 429));

      await expect(
        service.generate({
          prompt: "rate limit",
        }),
      ).rejects.toMatchObject({
        message: "OpenAI rate limit exceeded",
        statusCode: 429,
      });
    });

    test("throws for service unavailability", async () => {
      mockFetch.mockResolvedValue(mockOpenAIResponse({}, false, 500));

      await expect(
        service.generate({
          prompt: "server error",
        }),
      ).rejects.toMatchObject({
        message: "OpenAI service unavailable",
        statusCode: 503,
      });
    });

    test("throws with the upstream error message for other failures", async () => {
      mockFetch.mockResolvedValue(
        mockOpenAIResponse(
          { error: { message: "bad request" } },
          false,
          400,
        ),
      );

      await expect(
        service.generate({
          prompt: "bad request",
        }),
      ).rejects.toMatchObject({
        message: "bad request",
        statusCode: 400,
      });
    });

    test("uses a fallback error message when upstream error json is unavailable", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: jest.fn().mockRejectedValue(new Error("invalid json")),
      });

      await expect(
        service.generate({
          prompt: "bad request",
        }),
      ).rejects.toMatchObject({
        message: "OpenAI request failed",
        statusCode: 400,
      });
    });
  });
});
