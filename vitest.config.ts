import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "server-only": new URL("./src/test/server-only.ts", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        // Match Spotify OAuth cookie host so localhost→127.0.0.1 redirects stay idle in tests.
        url: "http://127.0.0.1:3000/",
      },
    },
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
  },
});
