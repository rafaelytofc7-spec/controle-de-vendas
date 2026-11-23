# Como ligar a nuvem

A nuvem já vem configurada neste aplicativo (projeto `controle-de-vendas-bddb9`). Não é preciso colar a configuração web. O acesso deixou de ser por e-mail: o primeiro aparelho que entra com o PIN vira o líder, e os demais usam o mesmo PIN e o mesmo banco.

## Mudanças no Console do Firebase (obrigatórias antes da 1.5.0)

Entre em [Firebase Console](https://console.firebase.google.com/project/controle-de-vendas-bddb9) com a conta dona do projeto.

1. **Authentication → Sign-in method → Anonymous → Enable → Save.**  
   O provedor E-mail/senha pode permanecer ligado até todos atualizarem o aplicativo. Depois da troca, pode ser desligado.
2. **Firestore Database → Rules.** Apague o texto atual, cole o conteúdo integral de [`rules/firestore.rules`](rules/firestore.rules) e toque em **Publish**.
3. Em **Authentication → Settings → Authorized domains**, confirme `localhost` e `rafaelytofc7-spec.github.io`.

Endereços diretos:

- Autenticação: https://console.firebase.google.com/project/controle-de-vendas-bddb9/authentication/providers
- Regras: https://console.firebase.google.com/project/controle-de-vendas-bddb9/firestore/rules

Enquanto as regras novas não forem publicadas, **não** troque o site nem o APK da 1.4.0 pela 1.5.0: o aplicativo antigo (e-mail) deixa de sincronizar, e o novo (PIN) ainda não entra.

## No celular ou no site (depois das regras)

1. Instale o APK 1.5.0 ou abra o site atualizado. No primeiro uso, importe o arquivo de backup se os dados ainda não estiverem no aparelho (por exemplo `caixa-importacao-2026-11-22-2049.json`, com mesclar pelo id).
2. Abra **Mais → Ajustes → Nuvem**.
3. No primeiro aparelho, informe o nome de exibição e o PIN combinado (4 a 8 números) e toque em **Entrar com o PIN**. Esse aparelho vira o líder. Anote o código de recuperação de 8 caracteres e guarde fora do telefone.
4. Toque em **Sincronizar agora**. Os dados locais sobem para a nuvem. Quem entrar com o mesmo PIN passa a usar o mesmo banco.
5. Nos outros aparelhos, cada pessoa informa o próprio nome e o mesmo PIN. Não há convite por e-mail.
6. O líder gerencia a equipe, troca o PIN e pode passar a liderança em **Mais → Administração**.

Se o aparelho do líder for perdido, na tela Nuvem use **Tenho um código de recuperação** com o PIN e o código de 8 caracteres.

## Substituição (opcional)

Se quiser usar outro projeto Firebase, cole o objeto de configuração web em **Mais → Ajustes → Nuvem** e toque em **Salvar substituição**. Ligue o acesso anônimo e publique as mesmas regras nesse projeto. Para voltar, use **Usar nuvem padrão**.

O texto completo também aparece no aplicativo, em **Mais → Ajustes → Guia**.

## Google Drive (opcional, no site)

No Google Cloud do mesmo projeto, ative a API do Google Drive, crie um ID do cliente OAuth (aplicativo da Web) com a origem `https://rafaelytofc7-spec.github.io` e inclua o campo `googleClientId` no JSON da nuvem. No Android o backup por arquivo não depende disso.

## Segurança

- O PIN fica num documento privado ilegível pelo cliente; as regras conferem o valor com `get()`.
- Só quem entrou com o PIN certo (e não está bloqueado) lê ou grava os dados da loja.
- Só o líder altera membros, o PIN e as configurações da loja.
- Tentativas erradas ganham espera crescente e, depois de muitas, um bloqueio temporário.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.
