export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly request: string,
  ) {
    super(message);
    this.name = 'QlooError';
  }
}

/** Live calls are off and the request isn't cached. */
export class QlooOfflineError extends QlooError {
  constructor(request: string) {
    super(
      `Qloo live calls are off and this request isn't cached: ${request}. ` +
        'Set QLOO_LIVE=1 to allow live calls, or seed the cache.',
      0,
      request,
    );
    this.name = 'QlooOfflineError';
  }
}

/** A daily cap or the monthly reserve would be exceeded. */
export class QlooBudgetError extends QlooError {
  constructor(message: string, request: string) {
    super(message, 0, request);
    this.name = 'QlooBudgetError';
  }
}
