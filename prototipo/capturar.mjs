import { chromium } from '/workspace/controle-vendas/app/node_modules/playwright/index.mjs';
const telas = [
 ['cel-caixa',390,844],['cel-produtos',390,844],['cel-chegou',390,844],['cel-encomendas',390,844],['cel-promocoes',390,844],['cel-atualizar',390,844],
 ['pc-painel',1440,900],['pc-fornecedores',1440,900],['pc-relatorio',1440,900],['pc-produto',1440,900]];
const b = await chromium.launch();
for (const [id,w,h] of telas){const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:w<500?2:1});
 await p.goto('file:///workspace/controle-vendas-v3/prototipo/index.html#'+id);await p.waitForTimeout(300);
 await p.screenshot({path:`/workspace/controle-vendas-v3/mockups/${id}.png`});await p.close();}
await b.close();console.log('ok');
