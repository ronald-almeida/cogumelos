import { reply } from '../lib/http.js';
export default function handler(req, res) {
  if(req.method !== 'POST'){res.setHeader('Allow','POST');return reply(res,405,{message:'Método não permitido.'});}
  return reply(res,503,{code:'PAYMENTS_UNAVAILABLE',message:'A consulta de pagamentos ainda não está disponível.'});
}
