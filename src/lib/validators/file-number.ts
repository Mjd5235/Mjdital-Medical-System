const FILE_NUMBER_PATTERN = /^MC-\d{4}-\d{4}$/;

export function isValidFileNumber(fileNumber: string): boolean {
  return FILE_NUMBER_PATTERN.test(fileNumber);
}

export function buildFileNumber(year: number, sequence: number): string {
  const padded = String(sequence).padStart(4, "0");
  return `MC-${year}-${padded}`;
}
