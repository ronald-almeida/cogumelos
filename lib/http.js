export function reply(res, status, data) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = status;
  res.end(JSON.stringify(data));
}
export function hasSameOrigin(req) {
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
export async function readJson(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('UNSUPPORTED_TYPE');
  if (Number(req.headers['content-length']) > 4096) throw new Error('BODY_TOO_LARGE');
  if (req.body !== undefined) {
    const serialized = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    if (Buffer.byteLength(serialized) > 4096) throw new Error('BODY_TOO_LARGE');
    return JSON.parse(serialized);
  }
  let body = '';
  for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 4096) throw new Error('BODY_TOO_LARGE'); }
  return JSON.parse(body);
}
