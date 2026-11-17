import { validateCustomer } from './validation.js';
const $ = id => document.getElementById(id);
const form = $('customer-form');
let available = false, customer, submitting = false, statusToken, pollTimer, statusAttempts = 0;
let idempotencyKey = crypto.randomUUID();
function saved(key) { try { return sessionStorage.getItem(`cogumelos.${key}`); } catch { return null; } }
let attempted = saved('attemptKey');
function notice(title, text) {
  const heading = document.createElement('strong'); heading.textContent = title;
  $('availability').replaceChildren(heading, document.createTextNode(text));
  $('availability').hidden = false;
}
function showRecovery(message) {
  form.hidden = true; $('payment-step').hidden = true; $('pix-result').hidden = true;
  $('resume-panel').hidden = false; $('resume-message').textContent = message;
}
async function requestStatus(body) {
  const response = await fetch('/api/payment-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.message || 'Não foi possível consultar seu pedido.'); error.status = response.status; throw error; }
  return data;
}
function showPix(data) {
  if (!data.pixCode || !data.statusToken || data.amountCents !== 29700) throw new Error('Não foi possível confirmar os dados do pagamento. Consulte seu pedido novamente.');
  statusToken = data.statusToken;
  sessionStorage.setItem('cogumelos.statusToken', statusToken);
  $('pix-code').value = data.pixCode;
  if (typeof data.qrImage === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data.qrImage)) {
    $('qr-image').src = data.qrImage; $('qr-image').hidden = false;
  }
  form.hidden = true; $('payment-step').hidden = true; $('resume-panel').hidden = true; $('pix-result').hidden = false;
  $('pix-status').textContent = 'Aguardando confirmação do pagamento de R$ 297,00.';
  clearTimeout(pollTimer); statusAttempts = 0; pollTimer = setTimeout(checkStatus, 1500);
}
async function resume() {
  if (submitting || !attempted) return;
  submitting = true; $('resume-order').disabled = true;
  showRecovery('Consultando o pedido que você já iniciou…');
  try { showPix(await requestStatus({ resumeKey: attempted })); }
  catch (error) {
    if (error.status === 404) {
      sessionStorage.removeItem('cogumelos.attemptKey'); sessionStorage.removeItem('cogumelos.statusToken'); attempted = null;
      $('resume-panel').hidden = true; form.hidden = false;
      $('generate-pix').disabled = !available; $('edit-details').disabled = false;
    } else showRecovery(error.message);
  } finally { submitting = false; $('resume-order').disabled = false; }
}
$('resume-order').addEventListener('click', resume);
async function loadOffer() {
  if (attempted) showRecovery('Consultando seu pedido anterior…');
  try {
    const response = await fetch('/api/checkout', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('unavailable');
    const offer = await response.json();
    if (offer.amountCents !== 29700 || offer.currency !== 'BRL') throw new Error('invalid-offer');
    available = offer.available === true;
    if (available) $('availability').hidden = true;
    else notice('Inscrições em breve', 'Você pode conferir as etapas e o valor. Nenhuma cobrança será gerada enquanto as inscrições estiverem indisponíveis.');
  } catch { notice('Não foi possível consultar as inscrições', 'Recarregue a página para tentar novamente.'); }
  $('generate-pix').disabled = !available; $('payment-unavailable').hidden = available;
  if (attempted) await resume();
}
loadOffer();
$('phone').addEventListener('input', event => {
  const digits = event.target.value.replace(/\D/g, '').slice(0, 11);
  event.target.value = digits.length > 7 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}` : digits.length > 2 ? `(${digits.slice(0, 2)}) ${digits.slice(2)}` : digits;
});
$('cpf').addEventListener('input', event => {
  event.target.value = event.target.value.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (attempted) return;
  const result = validateCustomer(Object.fromEntries(new FormData(form)));
  for (const field of ['name', 'email', 'phone', 'cpf']) {
    $(field).setAttribute('aria-invalid', String(Boolean(result.errors[field])));
    $(`${field}-error`).textContent = result.errors[field] || ''; $(`${field}-error`).hidden = !result.errors[field];
  }
  if (!result.valid) { $(Object.keys(result.errors)[0]).focus(); return; }
  customer = result.customer;
  $('review-name').textContent = customer.name; $('review-email').textContent = customer.email;
  form.hidden = true; $('payment-step').hidden = false;
  $('step-1').classList.remove('active'); $('step-1').removeAttribute('aria-current');
  $('step-2').classList.add('active'); $('step-2').setAttribute('aria-current', 'step'); $('payment-heading').focus();
});
$('edit-details').addEventListener('click', () => {
  if (submitting || attempted) return;
  form.hidden = false; $('payment-step').hidden = true;
  $('step-2').classList.remove('active'); $('step-2').removeAttribute('aria-current');
  $('step-1').classList.add('active'); $('step-1').setAttribute('aria-current', 'step'); $('name').focus();
});
$('generate-pix').addEventListener('click', async () => {
  if (!available || !customer || submitting || attempted) return;
  submitting = true; $('generate-pix').disabled = true; $('global-error').hidden = true;
  $('generate-pix').textContent = 'Gerando seu Pix…'; $('edit-details').disabled = true;
  try {
    // Persist only an opaque recovery key; never store the buyer's CPF or contact details.
    sessionStorage.setItem('cogumelos.attemptKey', idempotencyKey); attempted = idempotencyKey;
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ customer }), signal: AbortSignal.timeout(55000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível gerar o Pix. Consulte o pedido novamente.');
    showPix(data); customer = undefined; form.reset();
  } catch (error) {
    if (attempted) showRecovery(error.name === 'TimeoutError' ? 'A resposta demorou mais que o esperado. Consulte este pedido antes de tentar um novo pagamento.' : error.message);
    else { $('global-error').textContent = 'Permita o armazenamento de sessão no navegador para recuperar o pedido com segurança.'; $('global-error').hidden = false; }
  } finally {
    submitting = false; $('generate-pix').disabled = !available || Boolean(attempted); $('edit-details').disabled = Boolean(attempted);
    $('generate-pix').textContent = 'Gerar Pix de R$ 297,00 →';
  }
});
async function checkStatus() {
  if (!statusToken || statusAttempts++ >= 60) {
    $('pix-status').textContent = 'A consulta automática terminou. Recarregue esta página para consultar o mesmo pedido novamente.'; return;
  }
  try {
    const data = await requestStatus({ statusToken });
    if (data.status === 'paid') { window.location.assign('/obrigado'); return; }
    if (['expired', 'cancelled', 'refunded'].includes(data.status)) {
      $('pix-heading').textContent = 'Este Pix não está mais disponível';
      $('pix-status').textContent = 'Não pague este código. Fale com o atendimento para consultar o pedido.';
      $('qr-image').hidden = true; $('pix-code').hidden = true; $('copy-pix').hidden = true; return;
    }
    $('pix-status').textContent = 'Aguardando confirmação do pagamento de R$ 297,00.';
  } catch { $('pix-status').textContent = 'A confirmação está temporariamente indisponível. Se você já pagou, não faça outro pagamento.'; }
  pollTimer = setTimeout(checkStatus, 15000);
}
window.addEventListener('pagehide', () => clearTimeout(pollTimer));
$('copy-pix').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('pix-code').value); $('copy-message').textContent = 'Código copiado. Abra o aplicativo do seu banco.'; }
  catch { $('pix-code').focus(); $('pix-code').select(); $('copy-message').textContent = 'Selecione e copie o código acima.'; }
});

$('continue-payment').disabled = false;
