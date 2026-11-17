import { OFFER } from '../lib/offer.js';
import { isPaymentAvailable, createPayment, PaymentError, validIdempotencyKey } from '../lib/firebot.js';
import { reply, hasSameOrigin, readJson } from '../lib/http.js';
import { validateCustomer } from '../public/validation.js';
export default async function handler(req, res) {
  if (req.method === 'GET') return reply(res, 200, { ...OFFER, available: isPaymentAvailable() });
  if (req.method !== 'POST') { res.setHeader('Allow','GET, POST'); return reply(res,405,{message:'Método não permitido.'}); }
  if (!hasSameOrigin(req)) return reply(res,403,{message:'Origem inválida.'});
  try {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(res,400,{message:'Dados inválidos.'});
    if (Object.keys(body).some(key=>key !== 'customer')) return reply(res,400,{message:'O valor da oferta é definido pelo servidor.'});
    const result = validateCustomer(body.customer);
    if (!result.valid) return reply(res,400,{message:'Confira seus dados.',errors:result.errors});
    if (!isPaymentAvailable()) return reply(res,503,{code:'PAYMENTS_UNAVAILABLE',message:'As inscrições ainda não estão disponíveis. Nenhuma cobrança foi criada.'});
    const idempotencyKey = req.headers['idempotency-key'];
    if (!validIdempotencyKey(idempotencyKey)) return reply(res,400,{message:'Recarregue a página e tente novamente.'});
    const payment = await createPayment({customer:result.customer,idempotencyKey,ip:req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown'});
    return reply(res,201,payment);
  } catch (error) { return reply(res,error instanceof PaymentError ? error.status : error instanceof SyntaxError || ['BODY_TOO_LARGE','UNSUPPORTED_TYPE'].includes(error.message) ? 400 : 503,{code:error.code || 'CHECKOUT_UNAVAILABLE',message:error instanceof PaymentError ? error.message : 'Não foi possível processar a solicitação. Tente consultar o pedido novamente.'}); }
}
