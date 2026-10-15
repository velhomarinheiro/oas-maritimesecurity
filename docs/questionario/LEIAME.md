# Questionário de validação online — como publicar e coletar

A página `index.html` desta pasta é o questionário de validação por especialistas, em linguagem profissional, para responder no navegador (computador ou celular), **sem identificação**. As respostas vão para uma **Planilha Google privada** do coordenador, por um pequeno script (Google Apps Script). Nada é gravado no GitHub.

## 1. Publicar a página (GitHub Pages) — uma vez

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **Deploy from a branch**.
3. Em **Branch**, escolha o ramo e a pasta **/docs**, e salve:
   - antes do merge, o ramo `sm-12-questionario-web`;
   - depois do merge, o ramo `main`.
4. Em um ou dois minutos, a página fica em:
   **https://velhomarinheiro.github.io/oas-maritimesecurity/questionario/**

O repositório é público, e a página também é: qualquer pessoa com o link a abre. A página pede aos buscadores para não indexá-la.

## 2. Criar a planilha e o receptor (Google Apps Script) — uma vez, cerca de 10 minutos

1. Com a sua conta Google, crie uma planilha nova (https://sheets.new) e dê a ela um nome, por exemplo, "OAS-SM — respostas do questionário".
2. Na planilha, abra o menu **Extensões → Apps Script**.
3. Apague o conteúdo do editor e cole todo o arquivo [`apps_script.gs`](apps_script.gs). Salve.
4. Clique em **Implantar → Nova implantação**. Na engrenagem "Selecionar tipo", escolha **App da Web** e preencha:
   - **Executar como:** *Eu*;
   - **Quem pode acessar:** *Qualquer pessoa*.
5. Clique em **Implantar** e autorize o acesso à planilha. Se aparecer "o Google não verificou este app", clique em **Avançado → Acessar** (o app é o seu próprio script).
6. Copie o **URL do app da Web**, que termina em `/exec`.
7. Ligue a página ao receptor. Para isso, **envie esse URL ao analista**, ou edite [`config.js`](config.js) assim:

   ```js
   window.QUESTIONARIO_CONFIG = { endereco: 'https://script.google.com/macros/s/…/exec' };
   ```

Para conferir, abra o URL `/exec` no navegador. Deve aparecer `{"ok":true,"servico":"questionário OAS-SM"}`.

Enquanto o endereço estiver vazio, a página funciona, mas o botão "Enviar" orienta o respondente a **baixar** o arquivo de respostas e enviá-lo ao coordenador.

## 3. Divulgar

Compartilhe o link da página. Como o respondente usa a página:

- o rascunho fica salvo no navegador dele, e ele pode voltar depois e completar;
- ele envia uma vez ao fim;
- cada envio vira um conjunto de linhas na aba **Respostas** da planilha.

Nenhum nome, e-mail, conta ou endereço IP é registrado: a planilha só guarda um código aleatório que agrupa as linhas de um mesmo envio.

## 4. Coletar e aplicar

1. Na planilha, abra a aba **Respostas** e use **Arquivo → Fazer download → Valores separados por vírgula (.csv)**.
2. Entregue o CSV ao analista, ou rode:

   ```bash
   node scripts/sm_questionario_respostas.js respostas.csv [arquivos-baixados.json …] [--minimo 3]
   node scripts/sm_lote.js --params data/sm/painel_questionario.json
   ```

   O primeiro comando gera `data/sm/painel_questionario.md`, com o painel por item: número de respondentes, concordância, valor do painel e dispersão. Gera também o JSON de parâmetros. O valor do painel é a mediana ponderada pela confiança declarada. Só itens com pelo menos 3 respondentes, e valor diferente da hipótese, mudam o jogo.

## Cuidados

- **Spam:** o endereço do receptor fica visível no código da página, então alguém poderia enviar lixo. O receptor descarta envios fora do formato, limita o tamanho e ignora robôs (campo-armadilha). Para encerrar a coleta, use **Implantar → Gerenciar implantações → Arquivar** no Apps Script.
- **Informação classificada:** a página pede ao respondente que não escreva nos campos de texto informação classificada. A planilha fica na conta Google do coordenador; compartilhe-a com cuidado.
- **Mudança no questionário:** se o questionário mudar, a página mostra outra "versão". O consolidador avisa quando há respostas de versões diferentes.
