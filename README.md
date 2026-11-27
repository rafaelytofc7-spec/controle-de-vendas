# Controle de Vendas v3

App de caixa, produtos e estoque para uma loja de hortifrúti ("Minha loja"). Um código só para o celular (APK Android, Capacitor) e para o PC (site instalável, PWA), no mesmo banco Supabase, em tempo real e funcionando offline.

- `PLANO.md` — plano completo (arquitetura, banco, etapas)
- `supabase/` — schema v3 (tabelas `v3_*`), funções, regras de segurança e migração
- `app/` — o aplicativo (React + Vite + TypeScript)
- `mockups/`, `prototipo/` — telas de exemplo (dados fictícios)

Etapa 1 (teste): Caixa (venda com itens ou só valor), leitor de código (câmera e leitor USB), Produtos, Chegou mercadoria (custo médio, perda, frete, margem e preço sugerido), Fornecedores, Contagem de estoque, aparelhos Admin/Caixa por QR, atualização obrigatória.

Build: as chaves e códigos vêm de variáveis de ambiente (`VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_LOJA_ID`, `VITE_CODIGO_ENTRADA` só no APK, `VITE_NOME_LOJA_PADRAO`). Nada disso fica no repositório.
