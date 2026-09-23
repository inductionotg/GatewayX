export class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export class SessionStorageError extends AuthError {
  constructor() {
    super(503, "SESSION_STORE_UNAVAILABLE", "Session storage is temporarily unavailable");
  }
}

export async function redisOperation(operation, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new SessionStorageError()), timeoutMs);
      }),
    ]);
  } catch {
    throw new SessionStorageError();
  } finally { clearTimeout(timer); }
}
