# Nuvem compartilhada (Supabase)

A nuvem já vem configurada neste aplicativo (projeto `controle-de-vendas`, região São Paulo). Não é preciso colar chave nem arquivo de configuração. A entrada é só com o nome: o acesso anônimo identifica o aparelho, e qualquer pessoa autenticada entra na loja compartilhada escrevendo o nome.

## Login anônimo (obrigatório)

No painel do projeto, abra **Authentication → Providers** e ligue **Anonymous**. Sem isso, o aplicativo não consegue entrar só com o nome.

Link direto: <https://supabase.com/dashboard/project/zmsertdphnhaontkojqa/auth/providers>

## Primeiro uso e outros aparelhos

1. Instale o APK 1.9.0 ou abra o site atualizado.
2. Confirme que o aparelho está online nesta primeira entrada.
3. Escreva o seu nome e toque em **Entrar**. Se a loja já existe, você entra como membro. O histórico oficial já está na nuvem e aparece depois da entrada.
4. O Admin (Rafael) reivindica o papel com **Tenho um código de recuperação** e o próprio nome. Anote o código de 8 caracteres e guarde fora do telefone.
5. Nos outros aparelhos, cada pessoa escreve só o próprio nome. Todos passam a usar o mesmo banco. Não é preciso PIN.
6. O Admin gerencia a equipe (bloquear ou remover), vê atividades e pode passar o papel de Admin em **Mais → Administração**.

## Se o aparelho do Admin for perdido

Na tela de entrada (ou em **Ajustes → Nuvem**), use **Tenho um código de recuperação** e informe o código de 8 caracteres. O papel de Admin passa para o aparelho atual.

## Segurança

- Qualquer pessoa autenticada (acesso anônimo) pode entrar na loja com um nome e criar o próprio registro na equipe. Não há PIN compartilhado.
- Só quem está na equipe e não está bloqueado lê ou grava os dados da loja.
- Só o Admin altera membros, o código de recuperação e as configurações da loja.
- Cada registro guarda quem criou e quem atualizou. Dados importados do backup antigo vêm marcados como “importado” e só o Admin envia à nuvem.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.
