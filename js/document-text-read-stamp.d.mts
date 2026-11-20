export function validDocumentTextReadStamp(
  value: unknown,
): value is Readonly<{ epoch: string; serial: string }>;

export function sameDocumentTextReadStamp(a: unknown, b: unknown): boolean;
