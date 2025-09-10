export class Logger {
  /**
   * Logs an event to the DOM by creating a new span element with the event name and parameters.
   * The log entry includes a timestamp and is prepended to the element with the ID 'logger'.
   *
   * @param name - The name of the event to log.
   * @param params - Optional parameters associated with the event, which will be serialized to JSON.
   */
  static log(name: string, params: any = {}) {
    const span = document.createElement('span');
    span.innerHTML = `<strong>${(new Date).toISOString()} ${name}</strong>: ${JSON.stringify(params)}<br>`;
    const logElmt = document.getElementById('logger');
    logElmt?.prepend(span);
  }

  /**
   * Resets the logger to the initial state.
   */
  static clear() {
    document.getElementById('logger')!.innerHTML = 'Application logger: ready';
  }
}
