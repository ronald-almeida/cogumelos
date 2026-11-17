import { test } from 'node:test';
import assert from 'node:assert/strict';
import checkout from '../api/checkout.js';
import paymentStatus from '../api/payment-status.js';
import { validateCustomer } from '../public/validation.js';
import { OFFER } from '../lib/offer.js';
const customer = {name:'Pessoa Teste',email:'pessoa@example.com',phone:'11999999999'};
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},end(body){this.body=JSON.parse(body);}};}
async function call(method,body,extraHeaders={}){const res=response();await checkout({method,body,headers:{host:'localhost:3000','content-type':'application/json',...extraHeaders}},res);return res;}
test('a oferta tem preço fixo em centavos e não habilita cobranças sem integração verificada',async()=>{const res=await call('GET');assert.equal(res.statusCode,200);assert.equal(res.body.amountCents,29700);assert.equal(res.body.currency,'BRL');assert.equal(res.body.available,false);assert.equal(res.headers['Cache-Control'],'no-store');assert.ok(Object.isFrozen(OFFER));});
test('rejeita adulteração do preço enviada pelo navegador',async()=>{const res=await call('POST',{customer,amountCents:1});assert.equal(res.statusCode,400);});
test('não cria cobrança ou simula sucesso enquanto FireBot estiver pendente',async()=>{const res=await call('POST',{customer});assert.equal(res.statusCode,503);assert.equal(res.body.code,'PAYMENTS_UNAVAILABLE');assert.equal(res.body.pixCode,undefined);});
test('rejeita origem diferente, método inválido e conteúdo incorreto',async()=>{assert.equal((await call('POST',{customer},{origin:'https://outro.example'})).statusCode,403);assert.equal((await call('DELETE')).statusCode,405);assert.equal((await call('POST',{customer},{'content-type':'text/plain'})).statusCode,400);});
test('rejeita JSON malformado, corpo grande, arrays e campos ausentes',async()=>{for(const input of ['{',[],null,{customer:null},{customer:{...customer,name:'a'.repeat(5000)}}])assert.equal((await call('POST',input)).statusCode,400);});
test('valida e normaliza os dados sem aceitar marcação como nome',()=>{const result=validateCustomer({...customer,name:'  Maria  da Silva  ',email:'PESSOA@EXAMPLE.COM',phone:'(11) 99999-9999'});assert.equal(result.valid,true);assert.equal(result.customer.name,'Maria da Silva');assert.equal(result.customer.email,'pessoa@example.com');assert.equal(validateCustomer({...customer,name:'<script> alert </script>'}).valid,false);assert.equal(validateCustomer({...customer,email:'not-an-email'}).valid,false);assert.equal(validateCustomer({...customer,phone:'00000000000'}).valid,false);assert.equal(validateCustomer(null).valid,false);});
test('status não confirma pagamentos por dados do cliente',()=>{const res=response();paymentStatus({method:'POST',body:{status:'paid'}},res);assert.equal(res.statusCode,503);assert.notEqual(res.body.status,'paid');});
