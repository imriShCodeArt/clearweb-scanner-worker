/**
 * Hard time budget so scans fail before the host or client gives up.
 */
export class ScanTimeoutError extends Error {
  constructor(budgetMs: number) {
    super(
      `[scan:timeout] Scan exceeded ${budgetMs}ms budget (host may still terminate later)`
    );
    this.name = "ScanTimeoutError";
  }
}

export async function withScanBudget<T>(
  budgetMs: number,
  fn: () => Promise<T>
): Promise<T> {
  let id: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<never>((_, reject) => {
    id = setTimeout(() => {
      reject(new ScanTimeoutError(budgetMs));
    }, budgetMs);
  });

  try {
    return await Promise.race([fn(), budget]);
  } finally {
    if (id !== undefined) clearTimeout(id);
  }
}
