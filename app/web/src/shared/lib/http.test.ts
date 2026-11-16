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
