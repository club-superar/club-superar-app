declare module "@/lib/qr/qr-scanner.min.js" {
  export default class QrScanner {
    constructor(video: HTMLVideoElement, onDecode: (result: { data: string }) => void, options?: Record<string, unknown>);
    start(): Promise<void>;
    stop(): void;
    destroy(): void;
  }
}
