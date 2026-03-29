import type { Express, Request, Response } from "express";
import path from "path";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

export const buildSwaggerSpec = () => {
  const serverUrl = process.env.SWAGGER_SERVER_URL || "/";
  const apis = [
    path.join(process.cwd(), "src", "routes", "*.ts"),
    path.join(__dirname, "routes", "*.js"),
  ];

  return swaggerJSDoc({
    definition: {
      openapi: "3.0.3",
      info: {
        title: "Mingo API",
        version: "1.0.0",
        description: "OpenAPI documentation for the Mingo backend.",
      },
      servers: [
        {
          url: serverUrl,
          description: "Current server",
        },
      ],
      tags: [
        { name: "Auth", description: "Authentication and token lifecycle" },
        { name: "Users", description: "User management endpoints" },
        { name: "Meetings", description: "Meeting CRUD and analytics" },
        { name: "Tasks", description: "Meeting and user task endpoints" },
        { name: "Transcripts", description: "Transcript retrieval and creation" },
        { name: "Mingo Agent", description: "Meeting assistant endpoints" },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
        schemas: {
          ErrorResponse: {
            type: "object",
            properties: {
              message: { type: "string", example: "Unauthorized" },
              error: { type: "string", example: "Meeting ID is required" },
            },
          },
          MessageResponse: {
            type: "object",
            properties: {
              message: { type: "string", example: "Operation completed successfully" },
            },
            required: ["message"],
          },
          User: {
            type: "object",
            properties: {
              _id: { type: "string", example: "67e11a2b9fc13e17d8b9bb11" },
              username: { type: "string", example: "johndoe" },
              email: { type: "string", example: "john@example.com" },
              profilePicture: {
                type: "string",
                nullable: true,
                example: "http://localhost:3000/api/upload/avatar.png",
              },
              githubId: {
                type: "string",
                nullable: true,
                example: "1234567",
              },
            },
            required: ["_id", "username", "email"],
          },
          AuthTokens: {
            type: "object",
            properties: {
              token: { type: "string", example: "jwt-access-token" },
              refreshToken: { type: "string", example: "jwt-refresh-token" },
            },
            required: ["token", "refreshToken"],
          },
          AuthResponse: {
            allOf: [
              { $ref: "#/components/schemas/AuthTokens" },
              {
                type: "object",
                properties: {
                  user: { $ref: "#/components/schemas/User" },
                },
                required: ["user"],
              },
            ],
          },
          RegisterRequest: {
            type: "object",
            properties: {
              username: { type: "string", example: "johndoe" },
              email: { type: "string", example: "john@example.com" },
              password: { type: "string", example: "Pass1234!" },
            },
            required: ["username", "email", "password"],
          },
          LoginRequest: {
            type: "object",
            properties: {
              username: { type: "string", example: "johndoe" },
              password: { type: "string", example: "Pass1234!" },
            },
            required: ["username", "password"],
          },
          RefreshTokenRequest: {
            type: "object",
            properties: {
              refreshToken: { type: "string", example: "jwt-refresh-token" },
            },
            required: ["refreshToken"],
          },
          GitHubLoginRequest: {
            type: "object",
            properties: {
              code: { type: "string", example: "github-oauth-code" },
            },
            required: ["code"],
          },
          GoogleLoginRequest: {
            type: "object",
            properties: {
              credential: {
                type: "string",
                description: "Google ID token received from Google Sign-In",
                example: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
              },
            },
            required: ["credential"],
          },
          GoogleAuthResponse: {
            allOf: [{ $ref: "#/components/schemas/AuthResponse" }],
          },
          UserWriteRequest: {
            type: "object",
            properties: {
              username: { type: "string", example: "newuser" },
              email: { type: "string", example: "newuser@example.com" },
              password: { type: "string", example: "Pass1234!" },
              profilePicture: {
                type: "string",
                example: "http://localhost:3000/api/upload/avatar.png",
              },
              removeProfilePicture: {
                oneOf: [{ type: "boolean" }, { type: "string", enum: ["true", "false"] }],
                example: false,
              },
              githubId: { type: "string", example: "1234567" },
              file: { type: "string", format: "binary" },
            },
          },
          Meeting: {
            type: "object",
            properties: {
              _id: { type: "string", example: "67e11a2b9fc13e17d8b9bb22" },
              title: { type: "string", example: "Sprint Planning" },
              date: {
                type: "string",
                format: "date-time",
                example: "2026-03-22T09:00:00.000Z",
              },
              duration: { type: "number", nullable: true, example: 45 },
              organizerId: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb11",
              },
              participants: {
                type: "array",
                items: { type: "string" },
              },
              transcriptId: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb33",
              },
              topics: {
                type: "array",
                items: { type: "string" },
              },
              tasks: {
                type: "array",
                items: { type: "string" },
              },
              mingoAgentId: {
                type: "string",
                nullable: true,
                example: "67e11a2b9fc13e17d8b9bb55",
              },
            },
            required: [
              "_id",
              "title",
              "date",
              "organizerId",
              "participants",
              "transcriptId",
            ],
          },
          MeetingWriteRequest: {
            type: "object",
            properties: {
              title: { type: "string", example: "Sprint Planning" },
              date: {
                type: "string",
                format: "date-time",
                example: "2026-03-22T09:00:00.000Z",
              },
              duration: { type: "number", example: 45 },
              organizerId: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb11",
              },
              participants: {
                type: "array",
                items: { type: "string" },
              },
              transcriptId: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb33",
              },
              topics: {
                type: "array",
                items: { type: "string" },
              },
              tasks: {
                type: "array",
                items: { type: "string" },
              },
              mingoAgentId: { type: "string" },
            },
            required: ["title", "organizerId", "participants", "transcriptId"],
          },
          Task: {
            type: "object",
            properties: {
              _id: { type: "string", example: "67e11a2b9fc13e17d8b9bb44" },
              gitHubIssueId: { type: "number", example: 123 },
              gitHubRepoName: { type: "string", example: "mingo-backend" },
              gitHubRepoOwner: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb11",
              },
            },
            required: ["_id", "gitHubIssueId", "gitHubRepoName", "gitHubRepoOwner"],
          },
          TaskWriteRequest: {
            type: "object",
            properties: {
              gitHubIssueId: { type: "number", example: 123 },
              gitHubRepoName: { type: "string", example: "mingo-backend" },
              gitHubRepoOwner: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb11",
              },
            },
            required: ["gitHubIssueId", "gitHubRepoName", "gitHubRepoOwner"],
          },
          Transcript: {
            type: "object",
            properties: {
              _id: { type: "string", example: "67e11a2b9fc13e17d8b9bb33" },
              meetingID: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb22",
              },
              date: {
                type: "string",
                format: "date-time",
                example: "2026-03-22T09:00:00.000Z",
              },
              content: {
                type: "string",
                example: "Transcript text from the meeting.",
              },
            },
            required: ["_id", "meetingID", "date", "content"],
          },
          TranscriptTextRequest: {
            type: "object",
            properties: {
              title: { type: "string", example: "Sprint Planning" },
              date: {
                type: "string",
                format: "date-time",
                example: "2026-03-22T09:00:00.000Z",
              },
              content: {
                type: "string",
                example: "Meeting notes and transcript text.",
              },
            },
            required: ["content"],
          },
          TranscriptCreateResponse: {
            type: "object",
            properties: {
              meeting: { $ref: "#/components/schemas/Meeting" },
              transcript: { $ref: "#/components/schemas/Transcript" },
              transcription: {
                type: "string",
                example: "Meeting notes and transcript text.",
              },
              text: {
                type: "string",
                example: "Meeting notes and transcript text.",
              },
            },
            required: ["meeting", "transcript", "transcription", "text"],
          },
          MingoAgentMessage: {
            type: "object",
            properties: {
              sender: {
                type: "string",
                enum: ["user", "mingo"],
                example: "user",
              },
              content: { type: "string", example: "Summarize the meeting." },
              timestamp: {
                type: "string",
                format: "date-time",
                example: "2026-03-22T09:15:00.000Z",
              },
            },
            required: ["sender", "content", "timestamp"],
          },
          MingoAgentChat: {
            type: "object",
            properties: {
              _id: { type: "string", example: "67e11a2b9fc13e17d8b9bb55" },
              meetingID: {
                type: "string",
                example: "67e11a2b9fc13e17d8b9bb22",
              },
              date: {
                type: "string",
                format: "date-time",
                example: "2026-03-22T09:00:00.000Z",
              },
              messages: {
                type: "array",
                items: { $ref: "#/components/schemas/MingoAgentMessage" },
              },
            },
            required: ["_id", "meetingID", "date", "messages"],
          },
          GenerateReplyRequest: {
            type: "object",
            properties: {
              message: { type: "string", example: "What were the action items?" },
            },
            required: ["message"],
          },
          GenerateReplyResponse: {
            type: "object",
            properties: {
              reply: {
                type: "string",
                example: "The action items were to prepare the demo and update the API docs.",
              },
            },
            required: ["reply"],
          },
          GenerateSummaryResponse: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                example: "The team reviewed roadmap priorities and agreed on next steps.",
              },
            },
            required: ["summary"],
          },
          TopicItem: {
            type: "object",
            properties: {
              title: { type: "string", example: "Roadmap" },
              description: {
                type: "string",
                example: "Discussion related to roadmap priorities.",
              },
            },
            required: ["title", "description"],
          },
          GenerateTopicsResponse: {
            type: "object",
            properties: {
              topics: {
                type: "array",
                items: { $ref: "#/components/schemas/TopicItem" },
              },
            },
            required: ["topics"],
          },
          AverageDurationResponse: {
            type: "object",
            properties: {
              averageDuration: { type: "number", example: 52.5 },
            },
            required: ["averageDuration"],
          },
        },
      },
    },
    apis,
  });
};

