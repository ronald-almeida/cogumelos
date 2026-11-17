import { getPaymentStatus, resumePayment, isPaymentAvailable, PaymentError } from '../lib/firebot.js';
import { reply, hasSameOrigin, readJson } from '../lib/http.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reply(res, 405, { message: 'Método não permitido.' }); }
  if (!hasSameOrigin(req)) return reply(res, 403, { message: 'Origem inválida.' });
  try {
    const body = await readJson(req);
    if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).length !== 1 || !('statusToken' in body || 'resumeKey' in body)) return reply(res, 400, { message: 'Pedido inválido.' });
    if (!isPaymentAvailable()) return reply(res, 503, { message: 'A consulta de pagamento está temporariamente indisponível.' });
    return reply(res, 200, body.resumeKey ? await resumePayment(body.resumeKey) : await getPaymentStatus(body.statusToken));
  } catch (error) {
    return reply(res, error instanceof PaymentError ? error.status : 503, { code: error.code || 'STATUS_UNAVAILABLE', message: error instanceof PaymentError ? error.message : 'Não foi possível consultar o pagamento. Se você já pagou, não pague novamente.' });
  }
}
