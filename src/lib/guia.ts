export const GUIA_FIREBASE = `A nuvem já vem ligada neste aplicativo (projeto controle-de-vendas-bddb9). Você não precisa colar nenhuma configuração.

No celular ou no site
1. Instale o APK (ou abra o site) e, no primeiro uso, importe o arquivo de backup se ainda não tiver os dados neste aparelho.
2. Abra Mais → Ajustes → Nuvem.
3. Crie a primeira conta com e-mail e senha e entre. Essa conta vira a dona da loja.
4. Toque em “Sincronizar agora”. Os dados locais sobem para a nuvem em lotes.
5. Para outras pessoas: a dona abre Mais → Administração, adiciona o e-mail da pessoa e pede que ela instale o app e entre com e-mail e senha. Quem foi convidado usa o caixa normalmente. Só a dona gerencia a equipe, o registro de atividades e as configurações da loja.
6. Para bloquear ou remover alguém, use o mesmo painel de Administração.

Substituição (opcional)
Se quiser usar outro projeto Firebase, cole o objeto de configuração web em Mais → Ajustes → Nuvem e toque em “Salvar substituição”. Para voltar, use “Usar nuvem padrão”.

Google Drive (opcional, no site)
7. No Google Cloud do mesmo projeto (console.cloud.google.com), ative a API do Google Drive.
8. Credenciais → Criar credenciais → ID do cliente OAuth (aplicativo da Web).
9. Em origens JavaScript autorizadas, coloque o endereço do site (https://rafaelytofc7-spec.github.io). No Android o backup por arquivo (compartilhar / salvar) não depende disso.
10. Copie o ID do cliente e cole um JSON só com o campo extra "googleClientId" junto da configuração, como substituição, ou acrescente esse campo ao JSON padrão.

Segurança
- Só quem está autenticado e é membro (e não está bloqueado) lê ou grava os dados da loja.
- Só a conta dona altera membros e as configurações da loja.
- Cada registro guarda quem criou e quem atualizou. Dados importados do backup antigo vêm marcados como “importado”.
- Não compartilhe o arquivo de backup em repositórios públicos: ele contém o histórico de vendas.
- Este aplicativo não envia cobranças reais e não guarda tokens de maquininha.`;
