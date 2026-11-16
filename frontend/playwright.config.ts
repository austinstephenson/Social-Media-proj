import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://localhost:5174", channel: "chrome", trace: "retain-on-failure" },
  webServer: [
    {
      command: process.platform === "win32"
        ? "..\\backend\\.venv\\Scripts\\python.exe e2e_server.py"
        : ".venv/bin/python e2e_server.py",
      cwd: "../backend",
      url: "http://127.0.0.1:8765/docs",
      reuseExistingServer: false,
    },
    {
      command: "npm run dev -- --port 5174",
      url: "http://localhost:5174",
      env: { VITE_API_URL: "http://127.0.0.1:8765" },
      reuseExistingServer: false,
    },
  ],
});