const customCss = `
  :root {
    --bg: #08111a;
    --panel: #101c28;
    --text: #e2e8f0;
    --accent: #22c55e;
    --accent-strong: #16a34a;
  }
  body {
    background: linear-gradient(180deg, #08111a 0%, #0f1e2d 100%);
  }
  .swagger-ui {
    color: var(--text);
  }
  .swagger-ui .topbar {
    background: #061018;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .swagger-ui .topbar .download-url-wrapper input[type="text"] {
    border-radius: 8px;
  }
  .swagger-ui .topbar .download-url-wrapper .download-url-button {
    border-radius: 8px;
  }
  .swagger-ui .info .title,
  .swagger-ui .info .description,
  .swagger-ui .opblock-tag,
  .swagger-ui .opblock-description-wrapper p,
  .swagger-ui .response-col_status,
  .swagger-ui .response-col_description,
  .swagger-ui .parameter__name,
  .swagger-ui .parameter__type,
  .swagger-ui .tab li button.tablinks,
  .swagger-ui label,
  .swagger-ui .model-title,
  .swagger-ui .prop-type,
  .swagger-ui .prop-name,
  .swagger-ui .markdown p,
  .swagger-ui .scheme-container,
  .swagger-ui section.models h4,
  .swagger-ui .responses-inner h4,
  .swagger-ui .responses-inner h5 {
    color: var(--text);
  }
  .swagger-ui .scheme-container,
  .swagger-ui .opblock,
  .swagger-ui .model-box {
    background: rgba(16, 28, 40, 0.9);
    border-radius: 12px;
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: none;
  }
  .swagger-ui .btn {
    background: var(--accent);
    border-color: var(--accent);
    border-radius: 8px;
  }
  .swagger-ui .btn.authorize {
    background: var(--accent-strong);
    border-color: var(--accent-strong);
  }
  .swagger-ui select,
  .swagger-ui input,
  .swagger-ui textarea {
    background: #0b1224;
    color: var(--text);
    border-radius: 8px;
    border: 1px solid rgba(148, 163, 184, 0.3);
  }
`;

const uiOptions = {
  customSiteTitle: "Mingo API Docs",
  customCss,
  swaggerOptions: {
    docExpansion: "none" as const,
    defaultModelsExpandDepth: -1,
    persistAuthorization: true,
    displayRequestDuration: true,
  },
};

export const setupSwagger = (app: Express) => {
  const spec = buildSwaggerSpec();

  app.get("/api-docs.json", (_req: Request, res: Response) => {
    res.setHeader("Content-Type", "application/json");
    res.status(200).send(spec);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(spec, uiOptions));
};
