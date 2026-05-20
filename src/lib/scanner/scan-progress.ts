export type ScanProgressJson = {
  phase: string;
  percent: number;
  updatedAt: string;
};

type ScanProgressHandler = (
  scanId: string,
  payload: Pick<ScanProgressJson, "phase" | "percent">
) => void;

let progressHandler: ScanProgressHandler | null = null;

export function setScanProgressHandler(
  handler: ScanProgressHandler | null
): void {
  progressHandler = handler;
}

export async function updateScanProgress(
  scanId: string,
  payload: Pick<ScanProgressJson, "phase" | "percent">
): Promise<void> {
  progressHandler?.(scanId, payload);
}
