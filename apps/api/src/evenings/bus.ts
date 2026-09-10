import { EventEmitter } from "node:events";

class EveningEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Large groups or multiple tabs might register several listeners per evening
    this.emitter.setMaxListeners(200);
  }

  emitUpdate(eveningId: string, reason?: string): void {
    this.emitter.emit(`update:${eveningId}`, { eveningId, reason });
  }

  onUpdate(eveningId: string, listener: (data: { eveningId: string; reason?: string }) => void): () => void {
    const eventName = `update:${eveningId}`;
    this.emitter.on(eventName, listener);
    return () => {
      this.emitter.off(eventName, listener);
    };
  }
}

export const eveningBus = new EveningEventBus();
