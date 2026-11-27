# Controle de Vendas v3 — Plano do sistema completo

> Projeto refeito do zero para a loja (nome público: "Minha loja").
> Pedido do Rafael em 27/11/2026 09:39 (t769u) e atualização às 09:41 (t770u: "a 2.0 tá fora de uso para manutenção").
> Fase 1 = plano + interface (este documento e as telas em `mockups/`). Nada foi publicado e o banco real não foi alterado.

## 1. Situação de hoje (lida no banco em 27/11, só leitura)

| Item | Hoje |
|---|---|
| Banco | Supabase grátis `zmsertdphnhaontkojqa` (São Paulo), 18 MB usados de 500 MB |
| Vendas | 7.319 linhas (7.307 ativas). **Só têm o valor**: não dizem qual produto foi vendido |
| Produtos | 57, unidades bagunçadas (`kg`, `Kg`, `uni`, `Uni`, `UNI`, `pet 2 L`, `cartela`) |
| Códigos de barras | 0 cadastrados |
| Entradas de estoque / custos | 0 (não existe histórico de custo ainda) |
| Encomendas / cobranças | 18 / 3 |
| Caixa da loja | usando o **app antigo** (Lovable); a rotina de hora em hora copia as vendas de lá para o banco novo |
| App 2.0 | fora de uso, em manutenção (t770u) |

Consequências para o plano:
- As vendas antigas continuam valendo para faturamento, mas **lucro por produto e "mais vendidos" só existem a partir das vendas da v3 com itens**. Vendas só com valor entram no relatório com lucro *estimado* pela margem média.
- Custo, margem, comparação de fornecedores e métrica diária de preços **começam a ter dados a partir da primeira entrada de mercadoria** registrada na v3.

## 2. Arquitetura

- **Um só código** (React + Vite + TypeScript) que vira:
  - **APK Android** (Capacitor) para os celulares;
  - **site instalável no PC** (PWA no Chrome do Windows → "Instalar app"), com layout largo e menu lateral.
- **Um só banco** (Supabase). Todos os aparelhos escutam o banco em **tempo real**: venda feita no celular aparece no PC na hora, e vice-versa.
- **Offline primeiro**: cada aparelho guarda tudo localmente (IndexedDB). Sem internet, continua vendendo; a fila sobe sozinha quando a conexão volta. Cada registro tem ID gerado no aparelho → reenviar nunca duplica.
- **Gravações importantes no servidor** (funções SQL): registrar venda com itens, dar entrada de mercadoria e ajustar estoque são feitas por uma função única no banco, que faz tudo de uma vez (ou nada). Isso evita estoque e custo errados quando dois aparelhos mexem ao mesmo tempo.
- **Tarefas automáticas no banco** (pg_cron, grátis):
  - 23:59 → fecha o relatório do dia (tabela `relatorios_diarios`);
  - 06:00 → recalcula sugestões de promoção;
  - todo dia → grava a métrica de preço de cada produto/fornecedor.
- **Ciclo automático que olha o app antigo**: continua a rotina de hora em hora (só leitura no app antigo, sem duplicar). Na v3 ela passa a gravar pela mesma função de vendas e aparece no Painel como "Cópia do app antigo: 09:00 ok". Desliga sozinha (avisa) quando o app antigo passar 24 h sem venda.

### Papéis e aparelhos

| Papel | Quem | O que pode |
|---|---|---|
| **Admin** | PC do Rafael e celular do Rafael | tudo: preços, custos, fornecedores, relatórios, aparelhos, versão mínima |
| **Caixa** | demais celulares | vender, ver produtos, registrar "chegou mercadoria", encomendas. Não vê lucro/custo nem apaga vendas antigas |

- Cada aparelho entra sozinho (sem nome e sem senha no dia a dia) e aparece em "Aparelhos e equipe".
- **Virar Admin** (uma vez por aparelho), de forma segura, por um destes caminhos:
  1. no aparelho que já é Admin, tocar "Adicionar aparelho Admin" → aparece um **QR/link de uso único que expira em 10 min**; o outro aparelho lê e vira Admin;
  2. ou digitar o **código de recuperação** (guardado só no computador do bot, nunca no chat).
- O Admin pode bloquear ou rebaixar qualquer aparelho na hora (ex.: celular perdido).
- As regras de segurança (RLS) ficam no banco: um Caixa não consegue ler custos nem mudar preços, mesmo mexendo no app.

## 3. Banco novo (schema v3)

Tudo dentro da loja `principal`. Todas as tabelas têm `id` (gerado no aparelho), `criado_em`, `atualizado_em`, `criado_por` (aparelho) e `excluido` (lixeira, nada é apagado de verdade).

