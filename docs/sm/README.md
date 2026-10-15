# OAS-SM — Variante de Segurança Marítima

Especificação e notas de execução da adaptação do jogo base (Operação Atlântico
Sul) à variante de Segurança Marítima.

## Especificação

| Arquivo | O que é |
|---|---|
| `OAS-SM_Conceito_e_Regras_v1.6.docx` / `.md` | Conceito operacional e regras (fonte: `.docx`; o `.md` é conversão para leitura e busca). |
| `OAS-SM_Desenho_Experimental_v1.3.docx` / `.md` | Fatores, métricas, desenhos experimentais e esquema do dataset. |
| `PROMPT_INICIAL_OAS-SM.md` | Guia de execução fase a fase (SM-1 … SM-10). |
| `PACOTE_README.md` | README do pacote original. |
| `figuras/carta_oas_sm.png` | Carta OAS-MAP-001, Ed. 2.0 (13°S–34°S, grade A–AB × 1–20). |
| `figuras/c2_arquitetura.png` | Arquitetura de C2 da Força Azul. |

Em caso de conflito entre o prompt e os documentos, **os documentos prevalecem**.

## Decisões de execução

- **Linguagem:** JavaScript (CommonJS, `'use strict'`, tipos em JSDoc), no
  estilo do repositório. Os nomes `*.ts` da especificação correspondem a
  `shared/sm/*.js`.
- **Mapa:** a grade passa a 28×20 (A–AB × 1–20) sobre a carta OAS-MAP-001
  Ed. 2.0, cobrindo do 2º DN (Salvador) ao 5º DN (Rio Grande). A carta nova
  contém a anterior deslocada de +6 colunas e +5 linhas: todo hexágono antigo
  (c, r) é o novo (c + 6, r + 5), com as mesmas distâncias. Nessa área o
  terreno do jogo base foi mantido (é a referência de movimentação e
  detecção); fora dela vem da carta (`scripts/mapa_oas_map_001.py`).
  **Efeito no equilíbrio do jogo base** (2.000 partidas bot × bot,
  `scripts/balance_sim.js`): Azul 76% → 49%, Vermelho 22% → 41%, sem
  vencedor 2% → 10%, turno médio 6,4 → 7,9. A causa é o mar novo a leste e
  ao norte do grupo Vermelho, que começa no canto nordeste da área antiga;
  com só a área antiga aberta o resultado volta a 75%/24%.
- **Isolamento:** a variante vive em `shared/sm/`; o jogo base e seus testes
  não são alterados pelos módulos da variante.

## Correspondência com o repositório

A especificação cita módulos TypeScript que não existem neste repositório:

| Na especificação | Neste repositório |
|---|---|
| `rng.ts` | `shared/rng.js` (mulberry32) |
| `salvo.ts` ("motor de salva") | `shared/combat_engine.js` + `shared/combat_config.js` + `resolveBattleRound`/`buildCombatQueue` em `server.js`. **Divergência:** o combate usa tabelas de dano por d6 e interceptação, não as equações de salva de Hughes citadas no Conceito §1.2. É este o motor preservado em N3. |
| `hex.ts` | `shared/board.js` (grade, terreno) + `hexDist`/`hexNeighbors` em `server.js` + `public/js/hex.js` |
| `state.ts` | `newGame`/`nextTurn`/`stateFor` em `server.js`; a variante estende por composição (`state.sm`). |
| `oob.ts` | `shared/order_of_battle.js` + `shared/capability_factors.js` |
| runner/coleta | `shared/constructive_sim.js`, `shared/conditions.js`, `shared/metrics.js` |

Os fatores da variante (A_MPA … E_GVI) formam um conjunto próprio; os fatores do
jogo base (A_SSN … E_Terra, 248 EAC) continuam valendo para o simulador
construtivo existente.

## Fases

| Fase | Nota | Estado |
|---|---|---|
| SM-1 — encontro e atribuição | [`SM-1.md`](SM-1.md) | concluída |
| SM-2 — escada de escalada e ROE | [`SM-2.md`](SM-2.md) | concluída |
