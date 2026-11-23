# Como ligar a nuvem

A nuvem já vem configurada neste aplicativo (projeto `controle-de-vendas-bddb9`). Não é preciso colar a configuração web. A partir da 1.8.0 a entrada é só com o nome: o acesso anônimo do Firebase identifica o aparelho, e qualquer pessoa autenticada entra na loja compartilhada escrevendo o nome. O Admin atual é preservado.

## 1.8.0 — publicar as regras (obrigatório)

A 1.8.0 só inclui um usuário novo depois que o arquivo [`rules/firestore.rules`](rules/firestore.rules) desta versão estiver publicado no Console. A publicação é feita no navegador, não pelo aplicativo.

Entre em [Firebase Console](https://console.firebase.google.com/project/controle-de-vendas-bddb9) com a conta dona do projeto.

1. **Authentication → Sign-in method → Anonymous → Enable → Save.**
2. **Firestore Database → Rules.** Apague o texto atual, cole o conteúdo integral de [`rules/firestore.rules`](rules/firestore.rules) e toque em **Publish**.
3. Em **Authentication → Settings → Authorized domains**, confirme `localhost` e `rafaelytofc7-spec.github.io`.

Endereços diretos:

- Autenticação: https://console.firebase.google.com/project/controle-de-vendas-bddb9/authentication/providers
- Regras: https://console.firebase.google.com/project/controle-de-vendas-bddb9/firestore/rules

Enquanto as regras da 1.8.0 não forem publicadas, a 1.8.0 não consegue incluir um aparelho novo só com o nome. A 1.7.2 continua funcionando com essas regras novas (ainda pede o PIN na tela, e o ingresso antigo segue válido).

## No celular ou no site (depois das regras)

1. Instale o APK 1.8.0 ou abra o site atualizado. No primeiro uso, importe o arquivo de backup se os dados ainda não estiverem no aparelho (por exemplo `caixa-importacao-2026-11-22-2049.json`, com mesclar pelo id).
2. Abra o aplicativo com internet nesta primeira entrada.
3. Escreva o seu nome e toque em **Entrar**. Se a loja já existe, você entra na equipe. O primeiro aparelho de uma loja nova vira o Admin; o Admin já existente não muda. Anote o código de recuperação de 8 caracteres (aparelho do Admin) e guarde fora do telefone.
4. A sincronização começa sozinha. O botão **Sincronizar agora** em **Mais → Ajustes → Nuvem** só é preciso para forçar uma nova tentativa.
5. Nos outros aparelhos, cada pessoa informa só o próprio nome. Não há convite por e-mail nem PIN compartilhado.
6. O Admin gerencia a equipe (bloquear ou remover) e pode passar a liderança em **Mais → Administração**.

Se o aparelho do Admin for perdido, na tela de entrada ou em Nuvem use **Tenho um código de recuperação** com o código de 8 caracteres.

## Substituição (opcional)

Se quiser usar outro projeto Firebase, cole o objeto de configuração web em **Mais → Ajustes → Nuvem** e toque em **Salvar substituição**. Ligue o acesso anônimo e publique as mesmas regras nesse projeto. Para voltar, use **Usar nuvem padrão**.

O texto completo também aparece no aplicativo, em **Mais → Ajustes → Guia**.

## Google Drive (opcional, no site)

No Google Cloud do mesmo projeto, ative a API do Google Drive, crie um ID do cliente OAuth (aplicativo da Web) com a origem `https://rafaelytofc7-spec.github.io` e inclua o campo `googleClientId` no JSON da nuvem. No Android o backup por arquivo não depende disso.

## Segurança

- Qualquer usuário autenticado (acesso anônimo) pode criar o próprio documento em `membros` com um nome e entrar na loja.
- Só quem está na equipe e não está bloqueado lê ou grava os dados da loja.
- Só o Admin altera membros, o código de recuperação e as configurações da loja. O `liderUid` existente é preservado.
- Dados importados do backup antigo vêm marcados como “importado” e só o Admin envia à nuvem.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.
