# Cogumelos

Landing page responsiva e checkout em duas etapas para um curso de R$ 297,00 no Pix. HTML, CSS e JavaScript, com funções Node.js na Vercel, sem dependências de runtime.

## Executar

Node.js 22 ou superior.

```sh
npm run dev
npm test
npm run build
```

Preview: http://127.0.0.1:3000. O build copia `public/` para `dist/`. A Vercel publica `dist/` e empacota `api/` como funções serverless.

## Estado real do pagamento

**O Pix não está integrado e não recebe pagamentos nesta versão.** A documentação fornecida (`https://firebotbr.com/integracoes/docs`) exigiu login e não foi possível verificar o contrato da API. Nenhum endpoint ou payload de provedor foi inventado. `lib/firebot.js` permanece fechado, `GET /api/checkout` informa `available: false`, e a tentativa de pagamento retorna HTTP 503. Os dados digitados no checkout não são enviados enquanto essa função está desativada.

A interface de revisão, Pix copia e cola, QR em PNG inline e estados de confirmação está preparada para o contrato interno abaixo. Isso não significa que a API FireBot use esses campos.

### Para concluir a integração

1. Consultar a documentação autenticada e confirmar se o provedor desejado é FireBot (URL fornecida) ou PayPix (nome citado no pedido).
2. Implementar criação e consulta em `lib/firebot.js` conforme a documentação, com segredo exclusivamente em variável privada da Vercel. Nunca commitar chaves ou usar variáveis públicas para elas.
3. Persistir pedidos, identificadores do provedor e chaves de idempotência em armazenamento durável. Repetir uma tentativa deve recuperar o mesmo pedido, inclusive após timeout ou recarga. A chave mantida no navegador só evita cliques repetidos durante a mesma navegação; não substitui persistência no servidor.
4. Validar webhooks assinados conforme o provedor e verificar valor, moeda e identidade do pedido no servidor. Implementar `api/payment-status.js` com token de consulta imprevisível ou assinado, expiração e proteção contra abuso. Nunca aceitar status `paid` enviado pelo navegador.
5. Integrar a entrega/área do aluno escolhida e publicar os dados do vendedor, suporte, conteúdo, duração de acesso e condições comerciais. Os textos atuais identificam expressamente a oferta como em preparação.
6. Testar criação, duplicidade, timeout, expiração, cancelamento e confirmação em sandbox do provedor. Só então alterar `isPaymentAvailable()`.

### Contrato interno esperado

`POST /api/checkout`: JSON `{ customer: { name, email, phone } }`, cabeçalho `Idempotency-Key`. Valor definido exclusivamente em `lib/offer.js`: 29700 centavos. A resposta futura deverá conter `amountCents`, `pixCode`, `statusToken` e opcionalmente `qrImage` (PNG data URI). A criação do QR deve ocorrer no servidor, sem enviar o código a geradores públicos de QR.

`POST /api/payment-status`: JSON `{ statusToken }`; resposta interna `{ status: 'pending' | 'paid' | 'expired' | 'cancelled' }` obtida do servidor/provedor autenticado.

## Referência e identidade

Referência de estrutura e tema: https://www.amoki.com.br/. O botão da referência abre um formulário de nome, e-mail e WhatsApp antes do checkout. Não foi enviado cadastro à AMOKI; o checkout final da Hotmart não foi acessado. O redesign usa a identidade provisória **Cogumelos**, textos próprios e não reutiliza marca, depoimentos, CNPJ ou contatos da referência. O conteúdo dos módulos é uma proposta editorial para revisão, não um curso produzido ou uma área de alunos entregue.

## Imagem

`public/assets/cultivo.png`: imagem ilustrativa criada com a ferramenta integrada ImageGen. Prompt: fotografia editorial vertical de cogumelos ostra creme e cinza crescendo em um bloco de substrato sobre uma bancada de madeira, fundo verde floresta desfocado, luz natural lateral suave, texturas orgânicas, sem pessoas, logotipos ou texto. A imagem não documenta uma produção real.

## Verificação

`npm test` cobre validação, normalização, preço fixo, adulteração de valor, métodos, origem, JSON/corpo inválido e bloqueio de criação/confirmação sem provedor. O servidor local só escuta em 127.0.0.1. Arquivos locais e segredos não são publicados por ele.
