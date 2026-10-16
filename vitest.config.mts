import { defineConfig } from "vitest/config";
import { config as loadEnv } from "dotenv";
import path from "node:path";

loadEnv({ path: ".env.local" });

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
