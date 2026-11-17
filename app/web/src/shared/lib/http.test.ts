import { describe, expect, it } from 'vitest';
import { ApiError, HttpClient, type FetchLike } from './http';

class TestClient extends HttpClient {
  del(url: string) {
    return this.remove(url);
  }
}

describe('HttpClient', () => {
  it('remove resolves on 204 and throws ApiError with the server detail on failure', async () => {
    const responses = [new Response(null, { status: 204 }), new Response(JSON.stringify({ detail: 'in progress' }), { status: 409 })];
    const fetchImpl: FetchLike = async () => responses.shift()!;
    const client = new TestClient(fetchImpl);
    await expect(client.del('/x')).resolves.toBeUndefined();
    const error = await client.del('/x').catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(409);
    expect(error.message).toBe('in progress');
  });
});

describe('HttpClient error messages', () => {
  const failing = (status: number, body: unknown): TestClient => new TestClient(async () => new Response(JSON.stringify(body), { status }));

  it('turns a request-shape error (detail is a list) into one readable sentence', async () => {
    const error = await failing(422, { detail: [{ loc: ['body', 'name'], msg: 'Field required' }] }).del('/x').catch((e) => e);
    expect(error.message).toBe('The request was not accepted: Field required');
  });

  it('falls back to the generic message for a list without messages, and for a non-JSON body', async () => {
    expect((await failing(422, { detail: [] }).del('/x').catch((e) => e)).message).toBe('Request to /x failed with 422');
    const html = new TestClient(async () => new Response('<h1>oops</h1>', { status: 500 }));
    expect((await html.del('/x').catch((e) => e)).message).toBe('Request to /x failed with 500');
  });
});
