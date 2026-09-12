interface Pending<T> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/** Correlates request IDs with their eventual responses, with timeouts. */
export class PendingRequests<T> {
  private readonly pending = new Map<string, Pending<T>>();

  create(requestId: string, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
    });
  }

  /** Returns false when no request with this ID is waiting (late or unknown response). */
  resolve(requestId: string, value: T): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(requestId);
    entry.resolve(value);
    return true;
  }

  rejectAll(reason: string): void {
    for (const [requestId, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
      this.pending.delete(requestId);
    }
  }

  get size(): number {
    return this.pending.size;
  }
}
