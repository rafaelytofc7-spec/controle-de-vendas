# Como ligar o Firebase

Passo a passo (cerca de 10 minutos)

1. Abra https://console.firebase.google.com e entre com a sua conta Google.
2. Clique em “Adicionar projeto”, dê um nome genérico (por exemplo, controle-de-vendas) e conclua. Não é obrigatório ativar o Analytics.
3. No projeto, vá em Compilação → Firestore Database → Criar banco de dados.
   - Escolha o modo de produção.
   - Escolha a região mais perto (ex.: southamerica-east1).
4. Ainda no Firestore, abra a aba Regras. Cole o conteúdo do arquivo rules/firestore.rules deste aplicativo e publique.
5. Vá em Compilação → Authentication → Começar.
   - Ative o provedor “E-mail/senha”.
   - Se quiser entrar com o Google, ative também o provedor Google.
   - Em Autenticação → Configurações → Domínios autorizados, inclua o endereço do site (por exemplo, rafaelytofc7-spec.github.io).
6. Vá na engrenagem (Configurações do projeto) → Seus aplicativos → Web (ícone </>).
   - Registre um app web.
   - Copie o objeto firebaseConfig (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
7. Neste aplicativo, abra Mais → Nuvem, cole o objeto e toque em Salvar configuração.
8. Crie uma conta (e-mail e senha) ou entre com o Google. Na primeira sincronização, a conta vira dona da loja e envia os dados locais em lotes.
9. Para outros aparelhos da mesma loja: instale o app, cole a mesma configuração, entre com uma conta e, no Firestore, o dono deve incluir o e-mail dessa conta no campo membrosEmails do documento lojas/{codigo-da-loja}, ou entrar primeiro no mesmo aparelho.

Google Drive (opcional)
10. No Google Cloud do mesmo projeto (console.cloud.google.com), ative a API do Google Drive.
11. Credenciais → Criar credenciais → ID do cliente OAuth (aplicativo da Web).
12. Em origens JavaScript autorizadas, coloque o endereço do site (https://rafaelytofc7-spec.github.io).
13. Copie o ID do cliente e inclua no JSON da nuvem, no campo "googleClientId".
14. Sem isso, o backup por arquivo (Baixar / Importar) continua funcionando normalmente.

Segurança
- Só quem está autenticado e é membro da loja consegue ler ou gravar no Firestore.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.
