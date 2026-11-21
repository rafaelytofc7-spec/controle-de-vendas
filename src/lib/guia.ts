export const GUIA_FIREBASE = `Passo a passo (cerca de 10 minutos)

1. Abra https://console.firebase.google.com e entre com a sua conta Google.
2. Clique em “Adicionar projeto”, dê um nome genérico (por exemplo, controle-de-vendas) e conclua. Não é obrigatório ativar o Analytics.
3. No projeto, vá em Compilação → Firestore Database → Criar banco de dados.
   - Escolha o modo de produção.
   - Escolha a região mais perto (ex.: southamerica-east1).
4. Ainda no Firestore, abra a aba Regras. Cole o conteúdo do arquivo rules/firestore.rules deste aplicativo e publique.
5. Vá em Compilação → Authentication → Começar.
   - Ative o provedor “E-mail/senha”. Este é o modo recomendado, principalmente no aplicativo Android.
   - O login com o Google no site (navegador) pode funcionar. No aplicativo Android (WebView) a janela do Google em geral não abre; use e-mail e senha.
   - Em Autenticação → Configurações → Domínios autorizados, inclua:
     • o endereço do site: rafaelytofc7-spec.github.io
     • localhost (obrigatório no aplicativo Android / Capacitor, que usa https://localhost)
6. Vá na engrenagem (Configurações do projeto) → Seus aplicativos → Web (ícone </>).
   - Registre um app web.
   - Copie o objeto firebaseConfig (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
7. Neste aplicativo, abra Mais → Ajustes → Nuvem, cole o objeto e toque em Salvar configuração.
8. Crie a primeira conta com e-mail e senha e entre. Essa conta vira a dona da loja e, na primeira sincronização, envia os dados locais em lotes.
9. Para outras pessoas: a dona abre Mais → Administração, adiciona o e-mail da pessoa e pede que ela instale o app, cole a mesma configuração e entre com e-mail e senha. Quem foi convidado passa a usar o app normalmente (caixa, cardápio, entregas). Só a dona gerencia a equipe, o registro de atividades e as configurações da loja.
10. Para bloquear ou remover alguém, use o mesmo painel de Administração.

Google Drive (opcional, no site)
11. No Google Cloud do mesmo projeto (console.cloud.google.com), ative a API do Google Drive.
12. Credenciais → Criar credenciais → ID do cliente OAuth (aplicativo da Web).
13. Em origens JavaScript autorizadas, coloque o endereço do site (https://rafaelytofc7-spec.github.io). No Android o backup por arquivo (compartilhar / salvar) não depende disso.
14. Copie o ID do cliente e inclua no JSON da nuvem, no campo "googleClientId".

Segurança
- Só quem está autenticado e é membro (e não está bloqueado) lê ou grava os dados da loja.
- Só a conta dona altera membros e as configurações da loja.
- Cada registro guarda quem criou e quem atualizou. Dados importados do backup antigo vêm marcados como “importado”.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.`;
