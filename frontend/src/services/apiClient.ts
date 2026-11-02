// Shared, production-hardened API client with timeout, abort, and error classification.
// Never logs passwords, OTPs, or bearer tokens.

export class ApiError extends Error {
  readonly status: number;
  readonly isNetworkError: boolean;
  readonly isTimeout: boolean;
  readonly isAuthError: boolean;
  readonly data: unknown;

  constructor(opts: {
    message: string;
    status: number;
    isNetworkError?: boolean;
    isTimeout?: boolean;
    data?: unknown;
  }) {
    super(opts.message);
    this.name = "ApiError";
    this.status = opts.status;
    this.isNetworkError = opts.isNetworkError ?? false;
    this.isTimeout = opts.isTimeout ?? false;
    this.isAuthError = opts.status === 401;
    this.data = opts.data;
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: object;
  token?: string | null;
  timeoutMs?: number;
  signal?: AbortSignal;
  retries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
}

const DEFAULT_TIMEOUT_MS = 10000;

function getBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_BACKEND_URL;
  if (!url) {
    throw new ApiError({
      message: "Backend URL is missing. Check your environment configuration.",
      status: 0,
      isNetworkError: false,
    });
  }
  return url.replace(/\/$/, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an HTTP request with timeout, structured error handling, and optional
 * retry for idempotent operations. Non-idempotent operations (POST/PATCH/DELETE)
 * are NEVER retried automatically.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const method = options.method ?? (options.body !== undefined ? "POST" : "GET");
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = getBaseUrl();
  const url = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  // Only GET requests default to retrying transient failures
  const maxRetries = options.retries ?? (method === "GET" ? 1 : 0);
  const baseDelay = options.retryDelayMs ?? 400;

  let attempt = 0;
  while (true) {
    attempt += 1;
    const controller = new AbortController();
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    if (typeof (timer as unknown as { unref?: () => void })?.unref === "function") {
      (timer as unknown as { unref: () => void }).unref();
    }

    // Combine user signal and timeout signal
    const onExternalAbort = () => controller.abort();
    if (options.signal) {
      options.signal.addEventListener("abort", onExternalAbort);
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }

    try {
      const res = await fetch(url, {
        method,
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener("abort", onExternalAbort);
      }

      const raw = await res.text();
      let data: unknown = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { message: raw };
      }

      if (!res.ok) {
        const payload = data as { detail?: unknown; message?: unknown; error?: unknown } | null;
        const msg =
          typeof payload?.detail === "string"
            ? payload.detail
            : typeof payload?.message === "string"
              ? payload.message
              : typeof payload?.error === "string"
                ? payload.error
                : `Request failed with status ${res.status}`;

        throw new ApiError({
          message: msg,
          status: res.status,
          data,
        });
      }

      return data as T;
    } catch (error) {
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener("abort", onExternalAbort);
      }

      const isTimeout = timedOut;
      const isAbort = !timedOut && options.signal?.aborted;
      const isNet =
        error instanceof TypeError ||
        isTimeout ||
        (error instanceof Error && error.message.toLowerCase().includes("network"));

      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError({
              message: isTimeout
                ? "Request timed out — server took too long to respond."
                : isAbort
                  ? "Request was cancelled."
                  : "Unable to connect to backend. Check your network connection.",
              status: 0,
              isNetworkError: isNet,
              isTimeout,
            });

      // Retry only idempotent GET requests on transient network or timeout failures
      const canRetry = method === "GET" && attempt <= maxRetries && (apiError.isNetworkError || apiError.isTimeout);
      if (canRetry) {
        const jitter = Math.random() * 200;
        await delay(baseDelay * Math.pow(2, attempt - 1) + jitter);
        continue;
      }

      throw apiError;
    }
  }
}
