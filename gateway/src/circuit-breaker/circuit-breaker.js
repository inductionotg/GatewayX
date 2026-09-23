export class CircuitBreaker {
  constructor({ name, failureThreshold = 3, resetTimeoutMs = 10000,
    now = () => performance.now(), onTransition = () => {} }) {
    for (const value of [failureThreshold, resetTimeoutMs]) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error("Circuit breaker settings must be positive integers");
      }
    }
    this.name = name;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.now = now;
    this.onTransition = onTransition;
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.nextAttemptAt = 0;
    this.generation = 0;
  }

  transition(state) {
    const previous = this.state;
    this.state = state;
    this.generation += 1;
    this.onTransition({ instance: this.name, from: previous, to: state });
  }

  // Permission is reserved synchronously, before the caller starts any I/O.
  tryAcquire() {
    if (this.state === "HALF_OPEN") return null;
    if (this.state === "OPEN") {
      if (this.now() < this.nextAttemptAt) return null;
      this.transition("HALF_OPEN");
    }

    const generation = this.generation;
    let settled = false;
    const complete = (healthy) => {
      if (settled) return;
      settled = true;
      // Calls admitted before a transition cannot overwrite the new state.
      if (generation !== this.generation) return;

      if (healthy) {
        this.consecutiveFailures = 0;
        if (this.state === "HALF_OPEN") this.transition("CLOSED");
      } else {
        this.consecutiveFailures += 1;
        if (this.state === "HALF_OPEN" ||
            this.consecutiveFailures >= this.failureThreshold) {
          this.nextAttemptAt = this.now() + this.resetTimeoutMs;
          this.transition("OPEN");
        }
      }
    };

    return {
      success: () => complete(true),
      failure: () => complete(false),
    };
  }

  snapshot() {
    return {
      instance: this.name,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      probeInFlight: this.state === "HALF_OPEN",
      retryAfterMs: this.state === "OPEN"
        ? Math.max(0, Math.ceil(this.nextAttemptAt - this.now())) : 0,
    };
  }
}
