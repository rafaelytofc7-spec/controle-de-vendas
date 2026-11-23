export const GUIA_FIREBASE = `A nuvem já vem ligada neste aplicativo (projeto controle-de-vendas-bddb9). Você não precisa colar nenhuma configuração.

Antes de usar a versão com PIN (1.5.0)
No Console do Firebase (projeto controle-de-vendas-bddb9, conta dona do projeto):
1. Authentication → Sign-in method → Anonymous → Enable → Save. O e-mail e senha pode ficar ligado até todos atualizarem; depois da troca, pode desligar.
2. Firestore Database → Rules → apague o texto atual, cole o conteúdo do arquivo rules/firestore.rules deste repositório e toque em Publish.
3. Confirme que em Authentication → Settings → Authorized domains estão localhost e rafaelytofc7-spec.github.io.

Enquanto essas regras novas não forem publicadas, não instale a 1.5.0 no lugar da 1.4.0: o aplicativo antigo (e-mail) deixa de sincronizar, e o novo (PIN) ainda não entra.

No celular ou no site (depois das regras)
1. Instale o APK 1.7.1 (ou abra o site atualizado) e, no primeiro uso, importe o arquivo de backup se ainda não tiver os dados neste aparelho (caixa-importacao-2026-11-22-2049.json, mesclar pelo id).
2. Na primeira abertura aparece a tela de entrada. É preciso ter internet nesta primeira vez.
3. No primeiro aparelho, escreva o seu nome e o PIN combinado (4 a 8 números) e toque em Entrar. Esse aparelho vira o Admin. Anote o código de recuperação de 8 caracteres e guarde fora do telefone. Se este aparelho já tinha vendas, elas sobem sozinhas para o banco compartilhado.
4. A sincronização começa sozinha. Não é preciso ir em Ajustes nem tocar em sincronizar. Depois o aplicativo funciona sem internet e envia as mudanças quando a conexão voltar.
5. Nos outros aparelhos, cada pessoa escreve o próprio nome e o mesmo PIN na tela de entrada. Todos passam a usar o mesmo banco.
6. O Admin gerencia a equipe, troca o PIN, vê atividades e pode passar o papel de Admin em Mais → Administração.

Se o aparelho do Admin for perdido
Na tela de entrada (ou em Ajustes → Nuvem), use “Tenho um código de recuperação”, informe o PIN e o código de 8 caracteres. O papel de Admin passa para o aparelho atual.

Substituição (opcional)
Se quiser usar outro projeto Firebase, cole o objeto de configuração web em Mais → Ajustes → Nuvem e toque em “Salvar substituição”. Ligue também o acesso anônimo e publique as mesmas regras nesse projeto. Para voltar, use “Usar nuvem padrão”.

Google Drive (opcional, no site)
7. No Google Cloud do mesmo projeto (console.cloud.google.com), ative a API do Google Drive.
8. Credenciais → Criar credenciais → ID do cliente OAuth (aplicativo da Web).
9. Em origens JavaScript autorizadas, coloque o endereço do site (https://rafaelytofc7-spec.github.io). No Android o backup por arquivo (compartilhar / salvar) não depende disso.
10. Copie o ID do cliente e cole um JSON só com o campo extra "googleClientId" junto da configuração, como substituição, ou acrescente esse campo ao JSON padrão.

Segurança
- O PIN fica num documento privado que ninguém lê pelo cliente; as regras conferem o valor com get().
- Só quem entrou com o PIN certo (e não está bloqueado) lê ou grava os dados da loja.
- Só o Admin altera membros, o PIN e as configurações da loja.
- Tentativas erradas ganham espera crescente e, depois de muitas, um bloqueio temporário.
- Cada registro guarda quem criou e quem atualizou. Dados importados do backup antigo vêm marcados como “importado”.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.`;
