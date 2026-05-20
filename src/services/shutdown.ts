let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function beginShutdown(): void {
  shuttingDown = true;
}

export function resetShutdownStateForTests(): void {
  shuttingDown = false;
  drainHandlers.length = 0;
}

type DrainHandler = () => Promise<void>;

const drainHandlers: DrainHandler[] = [];

export function registerDrainHandler(handler: DrainHandler): void {
  drainHandlers.push(handler);
}

export async function runDrainHandlers(timeoutMs: number): Promise<void> {
  if (drainHandlers.length === 0) return;

  await Promise.race([
    Promise.all(drainHandlers.map((handler) => handler())),
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeoutMs);
    }),
  ]);
}
