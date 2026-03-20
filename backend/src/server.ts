import initApp from "./index";
import http from "http";
import https from "https";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const port = process.env.PORT;
const httpsPort = process.env.HTTPS_PORT;

initApp()
  .then((app) => {
    if (process.env.NODE_ENV !== "production") {
      console.log("Development Environment");
      http.createServer(app).listen(port, () => {
        console.log(`Listening at http://localhost:${port}`);
      });
      return;
    }

    // console.log("Production Environment");

    // const httpsOptions = {
    //   key: fs.readFileSync("../client-key.pem"),
    //   cert: fs.readFileSync("../client-cert.pem"),
    // };

    // https.createServer(httpsOptions, app).listen(httpsPort, () => {
    //   console.log(`Listening on HTTPS port ${httpsPort}`);
    // });
  })
  .catch((error) => {
    console.error("Failed to initialize app:", error);
    process.exit(1);
  });