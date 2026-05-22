/**
 * Process-internal typed EventBus (ADR-002).
 *
 * Lightweight pub/sub — no external MQ dependency.
 * emit() never blocks the caller: listeners are invoked asynchronously
 * and errors are caught + logged rather than propagated.
 */

/** Event names supported by the EventBus. */
export type EventName = 'transaction_built';

/** Payload for each event type. */
export interface EventPayloads {
  transaction_built: import('../types/models').Transaction;
}

/** Handler function signature. */
export type EventHandler<E extends EventName> = (payload: EventPayloads[E]) => void | Promise<void>;

type HandlerEntry<E extends EventName> = {
  handler: EventHandler<E>;
  once: boolean;
};

class EventBusImpl {
  private listeners = new Map<EventName, HandlerEntry<EventName>[]>();

  /**
   * Register a handler for an event. Returns an unsubscribe function.
   */
  on<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    const entries = this.listeners.get(event) ?? [];
    const entry: HandlerEntry<E> = { handler, once: false };
    entries.push(entry as HandlerEntry<EventName>);
    this.listeners.set(event, entries);
    return () => this.off(event, handler);
  }

  /**
   * Register a one-shot handler. Removed after first invocation.
   */
  once<E extends EventName>(event: E, handler: EventHandler<E>): () => void {
    const entries = this.listeners.get(event) ?? [];
    const entry: HandlerEntry<E> = { handler, once: true };
    entries.push(entry as HandlerEntry<EventName>);
    this.listeners.set(event, entries);
    return () => this.off(event, handler);
  }

  /**
   * Remove a handler.
   */
  off<E extends EventName>(event: E, handler: EventHandler<E>): void {
    const entries = this.listeners.get(event);
    if (!entries) return;
    const idx = entries.findIndex((e) => e.handler === handler);
    if (idx !== -1) entries.splice(idx, 1);
  }

  /**
   * Emit an event. Non-blocking — listeners are invoked via setTimeout(..., 0).
   * Listener errors are caught and logged; they never propagate to the caller.
   */
  emit<E extends EventName>(event: E, payload: EventPayloads[E]): void {
    const entries = this.listeners.get(event);
    if (!entries || entries.length === 0) return;

    // Snapshot the current listeners so removals during iteration don't cause issues
    const snapshot = [...entries];

    // Remove once-handlers before firing
    for (const entry of snapshot) {
      if (entry.once) {
        const idx = entries.indexOf(entry);
        if (idx !== -1) entries.splice(idx, 1);
      }
    }

    // Fire all handlers asynchronously — never block the emitter
    for (const entry of snapshot) {
      setTimeout(() => {
        try {
          const result = entry.handler(payload as EventPayloads[E]);
          // If handler returns a promise, catch rejections
          if (result instanceof Promise) {
            result.catch((err: unknown) => {
              console.error(`[EventBus] handler for "${event}" rejected:`, err);
            });
          }
        } catch (err) {
          console.error(`[EventBus] handler for "${event}" threw:`, err);
        }
      }, 0);
    }
  }

  /**
   * Remove all listeners for an event, or all listeners entirely.
   */
  clear(event?: EventName): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/** Singleton EventBus instance. */
export const eventBus = new EventBusImpl();
