export const GUIA_FIREBASE = `Antes de usar a versão 1.8.0 (entrada só com o nome)
1. No Console do Firebase do projeto oficial (console.firebase.google.com), abra Authentication e confirme que o acesso anônimo está ligado.
2. Em Firestore → Regras, publique o arquivo rules/firestore.rules desta versão (a publicação é feita no navegador, não pelo aplicativo). Sem essas regras, a 1.8.0 não consegue incluir um usuário novo só com o nome.
3. A loja já existente em lojas/principal é mantida. O Admin atual continua Admin (o liderUid não muda).

Primeiro uso e outros aparelhos
4. Instale o APK 1.8.0 (ou abra o site atualizado) e, no primeiro uso, importe o arquivo de backup se ainda não tiver os dados neste aparelho (caixa-importacao-2026-11-22-2049.json, mesclar pelo id).
5. Confirme que o aparelho está online nesta primeira entrada.
6. No primeiro aparelho, escreva o seu nome e toque em Entrar. Se a loja já existe, você entra como membro (ou como Admin, se este já era o aparelho do Admin). Se for uma loja nova, esse aparelho vira o Admin. Anote o código de recuperação de 8 caracteres e guarde fora do telefone.
7. Nos outros aparelhos, cada pessoa escreve só o próprio nome na tela de entrada. Todos passam a usar o mesmo banco. Não é mais preciso PIN.
8. O Admin gerencia a equipe (bloquear ou remover), vê atividades e pode passar o papel de Admin em Mais → Administração.

Se o aparelho do Admin for perdido
Na tela de entrada (ou em Ajustes → Nuvem), use “Tenho um código de recuperação” e informe o código de 8 caracteres. O papel de Admin passa para o aparelho atual.

Substituição (opcional)
Se quiser usar outro projeto Firebase, cole o objeto de configuração web em Mais → Ajustes → Nuvem e toque em “Salvar substituição”. Ligue também o acesso anônimo e publique as mesmas regras nesse projeto. Para voltar, use “Usar nuvem padrão”.

Google Drive (opcional, no site)
9. No Google Cloud do mesmo projeto (console.cloud.google.com), ative a API do Google Drive.
10. Credenciais → Criar credenciais → ID do cliente OAuth (aplicativo da Web).
11. Em origens JavaScript autorizadas, coloque o endereço do site (https://rafaelytofc7-spec.github.io). No Android o backup por arquivo (compartilhar / salvar) não depende disso.
12. Copie o ID do cliente e cole um JSON só com o campo extra "googleClientId" junto da configuração, como substituição, ou acrescente esse campo ao JSON padrão.

Segurança
- Qualquer pessoa autenticada (acesso anônimo do Firebase) pode entrar na loja com um nome e criar o próprio registro em membros. Não há mais PIN compartilhado.
- Só quem está na equipe e não está bloqueado lê ou grava os dados da loja.
- Só o Admin altera membros, o código de recuperação e as configurações da loja. O liderUid existente é preservado.
- Cada registro guarda quem criou e quem atualizou. Dados importados do backup antigo vêm marcados como “importado” e só o Admin envia à nuvem.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.`;
