import { validateCustomer } from './validation.js';
const $ = id => document.getElementById(id);
let available = false;
let customer;
let idempotencyKey;
let submitting = false;
let statusToken;
let pollTimer;
const form = $('customer-form');
function notice(title, text) {
  $('availability').replaceChildren();
  const heading = document.createElement('strong'); heading.textContent = title;
  $('availability').append(heading, document.createTextNode(text));
}
async function loadOffer() {
  try {
    const response = await fetch('/api/checkout', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('unavailable');
    const offer = await response.json();
    if (offer.amountCents !== 29700 || offer.currency !== 'BRL') throw new Error('invalid-offer');
    available = offer.available === true;
    if (available) $('availability').hidden = true;
    else notice('Inscrições em breve', 'Você pode conferir as etapas e o valor. Nenhuma cobrança será gerada enquanto as inscrições estiverem indisponíveis.');
  } catch {
    notice('Não foi possível consultar as inscrições', 'Você pode conferir a oferta. Recarregue a página para tentar novamente.');
  }
  $('generate-pix').disabled = !available;
  $('payment-unavailable').hidden = available;
}
loadOffer();
$('phone').addEventListener('input', event => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
  event.target.value = digits.length > 7 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}` : digits.length > 2 ? `(${digits.slice(0, 2)}) ${digits.slice(2)}` : digits;
});
form.addEventListener('submit', event => {
  event.preventDefault();
  const result = validateCustomer(Object.fromEntries(new FormData(form)));
  for (const field of ['name', 'email', 'phone']) {
    $(field).setAttribute('aria-invalid', String(Boolean(result.errors[field])));
    $(`${field}-error`).textContent = result.errors[field] || '';
    $(`${field}-error`).hidden = !result.errors[field];
  }
  if (!result.valid) { $(Object.keys(result.errors)[0]).focus(); return; }
  if (JSON.stringify(customer) !== JSON.stringify(result.customer)) idempotencyKey = crypto.randomUUID();
  customer = result.customer;
  $('review-name').textContent = customer.name;
  $('review-email').textContent = customer.email;
  form.hidden = true; $('payment-step').hidden = false;
  $('step-1').classList.remove('active'); $('step-1').removeAttribute('aria-current');
  $('step-2').classList.add('active'); $('step-2').setAttribute('aria-current', 'step');
  $('payment-heading').focus();
});
$('edit-details').addEventListener('click', () => {
  if (submitting) return;
  form.hidden = false; $('payment-step').hidden = true;
  $('step-2').classList.remove('active'); $('step-2').removeAttribute('aria-current');
  $('step-1').classList.add('active'); $('step-1').setAttribute('aria-current', 'step');
  $('name').focus();
});
// Contract for the application backend. No FireBot endpoints are guessed here.
$('generate-pix').addEventListener('click', async () => {
  if (!available || !customer || submitting) return;
  submitting = true; $('generate-pix').disabled = true; $('global-error').hidden = true;
  $('generate-pix').textContent = 'Gerando seu Pix…';
  $('edit-details').disabled = true;
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ customer }), signal: AbortSignal.timeout(25000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível gerar o Pix. Tente novamente.');
    if (!data.pixCode || !data.statusToken || data.amountCents !== 29700) throw new Error('Não foi possível confirmar os dados do pagamento. Tente novamente.');
    statusToken = data.statusToken;
    $('pix-code').value = data.pixCode;
    // Only accept inline PNG data; never load an arbitrary provider URL into the buyer's browser.
    if (typeof data.qrImage === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.qrImage)) {
      $('qr-image').src = data.qrImage; $('qr-image').hidden = false;
    }
    $('payment-step').hidden = true; $('pix-result').hidden = false;
    $('pix-status').textContent = 'Aguardando confirmação do pagamento de R$ 297,00.';
    pollTimer = setTimeout(checkStatus, 6000);
  } catch (error) {
    $('global-error').textContent = error.name === 'TimeoutError' ? 'O pagamento está demorando para responder. Não pague novamente antes de conferir seu banco.' : error.message;
    $('global-error').hidden = false;
  } finally {
    submitting = false; $('generate-pix').disabled = !available; $('edit-details').disabled = false;
    $('generate-pix').textContent = 'Gerar Pix de R$ 297,00 →';
  }
});
let statusAttempts = 0;
async function checkStatus() {
  if (!statusToken || statusAttempts++ >= 100) {
    $('pix-status').textContent = 'A consulta automática terminou. Confira o pagamento no aplicativo do seu banco.'; return;
  }
  try {
    const response = await fetch('/api/payment-status', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({statusToken}), cache:'no-store', signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('status-unavailable');
    const data = await response.json();
    if (data.status === 'paid') {
      $('pix-heading').textContent = 'Pagamento confirmado';
      $('pix-status').textContent = 'Sua inscrição foi paga. Guarde o comprovante do seu banco.';
      $('qr-image').hidden = true; $('pix-code').hidden = true; $('copy-pix').hidden = true; return;
    }
    if (['expired','cancelled'].includes(data.status)) {
      $('pix-heading').textContent = 'Este Pix não está mais disponível';
      $('pix-status').textContent = 'Não efetue o pagamento deste código. Volte ao curso para consultar a disponibilidade.';
      $('qr-image').hidden = true; $('pix-code').hidden = true; $('copy-pix').hidden = true; return;
    }
  } catch { $('pix-status').textContent = 'A confirmação está temporariamente indisponível. Se você já pagou, não faça outro pagamento.'; }
  pollTimer = setTimeout(checkStatus, 10000);
}
window.addEventListener('pagehide', () => clearTimeout(pollTimer));
$('copy-pix').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('pix-code').value); $('copy-message').textContent = 'Código copiado. Abra o aplicativo do seu banco.'; }
  catch { $('pix-code').focus(); $('pix-code').select(); $('copy-message').textContent = 'Selecione e copie o código acima.'; }
});
