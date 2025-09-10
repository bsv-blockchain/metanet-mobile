import { Logger } from './logger';

export interface EventData {
  name: string;
  params: any;
}

export class EventManager {
  listeners: { [key: string]: any[] } = {};

  constructor() {
    // Listen to EventManager events
    this.listen('clearLog', this);
  }

  /**
   * Clears the log.
   */
  clearLog() {
    Logger.clear();
  }

  /**
   * Process an event on all registered listeners.
   * @param method Method name that must match the key on the listener object.
   * @param params Optional parameters to be passed to the listener.
   */
  process(method: string, params: any = {}) {
    if (this.listeners[method]) {
      this.listeners[method].forEach((listener: any) => {
        const fn = listener[method];
        if (typeof fn === 'function') {
          Logger.log('Start process', { method, params });
          const result = fn.call(listener, params);
          Logger.log('Result process', { result });
          this.send(`${method}.callback`, result);
        } else {
          Logger.log('Error process', { method });
        }
      });
    } else {
      Logger.log('Event not found', { method });
    }
  }

  /**
   * Process an event received by the EventManager.
   * @param data event data from event source
   */
  receive(data: EventData) {
    Logger.log('Receive event', data);
    this.process(data.name, data.params);
  }

  /**
   * Send an event to the main thread of the WebView.
   * The event name is modified by appending ".callback".
   * The event is sent as a JSON string.
   * @param event event name
   * @param results event results
   */
  send(event: string, results: any = null) {
    const payload = { name: `${event}`, results };
    Logger.log('Sending event', payload);

    window.ReactNativeWebView?.postMessage(JSON.stringify(payload));
  }

  /**
   * Registers a listener for the specified event.
   * @param event event name
   * @param object listener object
   */
  listen(event: string, object: any) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }

    this.listeners[event].push(object);
  }
}
