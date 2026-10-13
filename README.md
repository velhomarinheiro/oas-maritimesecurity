# Operação Atlântico Sul — Wargame Naval

Wargame naval por turnos, multiplayer online, ambientado no Atlântico Sul:
a Força Azul (Marinha do Brasil) defende suas águas jurisdicionais contra a
Força Vermelha, uma força expedicionária adversária.

> **Repositório:** `velhomarinheiro/oas-maritimesecurity` — projeto principal.
> O código parte do jogo do repositório
> [`velhomarinheiro/wargame-naval`](https://github.com/velhomarinheiro/wargame-naval)
> (commit `cfaf5d8`), que serve de referência para o design visual e para as
> mecânicas de movimentação e detecção.

## Como rodar

```bash
npm install
node server.js
```

O servidor sobe em `http://localhost:3000` (porta configurável via `PORT`).

## Modos de jogo

- **2 jogadores** — um jogador cria a sala (Força Azul) e compartilha o código
  de 6 letras; o outro entra como Força Vermelha.
- **Solo vs. computador** — escolha um dos lados e jogue contra o bot. Antes de
  começar, escolha a **doutrina do adversário**: *formação* (dividida — cada
  unidade escolhe seu alvo; ou concentrada — os navios de superfície avançam
  juntos sobre o mesmo alvo) e *postura* (ofensiva — busca o contato; ou
  defensiva — evita se expor sem poder revidar e recua mais cedo). Qualquer um
  dos eixos pode ser sorteado.
- **Simulador construtivo (PBC)** — módulo analítico em `/construtivo`, sem
  jogadores. Monta-se um **pacote de capacidades** da Força Azul (cinco fatores
  com custo normalizado em EAC: submarino nuclear, submarinos convencionais,
  grupos de superfície, patrulha com mísseis, defesa costeira) e a plataforma
  joga sozinha dezenas ou centenas de partidas com ele. Delineamentos: pacote
  avulso, ablação (C0 + cada capacidade retirada por vez) e fatorial 2⁵ (32
  combinações). O relatório traz as medidas E1/E2/E3 + M Dsp por condição,
  heatmaps de perda por grupo-tarefa e exportação CSV por partida. Roda sobre o
  mesmo motor e a mesma ordem de batalha do wargame — o pacote avaliado é
  jogável no modo solo com um clique.
- **Sala arbitrada (facilitador/instrutor)** — um terceiro participante abre a
  sala e arbitra: prepara as forças antes do início (SP, movimento, munição,
  posição, duplicar ou retirar unidades), autoriza ou nega cada movimento
  declarado, ratifica o resultado do combate com ajustes de SP, insere contatos
  neutros (mercante, pesqueiro, navio-hospital, pesquisa, aeronave civil — não
  atacáveis) e envia mensagens às equipes. Ele vê o tabuleiro inteiro, sem
  névoa de guerra. Todas as intervenções vão para o log da partida.

## Mecânicas principais

- Grade hexagonal 20×10 sobre carta náutica, com terrenos (terra, águas rasas,
  plataforma, águas profundas, campos de petróleo).
- Turnos com períodos diurno/noturno; movimentação simultânea seguida de fase
  de combate com rodadas, interceptação e contra-ataques.
- Névoa de guerra com alcances de detecção por categoria (noite reduz detecção;
  submarinos usam sonar).
- Logística: pontos de combustível (FP) por unidade, reabastecimento por
  empilhamento com navios-tanque/logísticos/portos, munição limitada.
- Vitória por objetivos assimétricos: Azul precisa de 3 de 5; Vermelho, de
  seus 2. Limite operacional de 12 dias com adjudicação por progresso
  (configurável via `MAX_TURNS`).
- **Regra de vitória como opção de cenário**: além dos objetivos (padrão),
  existe a **exaustão ofensiva** — vence quem deixar o adversário sem nenhuma
  unidade com arma em estoque ou capacidade ofensiva. Escolhida pelo
  facilitador na configuração da sala arbitrada, ou por execução no simulador
  construtivo. Sob exaustão a adjudicação por tempo compara o potencial
  ofensivo remanescente em vez do progresso nos objetivos.

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `server.js` | Servidor Express + Socket.IO: salas, turnos, combate, bot |
| `fuel_model.js` | Modelo de combustível/logística naval e aérea |
| `game_logger.js` | Gravação de partidas em JSONL para o dataset de ML |
| `shared/` | Ordem de batalha, configuração e motor de combate (usados por servidor e cliente) |
| `shared/capability_factors.js` | Os 5 fatores de capacidade (PBC), custos EAC e filtragem da ordem de batalha |
| `shared/force_taxonomy.json` | Grupos de capacidade (Camada 2 — componentes de força de Coutau-Bégarié) |
| `shared/metrics.js` | Medidas E1/E2/E3 + M Dsp e perda de SP por grupo-tarefa |
| `shared/conditions.js` | Delineamentos experimentais: fatorial 2⁵ e ablação |
| `shared/constructive_sim.js` | Motor headless da simulação construtiva e agregação dos lotes |
| `public/` | Cliente web (landing, jogo em canvas, CSS, ícones, cards) |
| `public/js/facilitator.js` | Painéis e comandos do facilitador na sala arbitrada |
| `data/game-logs/` | Logs de partidas reais (dataset para treinar o bot) |
| `ml/` | Scripts de treinamento do bot por imitação |
