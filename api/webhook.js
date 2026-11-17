import { createPaymentService, PaymentError } from '../lib/firebot.js';
import { reply } from '../lib/http.js';
export const config = { api: { bodyParser: false } };
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { message: 'Método não permitido.' }); }
  try {
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += Buffer.byteLength(chunk); if (size > 65536) return reply(res, 413, { message: 'Corpo muito grande.' }); chunks.push(Buffer.from(chunk)); }
    return reply(res, 200, await createPaymentService().webhook(Buffer.concat(chunks), req.headers['x-signature']));
  } catch (error) { return reply(res, error instanceof PaymentError ? error.status : 503, { message: 'Notificação não processada.' }); }
}