| Tabela | Campos principais |
|---|---|
| `aparelhos` | id fixo do aparelho, nome ("Caixa 2", "PC do escritório"), papel (admin/caixa), bloqueado, versão do app, último acesso |
| `convites_admin` | código de uso único, expira_em, usado_por |
| `produtos` | nome, categoria, unidade (`kg`, `un`, `bandeja`, `maco`, `litro`...), preço, preço promocional + período, **margem desejada**, base do custo (média/última), **perda padrão %**, estoque mínimo, validade média (dias), fornecedor principal, ativo |
| `produto_codigos` | código de barras → produto (vários por produto, inclusive códigos de balança 2xxxxxx) |
| `fornecedores` | nome, tipo (Ceasa, produtor, distribuidor), telefone, observações |
| `entradas` (compras) | fornecedor, data, frete/outros, observação, quem registrou |
| `entrada_itens` | produto, **quantidade que chegou**, valor pago, custo unitário, perda %, validade estimada |
| `estoque_movimentos` | produto, tipo (entrada, venda, perda/descarte, ajuste, encomenda), quantidade (+/−), custo no momento |
| `produto_custos` (custo atual) | estoque atual, **custo médio ponderado**, custo da última compra — mantido pelas funções do banco |
| `precos_diarios` | dia, produto, fornecedor, menor/médio/maior custo do dia, preço de venda do dia → **métrica diária de preços** |
| `vendas` | total, forma de pagamento, troco, desconto, origem (`v3`, `app_antigo`, `importado`), aparelho |
| `venda_itens` | produto, quantidade, preço unitário, **custo unitário no momento da venda** (para lucro real) |
| `encomendas` | cliente, telefone, retirada/entrega, endereço, data/hora, status (pendente → separando → pronta → entregue / cancelada), **sinal**, valor, pago, forma |
| `encomenda_itens` | produto, quantidade, preço |
| `clientes` | nome, telefone, endereço (opcional, só para encomendas) |
| `cobrancas` | igual hoje (manual; Stone/PicPay continuam fora) |
| `promocoes_sugeridas` | produto, motivo(s), preço sugerido, margem resultante, status (nova/aceita/ignorada) |
| `relatorios_diarios` | dia, faturamento, custo, lucro, perdas, compras, mais vendidos, preços dos fornecedores (JSON) |
| `configuracao` | dados da loja, margem padrão, arredondamento de preço, modo de margem (sobre venda ou markup) |
| `app_versao` | `minima` (versionCode), `atual`, link do APK, novidades |
| `registro_atividades` | quem mudou o quê (preço, estoque, exclusões) |

### Migração de TODOS os dados (sem perda)

1. Backup completo (schema `backup_v3_AAAAMMDD` + arquivo JSON no computador do bot).
2. Criar as tabelas v3 **ao lado** das atuais (schema `v3`), sem apagar nada.
3. Copiar: vendas → `vendas` (origem `importado`, sem itens), produtos (unidades padronizadas: `kg/Kg` → `kg`, `uni/Uni/UNI` → `un`, demais revisados um a um), encomendas (texto do produto vira 1 item descritivo), cobranças, configuração.
4. Conferir contagens e somas **por dia** (antes = depois). Só passa se bater centavo por centavo.
5. Trocar o app e a rotina para o schema v3. As tabelas antigas ficam guardadas, somente leitura, por 30 dias.

## 4. Funções do app

### Celular (Caixa e Admin)
- **Caixa**: venda rápida só com valor (como hoje) **ou** venda com itens (leitor de código pela câmera, busca por nome, produto por kg com peso). Formas de pagamento, troco começando vazio, trava contra toque duplo.
- **Produtos**: busca por nome/código, filtros (kg, unidade, estoque baixo, vencendo), cadastro rápido com leitura do código.
- **Chegou mercadoria**: produto (ou leitor), fornecedor, quantidade que chegou, valor pago, perda %, frete → custo calculado, custo médio do estoque, **margem desejada (controle deslizante) → preço sugerido**; "manter preço" ou "usar sugerido".
- **Encomendas**: hoje / amanhã / atrasadas / entregues, itens, sinal e saldo, WhatsApp do cliente, separar → entregar (baixa no estoque).
- **Promoções**: sugestões com motivo e preço que ainda dá lucro; "criar promoção de X dias" com 1 toque.

### PC (Admin)
- **Painel ao vivo**: vendido hoje, lucro estimado, vendas, encomendas, estoque baixo, gráfico por hora (hoje × média do mesmo dia da semana), feed do que cada aparelho está fazendo, aparelhos conectados e versão de cada um.
- **Fornecedores e preços**: cadastro de fornecedores, gráfico de custo por fornecedor ao longo dos dias, "onde comprar mais barato hoje", exportar CSV.
- **Relatórios**: diário automático + semana/mês; faturamento, custo, lucro, perdas, compras, mais vendidos, formas de pagamento, preços dos fornecedores, alertas. Exportar PDF/planilha e compartilhar no WhatsApp.
- **Cadastro de produto com calculadora**: códigos de barras (**leitor USB** funciona como teclado no PC), estoque, mínimo, validade, perda, fornecedor principal, últimas entradas e tabela de margens.

