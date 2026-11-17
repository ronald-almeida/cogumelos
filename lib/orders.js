import { get, put } from '@vercel/blob';

// Immutable claims/results prevent concurrent serverless requests overwriting orders.
export const orderStore = {
  async read(path) {
    const result = await get(`${path}.json`, { access: 'private', useCache: false });
    if (!result) return null;
    if (result.statusCode !== 200) throw new Error('STORAGE_UNAVAILABLE');
    return new Response(result.stream).json();
  },
  async create(path, value, ttlDays = 30) {
    try {
      await put(`${path}.json`, JSON.stringify(value), { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json', ttlDays });
      return true;
    } catch (error) {
      // A concurrent request may have won, or the write acknowledgement was lost.
      if (await this.read(path)) return false;
      throw error;
    }
  }
};
