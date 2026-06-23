export class LlmServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "LlmServiceError";
    this.statusCode = statusCode;
  }
}

type GenerateOptions = {
  model?: string;
  prompt: string;
  stream?: boolean;
  format?: "json";
  options?: {
    temperature?: number;
    top_p?: number;
    num_predict?: number;
  };
};

type GenerateResponse = {
  response: string;
  model?: string | undefined;
  created_at?: string | undefined;
  done?: boolean | undefined;
};

class LlmService {
  private getApiKey() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new LlmServiceError("OpenAI API key is missing", 500);
    }
    return apiKey;
  }

  private getDefaultModel() {
    return process.env.LLM_MODEL || "gpt-4o-mini";
  }

  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    const apiKey = this.getApiKey();
    const model = options.model || this.getDefaultModel();

    const payload: Record<string, unknown> = {
      model,
      messages: [{ role: "user", content: options.prompt }],
      temperature: options.options?.temperature ?? 0.2,
      top_p: options.options?.top_p ?? 0.9,
      max_tokens: options.options?.num_predict ?? 400,
    };

    if (options.format === "json") {
      payload.response_format = { type: "json_object" };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new LlmServiceError("OpenAI authentication failed", 401);
      }
      if (response.status === 429) {
        throw new LlmServiceError("OpenAI rate limit exceeded", 429);
      }
      if (response.status >= 500) {
        throw new LlmServiceError("OpenAI service unavailable", 503);
      }
      const errorData = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new LlmServiceError(
        errorData?.error?.message || "OpenAI request failed",
        response.status,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      model?: string;
      created?: number;
    };

    const content = data.choices?.[0]?.message?.content?.trim() ?? "";

    return {
      response: content,
      model: data.model,
      done: true,
    };
  }
}

export default new LlmService();
export { LlmService };