### Regras de cálculo
- **Custo da compra** = (valor pago + parte do frete) ÷ (quantidade × (1 − perda%)).
- **Custo médio ponderado** = (estoque × custo médio + quantidade nova × custo novo) ÷ (estoque + quantidade nova). Opção de usar a última compra.
- **Preço sugerido** = custo ÷ (1 − margem) (margem sobre a venda), arredondado para ,49/,99 ou ,x9 (configurável). Opção de markup sobre o custo.
- **Promoção sugerida** quando: validade perto do fim; estoque alto para o giro (dias de estoque > 2× a média); custo caiu > 8% em 7 dias; margem atual acima da desejada. Nunca sugere preço abaixo do custo + 5%. Se a margem já está baixa, sugere trocar de fornecedor em vez de baixar o preço.

### Atualização obrigatória
- Ao abrir e a cada 15 min (e via tempo real), o app lê `app_versao`. Se `minima` > versão instalada → **tela "Nova versão disponível" que bloqueia o uso**, com botão para baixar o APK (no PC, o site recarrega sozinho).
- As vendas que estavam na fila ficam guardadas e sobem depois de atualizar.
- O próprio banco também recusa gravações de versões abaixo da mínima (proteção extra).

## 5. Nova chave do banco

- Usar a **chave publicável nova** do Supabase (`sb_publishable_…`) no lugar da chave anônima antiga (JWT).
- Como a 2.0 está fora de uso (t770u), **dá para desativar a chave antiga assim que a v3 estiver instalada** no PC e nos celulares — não há celulares na 2.0 para quebrar.
- Antes de desativar: conferir se a rotina de cópia do app antigo e os scripts do bot usam a chave antiga e trocá-los também.
- Nada de chave secreta (service_role) dentro do app; ela não vai para o APK nem para o site.
- A chave publicável só funciona junto com as regras de segurança (RLS); por isso as regras de papéis da seção 2 são parte obrigatória.

## 6. Etapas e estimativa

| Etapa | O que sai | Tempo estimado |
|---|---|---|
| 1. Plano e telas | este documento + 10 telas | ✅ feito |
| 2. Banco v3 em projeto de **teste** | tabelas, funções, regras, tarefas automáticas, testes de segurança | 1 dia |
| 3. Migração ensaiada | cópia completa no teste, conferência por dia | ½ dia |
| 4. App base | entrada automática, papéis, tempo real, offline, tela de atualização, layout celular + PC | 1–2 dias |
| 5. Caixa + produtos + leitor | venda com itens, códigos de barras (câmera e USB) | 1 dia |
| 6. Chegou mercadoria + fornecedores + calculadora | custo médio, margem, preço sugerido, métrica diária | 1 dia |
| 7. Encomendas + promoções + relatórios | relatório diário automático, PDF/planilha | 1–2 dias |
| 8. Testes completos | 2 celulares simulados + PC, offline, toque duplo, versões | 1 dia |
| 9. Virada | backup, migração real, nova chave, APK 3.0.0 + site, rotina ajustada, desativar chave antiga | ½ dia |

**Total: cerca de 7 a 9 dias de trabalho**, entregando por partes (primeiro Caixa + Produtos + Chegou mercadoria, que é o que a loja mais usa).

## 7. Decisões que só o Rafael pode tomar

1. **Venda com itens ou só valor?** Para ter lucro real e "mais vendidos", o caixa precisa registrar os produtos (leitor/busca). Proposta: os dois modos, venda rápida só com valor continua.
2. **Margem padrão** da loja (proposta: 35%) e **arredondamento** dos preços (,49/,99?).
3. **Quais aparelhos são Admin**: só o PC e o celular dele? O Caixa pode ver o lucro do dia?
4. **Estoque da v3 começa do zero ou com contagem?** Proposta: fazer uma contagem rápida no dia da virada.
5. **Quando o caixa sai do app antigo** e passa para a v3 (a cópia de hora em hora continua até lá).
6. **Lista de fornecedores** (nomes e telefones) — só ele tem.
7. Plano do Supabase continua **grátis** (cabe folgado: 18 MB de 500 MB).

## 8. Arquivos desta fase

- Protótipo: `prototipo/index.html` (abrir com `#cel-caixa`, `#pc-painel` etc.) e `prototipo/capturar.mjs`.
- Telas (PNG, dados de exemplo): `mockups/`
  - celular: `cel-caixa.png`, `cel-produtos.png`, `cel-chegou.png`, `cel-encomendas.png`, `cel-promocoes.png`, `cel-atualizar.png`
  - PC: `pc-painel.png`, `pc-fornecedores.png`, `pc-relatorio.png`, `pc-produto.png`

