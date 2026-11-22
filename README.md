# Controle de Vendas

Aplicativo de caixa, cardápio, entregas e livro de vendas. Funciona no celular e no computador, inclusive sem internet.

## O que ele faz

- Calculadora em centavos, com apagar o último dígito, contas, soma dos últimos números (expira em 5 minutos), troco e registro da venda.
- Livro caixa com totais do dia, da semana, do mês e geral, calendário de faturamento e ticket médio.
- Cardápio com promoções agendadas e compartilhamento pelo WhatsApp.
- Entregas com situação (pendente, a caminho, entregue) e WhatsApp.
- Encomendas, reabastecimento (custo e preço sugerido) e cobranças **manuais de teste**.
- Dados no aparelho (IndexedDB). Quando houver internet e você estiver autenticado, a sincronização é nos dois sentidos com o Cloud Firestore.
- Backup por arquivo JSON e, se você configurar o Google, o botão “Salvar no Google Drive”.

Este aplicativo **não** envia cobranças reais para Stone ou PicPay e **não** guarda tokens de maquininha.

## Abrir no celular

Depois de publicado no GitHub Pages, abra o endereço do site no navegador do telefone e use “Adicionar à tela inicial”.

Enquanto a publicação não estiver no ar, no computador:

```bash
npm install
npm run dev
```

O endereço local usa o caminho `/controle-de-vendas/`.

## Primeiro uso e os seus dados

O histórico de vendas **não** entra neste repositório (são dados da loja). No primeiro uso, importe o arquivo JSON de backup que você recebeu em separado (repositório privado de dados, ou o arquivo enviado para o seu computador). Você também pode começar do zero.

## Ligar a nuvem

A nuvem já vem configurada (projeto `controle-de-vendas-bddb9`). Abra **Mais → Ajustes → Nuvem**, crie uma conta com e-mail e senha e entre. A primeira conta vira a dona da loja. As outras pessoas são adicionadas por e-mail no painel **Mais → Administração**. Elas usam o aplicativo normalmente. Só a dona gerencia a equipe, vê o registro de atividades, o faturamento por pessoa e altera as configurações da loja. Não há cargos.

O detalhe está no aplicativo, em **Mais → Ajustes → Guia**, e no arquivo [GUIA-FIREBASE.md](GUIA-FIREBASE.md). Se quiser outro projeto Firebase, a tela Nuvem ainda aceita colar uma configuração alternativa.

## Aplicativo Android

O APK de cada versão fica em [Releases](https://github.com/rafaelytofc7-spec/controle-de-vendas/releases). No Firebase, inclua `localhost` nos domínios autorizados. No Android, use e-mail e senha (o login com o Google em geral não abre a janela de conta no WebView). Importe o backup pelo seletor de arquivos do aparelho; o histórico da loja **não** vem embutido no APK.

## Testes

```bash
npm test          # matemática, promoções, importação
npm run build
npm run test:e2e  # precisa do backup privado no caminho local de desenvolvimento
```

## Licença

Uso privado do dono do repositório.

## Publicação

O site é publicado na branch `gh-pages`. O arquivo `docs/github-pages-workflow.yml` pode ser usado depois, se o token do GitHub tiver permissão de workflow.
