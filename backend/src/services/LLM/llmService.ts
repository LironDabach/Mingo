import http from "http";
import https from "https";

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
  model?: string;
  created_at?: string;
  done?: boolean;
};

class LlmService {
  private getConfig() {
    const baseUrl = process.env.LLM_BASE_URL;
    const user = process.env.LLM_USER;
    const pass = process.env.LLM_PASS;
    const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || "15000");
    const defaultModel = process.env.LLM_MODEL || "llama3.1:8b";

    if (!baseUrl || !user || !pass) {
      throw new LlmServiceError("LLM service credentials are missing", 500);
    }

    return { baseUrl, user, pass, timeoutMs, defaultModel };
  }

  private async postJson(urlString: string, payload: Record<string, unknown>) {
    const { user, pass, timeoutMs } = this.getConfig();
    const encodedCredentials = Buffer.from(`${user}:${pass}`).toString(
      "base64",
    );
    const body = JSON.stringify(payload);
    const url = new URL(urlString);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    return new Promise<{ statusCode: number; data: any }>((resolve, reject) => {
      const req = client.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: "POST",
          headers: {
            Authorization: `Basic ${encodedCredentials}`,
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: timeoutMs,
        },
        (res) => {
          let responseData = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            responseData += chunk;
          });
          res.on("end", () => {
            const statusCode = res.statusCode || 500;
            try {
              const parsed = responseData ? JSON.parse(responseData) : {};
              resolve({ statusCode, data: parsed });
            } catch (error) {
              reject(
                new LlmServiceError(
                  "Invalid JSON response from LLM service",
                  502,
                ),
              );
            }
          });
        },
      );

      req.on("timeout", () => {
        req.destroy(new Error("timeout"));
      });

      req.on("error", (error: Error) => {
        if (error.message === "timeout") {
          reject(new LlmServiceError("LLM service request timed out", 504));
          return;
        }
        reject(new LlmServiceError("Failed to connect to LLM service", 503));
      });

      req.write(body);
      req.end();
    });
  }

  async generate(options: GenerateOptions): Promise<GenerateResponse> {
    const { baseUrl, defaultModel } = this.getConfig();
    const payload = {
      model: options.model || defaultModel,
      prompt: options.prompt,
      stream: options.stream ?? false,
      format: options.format,
      options: options.options || {},
    };

    const { statusCode, data } = await this.postJson(
      `${baseUrl.replace(/\/$/, "")}/api/generate`,
      payload,
    );

    if (statusCode >= 200 && statusCode < 300) {
      return data as GenerateResponse;
    }
    if (statusCode === 401) {
      throw new LlmServiceError("LLM authentication failed", 401);
    }
    if (statusCode === 429) {
      throw new LlmServiceError("LLM rate limit exceeded", 429);
    }
    if (statusCode >= 500) {
      throw new LlmServiceError("LLM service unavailable", 503);
    }

    const errorMessage =
      typeof data?.error === "string" ? data.error : "LLM request failed";
    throw new LlmServiceError(errorMessage, statusCode);
  }
}

export default new LlmService();
export { LlmService };
