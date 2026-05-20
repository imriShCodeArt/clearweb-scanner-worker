import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { closeScanner } from "./services/scanner.js";

const app = createApp(config);

const server = app.listen(config.port, config.host, () => {
  logger.info(
    { host: config.host, port: config.port },
    "Scanner worker listening"
  );
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down");

  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });

  await closeScanner();
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