## Adicionado em 27/11 (pedido t771u): operador, vigia da sincronização e backup no GitHub

- **Nome do operador**: na primeira vez (e em “👤 trocar”) o app pergunta “Quem está no caixa?”. Dá para responder “Agora não”: o login anônimo, a entrada na loja e a sincronização rodam por trás sem esperar o nome. O nome só etiqueta as vendas (`v3_vendas.operador`) e aparece na lista do dia e na lista de aparelhos.
- **Vigia da sincronização** (em todo aparelho, a cada 2 min, ao reconectar e no botão):
  - o aparelho manda um “sinal de vida” (`v3_sync_sinal`) com fila pendente, atraso da mais antiga, operador e o que achou de diferença; recebe do servidor o manifesto por dia (quantidade, soma e hash dos ids);
  - compara com o que tem guardado (7 dias; “Reenviar tudo” = 34 dias). Dia diferente → pede os ids do dia (`v3_sync_ids`):
    - falta no servidor → reenvia a **cópia guardada no aparelho** (diário local de 40 dias com o pedido completo; reenvio não duplica);
    - falta no aparelho → baixa do servidor;
  - alerta “Sincronização atrasada X min · Y faltando · Reenviar” no celular e no PC; o Admin vê também o atraso dos outros aparelhos; em Ajustes → Sincronização há “🔁 Reenviar tudo”.
- **Backup no GitHub (repo privado `controle-de-vendas-dados`, pasta `v3/`)**: vendas por mês (com itens), entradas, estoque, cadastro, manifesto por dia; incremental e conferido dia a dia com o servidor (se não bater, baixa tudo). Leitura pela função `v3_backup_exportar`, protegida por chave (só o hash fica no banco).
- **Conferência no box** (`scripts/conferir-sync.mjs`): servidor × backup do GitHub × app antigo (cópia somente-leitura guardada no repo) × cópia da rotina (`public.vendas`).

## 3.0.0-teste.4 (27/11)
- Telas: encomendas, preços por fornecedor (gráfico), sugestões de promoção (Admin), relatórios diários (pg_cron `v3-rotina-diaria` 00:10 BRT) e painel do PC.
- Entrada de aparelhos padrão: convite QR de uso único (ou código de recuperação). APK sem código de entrada.
- Correção: `carregar()` não sobrescreve mudanças locais/tempo real feitas durante o download.
- Backup privado: `scripts/backup-agora.sh` (idempotente, sem login interativo) roda pela rotina horária.
- Nada ao vivo: caixa, migração para `principal` e chave anon antiga aguardam o OK do Rafael.

## 3.0.0-teste.5 (27/11)
- Decisão do Rafael (12:04): quem tem o APK entra sozinho como Caixa (sem QR/código); QR/recuperação só para virar Admin.
- Servidor: `v3_loja_segredos.caixa_automatico` (ligado em teste/ensaio; **principal desligado até a virada**), só `p_plataforma='android'`, trava de 30 entradas automáticas/hora.
- RLS: `v3_precos_diarios`, `v3_promocoes_sugeridas`, `v3_atividades`, `v3_cobrancas` só Admin lê. Caixa cria produto novo sempre com preço 0.
- Próximo: app novo em Flutter (pasta `flutter/` / repo novo), mesma base Supabase.

## Banca (app novo em Flutter) — 27/11
- Repositório: https://github.com/rafaelytofc7-spec/banca-app (público, sem nome da loja).
- 1.0.0-teste.1 (40001): APK na release v1.0.0-teste.1, painel web em https://rafaelytofc7-spec.github.io/banca-app/ (loja de teste "ensaio").
- Versões: linhas `banca-android`/`banca-web`/`banca-windows` em v3_app_versao (atual 40001, mínima 0).
- Windows: `ci/windows.yml` pronto, aguardando permissão `workflow` do gh.

## Virada para o Banca 1.0.0 — 27/11 (OK do Rafael 14:56, t773u)
- Backup antes: schema `backup_20261127_virada` no banco + `backups/2026-11-27-virada/` no repo privado de dados.
- Migração `v3_12b`: loja `principal` (antigo) → loja `principal` (v3), idempotente (id `leg-…` + legado_id). Contagens e total das vendas ativas iguais, 97 dias conferidos.
- Membros do app antigo só como histórico (`v3_membros_legado`, só Admin lê); não viram aparelhos.
- Cópia contínua: pg_cron `v3-sync-vendas-principal` (a cada 10 min) lê `public.vendas` (onde a rotina grava) e copia para a v3.
- `caixa_automatico` ligado na principal (trava de 30/hora). Banca 1.0.0 (40100) publicado; versão mínima 0.
- Teste: painel web de ensaio em https://rafaelytofc7-spec.github.io/banca-app/teste/
