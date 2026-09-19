/** Scoped to a single device session. A write result never resolves a reply wait. */
export class AncExchange {
  private pending: { accept: (frame: Uint8Array) => boolean; resolve: (frame: Uint8Array) => void; reject: (e: Error) => void } | null = null;

  receive(frame: Uint8Array): void {
    if (this.pending?.accept(frame)) this.pending.resolve(frame);
  }

  cancel(): void { this.pending?.reject(new Error('ANC transaction cancelled — device session changed')); }

  async run(send: () => Promise<void>, accept: (frame: Uint8Array) => boolean, label: string, timeout = 2500): Promise<Uint8Array> {
    if (this.pending) throw new Error('ANC exchange already in progress');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = new Promise<Uint8Array>((resolve, reject) => {
      this.pending = { accept, resolve, reject };
      timer = setTimeout(() => reject(new Error(`${label} timeout — device confirmation unavailable`)), timeout);
    });
    try {
      // Attach rejection handlers to both immediately: a reply can precede TX_SENT.
      const [, reply] = await Promise.all([Promise.resolve().then(send), response]);
      return reply;
    } finally {
      clearTimeout(timer);
      this.pending = null;
    }
  }
}
