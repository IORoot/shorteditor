export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpClient {
  private readonly fetchImpl: FetchLike;

  constructor(fetchImpl: FetchLike = (input, init) => fetch(input, init)) {
    this.fetchImpl = fetchImpl;
  }

  protected send<T>(url: string, method: string, body: unknown): Promise<T> {
    return this.request<T>(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  protected async request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(url, init);
    if (!response.ok) {
      throw new ApiError(response.status, await this.errorMessage(response, url));
    }
    return (await response.json()) as T;
  }

  /** DELETE where the backend answers 204 with no body, so this doesn't parse JSON. */
  protected async remove(url: string): Promise<void> {
    const response = await this.fetchImpl(url, { method: 'DELETE' });
    if (!response.ok) {
      throw new ApiError(response.status, await this.errorMessage(response, url));
    }
  }

  private async errorMessage(response: Response, url: string): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === 'string') return body.detail;
      // FastAPI describes a badly shaped request as a list of problems
      if (Array.isArray(body.detail)) {
        const first = body.detail.find((item): item is { msg: string } => typeof item?.msg === 'string');
        if (first) return `The request was not accepted: ${first.msg}`;
      }
    } catch {
      // fall through to the generic message
    }
    return `Request to ${url} failed with ${response.status}`;
  }
}
