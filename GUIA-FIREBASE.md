# Como ligar a nuvem

A nuvem já vem configurada neste aplicativo (projeto `controle-de-vendas-bddb9`). Não é preciso colar a configuração web.

1. Instale o APK ou abra o site. No primeiro uso, importe o arquivo de backup se os dados ainda não estiverem no aparelho.
2. Abra **Mais → Ajustes → Nuvem**.
3. Crie a primeira conta com e-mail e senha e entre. Essa conta vira a dona da loja.
4. Toque em **Sincronizar agora**. Os dados locais sobem para a nuvem em lotes.
5. Para outras pessoas, a dona abre **Mais → Administração**, adiciona o e-mail e pede que a pessoa instale o app e entre com e-mail e senha. Quem foi convidado usa o caixa normalmente. Só a dona gerencia a equipe, o registro de atividades e as configurações da loja.

## Substituição (opcional)

Se quiser usar outro projeto Firebase, cole o objeto de configuração web em **Mais → Ajustes → Nuvem** e toque em **Salvar substituição**. Para voltar, use **Usar nuvem padrão**.

O passo a passo completo para um projeto novo (Firestore em modo de produção, Authentication com e-mail e senha, domínio `localhost` no Android e `rafaelytofc7-spec.github.io` no site, e as regras de `rules/firestore.rules`) continua disponível no aplicativo, em **Mais → Ajustes → Guia**.

## Google Drive (opcional, no site)

No Google Cloud do mesmo projeto, ative a API do Google Drive, crie um ID do cliente OAuth (aplicativo da Web) com a origem `https://rafaelytofc7-spec.github.io` e inclua o campo `googleClientId` no JSON da nuvem. No Android o backup por arquivo não depende disso.

## Segurança

- Só quem está autenticado e é membro (e não está bloqueado) lê ou grava os dados da loja.
- Só a conta dona altera membros e as configurações da loja.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.
