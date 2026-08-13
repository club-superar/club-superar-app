export type QRCode = {
  addData(data: string, mode?: "Numeric" | "Alphanumeric" | "Byte" | "Kanji"): void;
  make(): void;
  createSvgTag(options?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
};

export function qrcode(typeNumber: 0 | number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QRCode;
