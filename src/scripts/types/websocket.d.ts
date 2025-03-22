declare module 'websocket' {
  export class client {
    on(event: string, callback: (data: any) => void): void;
    connect(url: string): void;
  }

  export class connection {
    close(): void;
    sendUTF(data: string): void;
    on(event: string, callback: (data: any) => void): void;
  }
} 