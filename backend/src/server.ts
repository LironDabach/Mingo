import initApp from "./index";
import http from "http";
import https from "https";
import fs from "fs";
import dotenv from "dotenv";
import path from "path";

const isProduction = process.env.NODE_ENV === "production";
const projectRoot = path.resolve(__dirname, "../..");
const envPath = path.resolve(
  projectRoot,
  isProduction ? ".env.production" : ".env.development",
);

dotenv.config({ path: envPath });

const port = process.env.PORT;
const httpsPort = process.env.HTTPS_PORT;

initApp()
  .then((app) => {
    if (!isProduction) {
      console.log("Development Environment");
      http.createServer(app).listen(port, () => {
        console.log(`Listening at http://localhost:${port}`);
      });
      return;
    }

    console.log("Production Environment");

    const httpsOptions = {
      key: fs.readFileSync("../client-key.pem"),
      cert: fs.readFileSync("../client-cert.pem"),
    };

    https.createServer(httpsOptions, app).listen(httpsPort, () => {
      console.log(`Listening on HTTPS port ${httpsPort}`);
    });
    
  })
  .catch((error) => {
    console.error("Failed to initialize app:", error);
    process.exit(1);
  });
