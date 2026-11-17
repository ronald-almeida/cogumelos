const $ = id => document.getElementById(id);
let checking = false;
async function check() {
  if (checking) return;
  checking = true; $('check-again').hidden = true; $('confirmed-order').hidden = true;
  try {
    const token = sessionStorage.getItem('cogumelos.statusToken');
    if (!token) { $('thanks-heading').textContent = 'Vamos localizar seu pedido.'; $('thanks-status').textContent = 'Volte ao checkout no navegador em que você iniciou a compra ou fale com o atendimento.'; return; }
    const response = await fetch('/api/payment-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ statusToken: token }), cache: 'no-store', signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Não foi possível consultar seu pedido.');
    if (data.status === 'paid' && typeof data.whatsappUrl === 'string' && data.whatsappUrl.startsWith('https://wa.me/5575988393742?text=')) {
      $('thanks-heading').textContent = 'Obrigado! Seu pagamento foi confirmado.';
      $('thanks-status').textContent = 'Seu primeiro passo está dado. Falta só solicitar o acesso ao curso.';
      $('access-whatsapp').href = data.whatsappUrl;
      $('order-reference').textContent = `Pedido: ${data.orderReference}`;
      $('confirmed-order').hidden = false;
    } else {
      $('thanks-heading').textContent = data.status === 'pending' ? 'Aguardando o seu Pix.' : 'Confira a situação do pedido.';
      $('thanks-status').textContent = data.status === 'pending' ? 'O pagamento ainda não foi confirmado. Se você já pagou, aguarde e consulte novamente.' : 'Este pedido não possui um pagamento aprovado disponível para liberação. Fale com o atendimento.';
      $('check-again').hidden = false;
    }
  } catch (error) { $('thanks-heading').textContent = 'Vamos conferir seu pagamento.'; $('thanks-status').textContent = `${error.message} Se você já pagou, não faça outro pagamento.`; $('check-again').hidden = false; }
  finally { checking = false; }
}
$('check-again').addEventListener('click', check);
check();
