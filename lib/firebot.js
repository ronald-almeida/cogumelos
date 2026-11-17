import { createHmac, timingSafeEqual } from 'node:crypto';
import QRCode from 'qrcode';
import { OFFER } from './offer.js';
import { orderStore } from './orders.js';

const BASE = 'https://firebotbr.com/api/v1';
const DAY = 86400000;
const keyPattern = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export class PaymentError extends Error {
  constructor(code, message, status = 503) { super(message); this.code = code; this.status = status; }
}
export function isPaymentAvailable(env = process.env) {
  return Boolean(env.FIREBOT_SECRET_KEY?.startsWith('fire_sk_') && env.ORDER_TOKEN_SECRET?.length >= 32 &&
    (env.BLOB_STORE_ID || env.BLOB_READ_WRITE_TOKEN) && /^55[1-9]\d9\d{8}$/.test(env.SUPPORT_WHATSAPP || ''));
}
function hmac(secret, value) { return createHmac('sha256', secret).update(value).digest('hex'); }
export function validIdempotencyKey(value) { return typeof value === 'string' && keyPattern.test(value); }
export function createPaymentService({ store = orderStore, fetcher = fetch, env = process.env, now = Date.now } = {}) {
  const digest = value => hmac(env.ORDER_TOKEN_SECRET, value);
  const orderId = key => digest(`order:${key}`);
  function sign(id, expiresAt) {
    const payload = Buffer.from(JSON.stringify({ id, expiresAt })).toString('base64url');
    return `${payload}.${digest(`status:${payload}`)}`;
  }
  function verify(token) {
    if (typeof token !== 'string' || token.length > 512) throw new PaymentError('INVALID_TOKEN', 'Pedido inválido.', 400);
    const [payload, signature, extra] = token.split('.');
    if (extra || !payload || !/^[a-f\d]{64}$/.test(signature || '')) throw new PaymentError('INVALID_TOKEN', 'Pedido inválido.', 400);
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(digest(`status:${payload}`), 'hex'))) throw new PaymentError('INVALID_TOKEN', 'Pedido inválido.', 400);
    let parsed;
    try { parsed = JSON.parse(Buffer.from(payload, 'base64url')); } catch { throw new PaymentError('INVALID_TOKEN', 'Pedido inválido.', 400); }
    if (!/^[a-f\d]{64}$/.test(parsed.id || '') || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt < now()) throw new PaymentError('EXPIRED_TOKEN', 'A consulta deste pedido expirou. Fale com o suporte pelo WhatsApp.', 410);
    return parsed.id;
  }
  async function provider(path, body) {
    // FireBot does not document idempotency: never retry a creation upstream.
    try {
      const response = await fetcher(`${BASE}${path}`, { method: body ? 'POST' : 'GET', headers: { accept: 'application/json', 'content-type': 'application/json', 'x-api-key': env.FIREBOT_SECRET_KEY }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error('provider-response');
      const data = await response.json();
      if (data?.success === false) throw new Error('provider-failure');
      return data?.data && typeof data.data === 'object' ? data.data : data;
    } catch { throw new PaymentError('PROVIDER_UNAVAILABLE', 'Não foi possível confirmar a resposta do Pix. Não gere outro pagamento; tente consultar este pedido novamente.'); }
  }
  async function present(record) {
    return { amountCents: OFFER.amountCents, pixCode: record.pixCode, statusToken: sign(record.id, record.expiresAt), qrImage: await QRCode.toDataURL(record.pixCode, { width: 320, margin: 2, errorCorrectionLevel: 'M' }) };
  }
  async function resume(key) {
    if (!validIdempotencyKey(key)) throw new PaymentError('INVALID_KEY', 'Pedido inválido.', 400);
    const id = orderId(key);
    const record = await store.read(`results/${id}`);
    if (record && record.expiresAt > now()) return present(record);
    if (await store.read(`claims/${id}`)) throw new PaymentError('ORDER_PROCESSING', 'Seu pedido ainda não retornou um código Pix. Tente consultar novamente. Se persistir, fale com o suporte antes de iniciar outro pedido.', 409);
    throw new PaymentError('NOT_FOUND', 'Nenhum pedido foi iniciado nesta sessão.', 404);
  }
  async function rateLimit(ip) {
    const bucket = digest(`rate:${ip}:${Math.floor(now() / 3600000)}`);
    for (let slot = 0; slot < 5; slot++) if (await store.create(`limits/${bucket}/${slot}`, { createdAt: now() }, 1)) return;
    throw new PaymentError('RATE_LIMIT', 'Muitas tentativas nesta conexão. Aguarde uma hora ou fale com o suporte.', 429);
  }
  async function create({ customer, idempotencyKey, ip = 'unknown' }) {
    if (!isPaymentAvailable(env)) throw new PaymentError('PAYMENTS_UNAVAILABLE', 'As inscrições ainda não estão disponíveis. Nenhuma cobrança foi criada.');
    if (!validIdempotencyKey(idempotencyKey)) throw new PaymentError('INVALID_KEY', 'Recarregue a página e tente novamente.', 400);
    const id = orderId(idempotencyKey);
    const fingerprint = digest(`customer:${JSON.stringify(customer)}:${OFFER.id}:${OFFER.amountCents}`);
    const existing = await store.read(`claims/${id}`);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new PaymentError('ORDER_CONFLICT', 'Este pedido já foi iniciado com outros dados. Consulte o pedido existente.', 409);
      return resume(idempotencyKey);
    }
    await rateLimit(ip);
    const expiresAt = now() + 30 * DAY;
    if (!await store.create(`claims/${id}`, { fingerprint, createdAt: now(), expiresAt })) return create({ customer, idempotencyKey, ip });
    const payment = await provider('/pix/create', { amount: OFFER.amountCents / 100, productType: 'DIGITAL', description: OFFER.name, storeUrl: 'https://cogumelos.vercel.app/checkout', customer, qrStyle: 'plain' });
    if (typeof payment.transactionId !== 'string' || !/^fire_tx_[\w-]{1,160}$/.test(payment.transactionId) || Math.round(Number(payment.amount) * 100) !== OFFER.amountCents || payment.status !== 'PENDING' || typeof payment.pixCopiaECola !== 'string' || !payment.pixCopiaECola.startsWith('000201') || payment.pixCopiaECola.length > 4096) throw new PaymentError('INVALID_PAYMENT', 'O processador não retornou um Pix válido de R$ 297,00. Fale com o suporte antes de tentar novamente.');
    const record = { id, transactionId: payment.transactionId, pixCode: payment.pixCopiaECola, amountCents: OFFER.amountCents, expiresAt };
    await store.create(`transactions/${digest(payment.transactionId)}`, { id });
    await store.create(`results/${id}`, record);
    return present(record);
  }
  async function lookup(id) {
    const record = await store.read(`results/${id}`);
    if (!record) throw new PaymentError('NOT_FOUND', 'Pedido não encontrado.', 404);
    const payment = await provider(`/pix/${encodeURIComponent(record.transactionId)}`);
    const responseId = payment.transactionId ?? payment.id;
    if (responseId !== record.transactionId || Math.round(Number(payment.amount) * 100) !== OFFER.amountCents || (payment.currency && payment.currency !== 'BRL')) throw new PaymentError('INVALID_PAYMENT', 'Não foi possível validar os dados deste pagamento. Fale com o suporte.');
    const statuses = { PENDING: 'pending', PAID: 'paid', EXPIRED: 'expired', CANCELLED: 'cancelled', CANCELED: 'cancelled', REFUNDED: 'refunded' };
    const status = statuses[payment.status];
    if (!status) throw new PaymentError('UNKNOWN_STATUS', 'A confirmação está temporariamente indisponível. Tente consultar novamente.');
    const result = { status };
    if (status === 'paid') {
      result.orderReference = record.transactionId;
      result.whatsappUrl = `https://wa.me/${env.SUPPORT_WHATSAPP}?text=${encodeURIComponent(`Olá! Paguei R$ 297,00 pelo curso Cultivo de Cogumelos e gostaria de solicitar meu acesso. Pedido: ${record.transactionId}`)}`;
    }
    return result;
  }
  async function status(token) { return lookup(verify(token)); }
  async function webhook(raw, signature) {
    if (typeof signature !== 'string' || !/^[a-f\d]{64}$/i.test(signature) || !env.FIREBOT_SECRET_KEY) throw new PaymentError('INVALID_SIGNATURE', 'Assinatura inválida.', 401);
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(hmac(env.FIREBOT_SECRET_KEY, raw), 'hex'))) throw new PaymentError('INVALID_SIGNATURE', 'Assinatura inválida.', 401);
    let event;
    try { event = JSON.parse(raw); } catch { throw new PaymentError('INVALID_BODY', 'Corpo inválido.', 400); }
    if (!['venda.paga', 'venda.pendente', 'venda.estornada'].includes(event.event)) return { received: true };
    const tx = event.data?.transactionId;
    if (typeof tx !== 'string' || !/^fire_tx_[\w-]{1,160}$/.test(tx)) return { received: true };
    const index = await store.read(`transactions/${digest(tx)}`);
    if (index) await lookup(index.id); // Do not grant access from the webhook body.
    return { received: true };
  }
  return { create, status, resume, webhook };
}
export const createPayment = args => createPaymentService().create(args);
export const getPaymentStatus = token => createPaymentService().status(token);
export const resumePayment = key => createPaymentService().resume(key);
