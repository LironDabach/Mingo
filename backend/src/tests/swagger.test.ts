/// <reference types="jest" />

import { buildSwaggerSpec } from "../swagger";

describe("Swagger docs", () => {
  test("builds the OpenAPI document with project routes", () => {
    const spec = buildSwaggerSpec() as {
      openapi: string;
      info: { title: string };
      paths: Record<string, unknown>;
    };

    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("Mingo API");
    expect(spec.paths["/api/auth/register"]).toBeDefined();
    expect(spec.paths["/api/meetings/{meetingId}/mingoAgent/generateReply"]).toBeDefined();
  });
});
