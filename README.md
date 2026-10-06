# Deia Cakes

PWA simples para controle de pedidos, clientes, pagamentos e produção.

## O que já tem

- cadastro de produtos
- cadastro de clientes
- pedidos com vários itens
- status do pedido separado do status do pagamento
- pagamentos parciais
- contas a receber
- resumo mensal
- lista de produção por data
- funcionamento local sem banco
- suporte a Supabase
- moeda sempre em Real no padrão pt-BR

## Rodar local

```bash
npm install
npm run dev
```

Sem variáveis de ambiente o app usa o navegador como armazenamento local.

## Conectar ao Supabase

1. Crie um projeto no Supabase.
2. Rode o arquivo `supabase/schema.sql` no SQL Editor.
3. Copie `.env.example` para `.env.local`.
4. Preencha:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

5. Reinicie o app.

## Observação de segurança

As policies do arquivo SQL estão abertas para facilitar o primeiro protótipo. Antes de colocar dados reais em produção, adicionar autenticação e restringir as policies ao usuário autorizado.
