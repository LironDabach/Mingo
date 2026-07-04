module.exports = {
  apps: [
    {
      name: "mingo-backend",
      script: "dist/server.js",
      cwd: "/home/cs105/Mingo/backend",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
