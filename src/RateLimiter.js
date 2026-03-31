/**
 * RateLimiter class that enforces delay between requests and limits concurrency
 * 
 * Requirements:
 * - 3.1: Enforce delay between consecutive requests
 * - 3.3: Limit concurrent requests
 */
export class RateLimiter {
  /**
   * Create a RateLimiter instance
   * @param {number} requestsPerSecond - Number of requests allowed per second (default: 1)
   * @param {number} maxConcurrent - Maximum number of concurrent requests (default: 1)
   */
  constructor(requestsPerSecond = 1, maxConcurrent = 1) {
    this.delayMs = 1000 / requestsPerSecond;
    this.maxConcurrent = maxConcurrent;
    this.lastRequestTime = 0;
    this.activeRequests = 0;
    this.queue = [];
  }

  /**
   * Execute a function with rate limiting applied
   * @param {Function} fn - Async function to execute
   * @returns {Promise} - Result of the function execution
   */
  async execute(fn) {
    // Wait if we're at max concurrency
    if (this.activeRequests >= this.maxConcurrent) {
      await this._waitForSlot();
    }

    // Enforce delay between requests
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.delayMs) {
      const waitTime = this.delayMs - timeSinceLastRequest;
      await this._sleep(waitTime);
    }

    // Update tracking
    this.lastRequestTime = Date.now();
    this.activeRequests++;

    try {
      const result = await fn();
      return result;
    } finally {
      this.activeRequests--;
      this._processQueue();
    }
  }

  /**
   * Wait for an available slot when at max concurrency
   * @private
   */
  async _waitForSlot() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Process the next item in the queue
   * @private
   */
  _processQueue() {
    if (this.queue.length > 0 && this.activeRequests < this.maxConcurrent) {
      const resolve = this.queue.shift();
      resolve();
    }
  }

  /**
   * Sleep for a specified duration
   * @param {number} ms - Milliseconds to sleep
   * @private
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
