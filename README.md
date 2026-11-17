# Cogumelos

Página de vendas responsiva, vídeo YouTube e checkout Pix de R$ 297,00. HTML/CSS/JS com funções Node.js na Vercel. Produção: https://cogumelos.vercel.app.

## Desenvolvimento

Node.js 22+. Instale com `pnpm install`, execute `pnpm dev`, `pnpm test` e `pnpm build`. Em ambientes Windows que bloqueiam subprocessos dos testes, use `node --test --test-isolation=none`.

O build copia somente `public/` para `dist/`. A Vercel empacota `api/` separadamente. Segredos, bibliotecas e arquivos de desenvolvimento não são servidos pelo site.

## Configuração privada

- `FIREBOT_SECRET_KEY`: chave privada da FireBot, somente no ambiente production da Vercel.
- `ORDER_TOKEN_SECRET`: segredo aleatório de pelo menos 32 caracteres para assinar consultas. Não rotacionar com pedidos em andamento sem plano de recuperação.
- `BLOB_STORE_ID`: store privado conectado ao projeto via Vercel OIDC. Alternativa local: `BLOB_READ_WRITE_TOKEN`.
- `SUPPORT_WHATSAPP`: `5575988393742`.

Sem qualquer configuração exigida, a criação e a consulta de pagamentos permanecem indisponíveis. Não há modo de simulação em produção. Alterações de ambiente exigem um novo deployment.

O store privado `cogumelos-orders` está conectado ao projeto em São Paulo. Credenciais não entram no Git. Não usar chaves de saque, variáveis públicas ou dados reais de clientes em testes.

## Contrato FireBot consultado

Documentação autenticada: https://firebotbr.com/integracoes/docs.

- `POST https://firebotbr.com/api/v1/pix/create`, cabeçalho `x-api-key`, `amount: 297` em reais, `productType: DIGITAL`, descrição, URL da loja e cliente com name/email/cpf/phone.
- Criação exige resposta com transactionId, amount, status PENDING e pixCopiaECola. QR gerado localmente no backend com `qrcode`.
- `GET /api/v1/pix/{transactionId}` com a chave privada consulta o pagamento. A resposta é validada por ID, valor e status; respostas sem esses dados não liberam acesso. O endpoint de consulta está documentado, mas o formato real da resposta ainda precisa ser confirmado com uma credencial liberada e pedido real do lojista.
- `POST /api/webhook` valida `x-signature` como HMAC-SHA256 do corpo bruto com a chave secreta. Considera somente eventos de venda e faz nova consulta autenticada. O webhook não concede acesso por conta própria. Sua configuração no painel FireBot ainda depende da conclusão da credencial; a consulta automática no checkout funciona independentemente do webhook.

## Fluxo e proteção contra duplicação

O preço é fixado em `lib/offer.js`, nunca aceito do navegador. CPF é validado nos dois lados. O servidor cria um registro imutável antes de chamar a FireBot, pois a documentação não informa idempotência nativa. Repetições recuperam o mesmo resultado. Uma resposta ambígua do provedor não é repetida automaticamente: o pedido permanece em consulta e deve ser reconciliado no painel FireBot antes de iniciar outro.

Claims, resultados e índice de transações ficam em Blob privado por 30 dias, sem nome, CPF ou contatos em texto. Identificadores de consulta assinados expiram após 30 dias. A sessão do navegador guarda apenas a chave de recuperação e o token de consulta. O limite de criação é de cinco tentativas por conexão por hora; os registros de limite expiram após um dia.

`POST /api/checkout`: `{customer:{name,email,phone,cpf}}`, cabeçalho `Idempotency-Key` UUIDv4. Resposta: `{amountCents,pixCode,statusToken,qrImage}`.

`POST /api/payment-status`: `{statusToken}` consulta ou `{resumeKey}` recupera um pedido. Somente PAID validado retorna o link de solicitação de acesso.

`/obrigado` verifica novamente o pedido antes de mostrar a confirmação e o botão WhatsApp. Sem pedido ou com Pix pendente, não apresenta sucesso. A entrega do curso é manual pelo atendimento, conforme solicitado pelo proprietário; não há área de alunos ou curso produzido neste repositório.

## Verificação e limitações

Os testes usam respostas simuladas em memória, sem chamadas financeiras reais. Cobrem validação, preço adulterado, CPF, métodos/origem, concorrência, recuperação, timeout, valor/ID divergentes, token forjado, HMAC e limite de tentativas. A integração real exige chave privada disponível, validação da autenticação e confirmação do contrato de consulta. Não declarar pagamentos ativos apenas porque os testes passaram.

Identidade visual provisória Cogumelos, textos próprios, tema inspirado em amoki.com.br. O vídeo `8jJKj--y1Ic` foi fornecido pelo usuário e é incorporado via YouTube, iniciando em 1 segundo. A imagem `public/assets/cultivo.png` foi criada por ImageGen e é ilustrativa. Os módulos são uma proposta editorial, não material didático produzido.
