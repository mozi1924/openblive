import { createServer } from "vite";

const server = await createServer({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
});

let closing = false;

const shutdown = async (signal) => {
  if (closing) {
    return;
  }
  closing = true;

  try {
    await server.close();
  } finally {
    process.exit(signal ? 0 : 1);
  }
};

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  await server.listen();
  server.printUrls();
} catch (error) {
  console.error(error);
  await shutdown();
}
