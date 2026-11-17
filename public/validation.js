export function validateCustomer(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.replace(/\D/g, '') : '';
  const errors = {};
  if (name.length < 5 || name.length > 100 || !/^[\p{L}\p{M}][\p{L}\p{M} .'’-]+\s[\p{L}\p{M} .'’-]+$/u.test(name)) errors.name = 'Informe seu nome e sobrenome.';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Informe um e-mail válido.';
  if (!/^[1-9][0-9]9[0-9]{8}$/.test(phone) || /^(\d)\1+$/.test(phone)) errors.phone = 'Informe um celular válido com DDD (11 dígitos).';
  return { valid: Object.keys(errors).length === 0, errors, customer: { name, email, phone } };
}
