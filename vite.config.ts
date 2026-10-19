import { defineConfig } from "vitest/config"

export default defineConfig({
  build: {
    outDir: "build",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: "options.html",
        enable: "enable.html",
      },
    },
  },
  test: {
    environment: "happy-dom",
    include: ["test/**/*.test.ts"],
  },
})
