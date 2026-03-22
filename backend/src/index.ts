import express, { Express } from "express";
import mongoose from "mongoose";
import meetingsRoute from "./routes/meetingsRoute";
import mingoAgentRoute from "./routes/mingoAgentRoute";
import transcriptRoute from "./routes/transcriptRoute";
import authRoute from "./routes/authRoute";
import usersRoute from "./routes/usersRoute";
import tasksRoute from "./routes/tasksRoute";

import { setupSwagger } from "./swagger";
import path from "path";

const app = express();
app.use(express.json());
setupSwagger(app);

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "*");
  res.header("Access-Control-Allow-Headers", "*");
  next();
});

// // API routes
app.use("/api/meetings", meetingsRoute);
app.use("/api", mingoAgentRoute);
app.use("/api", transcriptRoute);
app.use("/api", tasksRoute);

// app.use("/api/comment", commentsRoute);
// app.use("/api/like", likesRoute);
app.use("/api/auth", authRoute);
app.use("/api/user", usersRoute);

app.use("/api/upload", express.static("public/uploads"));
// app.use("/api/upload", multerRoute);

// Serve React static files
//const distPath = path.resolve(__dirname, "../../client/dist");

const distPath = path.resolve(__dirname, "../../../client/dist");

app.use(express.static(distPath));

app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

const initApp = () => {
  const pr = new Promise<Express>((resolve, reject) => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      reject("DATABASE_URL is undefined");
      return;
    }
    const mongoTimeoutMs = Number(
      process.env.MONGO_CONNECT_TIMEOUT_MS || "5000",
    );
    mongoose
      .connect(dbUrl, {
        connectTimeoutMS: mongoTimeoutMs,
        serverSelectionTimeoutMS: mongoTimeoutMs,
      })
      .then(() => {
        resolve(app);
      })
      .catch((error) => {
        reject(
          new Error(
            `Failed to connect to MongoDB within ${mongoTimeoutMs}ms. ` +
              `Check DATABASE_URL and that MongoDB is reachable. ` +
              `Original error: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      });

    const db = mongoose.connection;
    db.on("error", (error) => console.error("Mongo connection error:", error));
    db.once("open", () => console.log("Connected to Database"));
  });
  return pr;
};

export default initApp;
