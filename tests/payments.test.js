import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { createPaymentService } from '../lib/firebot.js';
import { validCpf } from '../public/validation.js';

const customer = {name:'Pessoa Teste',email:'pessoa@example.com',phone:'11999999999',cpf:'52998224725'};
const env = {FIREBOT_SECRET_KEY:'fire_sk_test_fixture',ORDER_TOKEN_SECRET:'test-secret-for-signing-at-least-32-chars',BLOB_STORE_ID:'store_test',SUPPORT_WHATSAPP:'5575988393742'};
function fixture() {
  const records = new Map(), calls = [];
  const state = {status:'PENDING',amount:297,transactionId:'fire_tx_test',failure:false};
  const store = {async read(key){return records.get(key) ?? null;},async create(key,value){if(records.has(key))return false;records.set(key,value);return true;}};
  const fetcher = async (url,options) => {
    calls.push({url,options});
    if(state.failure)throw new Error('timeout');
    return {ok:true,async json(){return {success:true,...state,pixCopiaECola:'000201test-only-not-a-payable-code'};}};
  };
  return {state,calls,records,store,service:createPaymentService({store,fetcher,env})};
}
test('CPF checks digits and rejects repeated or malformed identifiers',()=>{
  assert.ok(validCpf(customer.cpf));
  for(const cpf of ['11111111111','52998224724','123','',null])assert.equal(validCpf(cpf),false);
});
test('creates exactly R$297 with server secret, inline QR and no saved customer PII',async()=>{
  const f=fixture();const payment=await f.service.create({customer,idempotencyKey:randomUUID()});
  assert.equal(JSON.parse(f.calls[0].options.body).amount,297);
  assert.equal(f.calls[0].url,'https://firebotbr.com/api/v1/pix/create');
  assert.equal(f.calls[0].options.headers['x-api-key'],env.FIREBOT_SECRET_KEY);
  assert.match(payment.qrImage,/^data:image\/png;base64,/);assert.equal(payment.amountCents,29700);
  const stored=JSON.stringify([...f.records.values()]);
  for(const value of [customer.cpf,customer.name,customer.email,customer.phone])assert.equal(stored.includes(value),false);
});
test('concurrent requests and subsequent recovery create one upstream Pix',async()=>{
  const f=fixture(),key=randomUUID();
  const results=await Promise.allSettled([f.service.create({customer,idempotencyKey:key}),f.service.create({customer,idempotencyKey:key})]);
  assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.calls.length,1);
  const recovered=await f.service.resume(key);const repeated=await f.service.create({customer,idempotencyKey:key});
  assert.equal(recovered.statusToken,repeated.statusToken);assert.equal(f.calls.length,1);
  await assert.rejects(f.service.create({customer:{...customer,email:'changed@example.com'},idempotencyKey:key}),{code:'ORDER_CONFLICT'});
});
test('timeout never retries the ambiguous creation upstream',async()=>{
  const f=fixture(),key=randomUUID();f.state.failure=true;
  await assert.rejects(f.service.create({customer,idempotencyKey:key}),{code:'PROVIDER_UNAVAILABLE'});
  f.state.failure=false;
  await assert.rejects(f.service.create({customer,idempotencyKey:key}),{code:'ORDER_PROCESSING'});
  assert.equal(f.calls.length,1);
});
test('rejects wrong amount on creation and verification',async()=>{
  const f=fixture();f.state.amount=1;
  await assert.rejects(f.service.create({customer,idempotencyKey:randomUUID()}),{code:'INVALID_PAYMENT'});
  f.state.amount=297;const payment=await f.service.create({customer,idempotencyKey:randomUUID()});
  f.state.amount=1;f.state.status='PAID';
  await assert.rejects(f.service.status(payment.statusToken),{code:'INVALID_PAYMENT'});
});
test('only verified paid orders receive WhatsApp access request',async()=>{
  const f=fixture();const payment=await f.service.create({customer,idempotencyKey:randomUUID()});
  assert.deepEqual(await f.service.status(payment.statusToken),{status:'pending'});
  f.state.status='PAID';const result=await f.service.status(payment.statusToken);
  assert.equal(result.status,'paid');assert.match(result.whatsappUrl,/^https:\/\/wa.me\/5575988393742\?text=/);
  f.state.status='REFUNDED';assert.deepEqual(await f.service.status(payment.statusToken),{status:'refunded'});
  f.state.status='WITHDRAWAL';await assert.rejects(f.service.status(payment.statusToken),{code:'UNKNOWN_STATUS'});
});
test('forged token or transaction mismatch cannot confirm payment',async()=>{
  const f=fixture();const payment=await f.service.create({customer,idempotencyKey:randomUUID()});
  await assert.rejects(f.service.status(payment.statusToken+'0'),{code:'INVALID_TOKEN'});
  f.state.transactionId='fire_tx_other';f.state.status='PAID';
  await assert.rejects(f.service.status(payment.statusToken),{code:'INVALID_PAYMENT'});
});
test('webhook requires raw-body HMAC and independently verifies paid event',async()=>{
  const f=fixture();await f.service.create({customer,idempotencyKey:randomUUID()});
  const raw=Buffer.from(JSON.stringify({event:'venda.paga',data:{transactionId:'fire_tx_test',status:'PAID',amount:297}}));
  await assert.rejects(f.service.webhook(raw,'0'.repeat(64)),{code:'INVALID_SIGNATURE'});
  const signature=createHmac('sha256',env.FIREBOT_SECRET_KEY).update(raw).digest('hex');
  assert.deepEqual(await f.service.webhook(raw,signature),{received:true});assert.equal(f.calls.length,2);
  await f.service.webhook(raw,signature);assert.equal(f.calls.length,3);
  assert.equal(f.calls.filter(c=>c.options.method==='POST').length,1);
});
test('limits creation attempts per connection',async()=>{
  const f=fixture();for(let i=0;i<5;i++)await f.service.create({customer,idempotencyKey:randomUUID(),ip:'test'});
  await assert.rejects(f.service.create({customer,idempotencyKey:randomUUID(),ip:'test'}),{code:'RATE_LIMIT'});
  assert.equal(f.calls.length,5);
});
