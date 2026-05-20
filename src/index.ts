import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { initSentry } from "./lib/sentry.js";
import { drainJobQueue } from "./services/job-queue.js";
import { closeScanner, initScanner } from "./services/scanner.js";
import {
  beginShutdown,
  isShuttingDown,
  registerDrainHandler,
  runDrainHandlers,
} from "./services/shutdown.js";

initSentry();
initScanner(config);

registerDrainHandler(async () => {
  await drainJobQueue();
});

const app = createApp(config);

const server = app.listen(config.port, config.host, () => {
  logger.info(
    { host: config.host, port: config.port },
    "Scanner worker listening"
  );
});

let shutdownPromise: Promise<void> | null = null;

async function shutdown(signal: string): Promise<void> {
  if (shutdownPromise) return shutdownPromise;

  shutdownPromise = (async () => {
    if (isShuttingDown()) return;
    beginShutdown();

    logger.info(
      { signal, drainMs: config.shutdownDrainMs },
      "Shutting down — draining in-flight scans"
    );

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    await runDrainHandlers(config.shutdownDrainMs);
    await closeScanner();

    logger.info("Shutdown complete");
    process.exit(0);
  })();

  return shutdownPromise;
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
