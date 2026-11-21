# Controle de Vendas

Aplicativo de caixa, cardápio, entregas e livro de vendas. Funciona no celular e no computador, inclusive sem internet.

## O que ele faz

- Calculadora em centavos, com apagar o último dígito, contas, soma dos últimos números (expira em 5 minutos), troco e registro da venda.
- Livro caixa com totais do dia, da semana, do mês e geral, calendário de faturamento e ticket médio.
- Cardápio com promoções agendadas e compartilhamento pelo WhatsApp.
- Entregas com situação (pendente, a caminho, entregue) e WhatsApp.
- Encomendas, reabastecimento (custo e preço sugerido) e cobranças **manuais de teste**.
- Dados no aparelho (IndexedDB). Quando houver internet e o Firebase estiver configurado, a sincronização é nos dois sentidos com o Cloud Firestore.
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

## Ligar o Firebase

O passo a passo está no aplicativo, em **Mais → Ajustes → Guia**, e também no arquivo [GUIA-FIREBASE.md](GUIA-FIREBASE.md). Em resumo: você cria o projeto, ativa Firestore e Authentication, cola a configuração web no app e publica as regras de `rules/firestore.rules`. Só quem entra com uma conta autorizada da loja consegue ler ou gravar na nuvem.

## Testes

```bash
npm test          # matemática, promoções, importação
npm run build
npm run test:e2e  # precisa do backup privado no caminho local de desenvolvimento
```

## Licença

Uso privado do dono do repositório.
