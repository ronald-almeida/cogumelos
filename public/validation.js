export function validCpf(cpf) {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i);
    if ((sum * 10) % 11 % 10 !== Number(cpf[size])) return false;
  }
  return true;
}
export function validateCustomer(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.replace(/\D/g, '') : '';
  const cpf = typeof input.cpf === 'string' ? input.cpf.replace(/\D/g, '') : '';
  const errors = {};
  if (name.length < 5 || name.length > 100 || !/^[\p{L}\p{M}][\p{L}\p{M} .'’-]+\s[\p{L}\p{M} .'’-]+$/u.test(name)) errors.name = 'Informe seu nome e sobrenome.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Informe um e-mail válido.';
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(phone) || /^(\d)\1+$/.test(phone)) errors.phone = 'Informe um celular válido com DDD (11 dígitos).';
  if (!validCpf(cpf)) errors.cpf = 'Informe um CPF válido para gerar o Pix.';
  return { valid: Object.keys(errors).length === 0, errors, customer: { name, email, phone, cpf } };
}
