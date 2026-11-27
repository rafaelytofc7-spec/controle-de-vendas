export const GUIA_FIREBASE = `Antes de usar a versão 2.0.0 (nuvem no Supabase, entrada automática)
1. O aplicativo já entra no projeto oficial da nuvem. Não é preciso colar chave nem arquivo de configuração.
2. No painel do Supabase (Authentication → Providers), o login anônimo precisa estar ligado. Sem isso, o aparelho não conecta à loja.
3. O histórico oficial já está na nuvem. Todos os aparelhos que entram com um nome passam a ver as mesmas vendas, produtos e encomendas.

Primeiro uso e outros aparelhos
4. Instale o APK 2.0.0 (ou abra o site atualizado). Se este aparelho ainda não tiver os dados, eles descem da nuvem sozinhos.
5. Confirme que o aparelho está online nesta primeira entrada.
6. Escreva o seu nome e toque em Entrar. Se a loja já existe, você entra como membro. O Admin (Rafael) reivindica o papel com “Tenho um código de recuperação” e o próprio nome. Anote o código de 8 caracteres e guarde fora do telefone.
7. Nos outros aparelhos, cada pessoa escreve só o próprio nome na tela de entrada. Todos passam a usar o mesmo banco. Não é preciso PIN.
8. O Admin gerencia a equipe (bloquear ou remover), vê atividades e pode passar o papel de Admin em Mais → Administração.

Se o aparelho do Admin for perdido
Na tela de entrada (ou em Ajustes → Nuvem), use “Tenho um código de recuperação” e informe o código de 8 caracteres. O papel de Admin passa para o aparelho atual.

Google Drive (opcional, no site)
O backup por arquivo (compartilhar / salvar) no Android não depende do Drive. No site, o backup no Drive continua disponível se houver um Client ID OAuth configurado.

Segurança
- Qualquer pessoa autenticada (acesso anônimo) pode entrar na loja com um nome e criar o próprio registro na equipe. Não há PIN compartilhado.
- Só quem está na equipe e não está bloqueado lê ou grava os dados da loja.
- Só o Admin altera membros, o código de recuperação e as configurações da loja.
- Cada registro guarda quem criou e quem atualizou. Dados importados do backup antigo vêm marcados como “importado” e só o Admin envia à nuvem.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.`;
