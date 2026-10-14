# SM-2 — Escada de escalada e ROE por nível

**Estado:** concluída · **Especificação:** Conceito v1.6 §9.3–9.4, §7.1 (papéis do COMPAAz e do ComemCh), Tabela 9.1; Desenho Experimental v1.3 §8.

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Bloco novo `NIVEIS` (N0–N3, com o teto do motor de encontro e as respostas autorizadas), `ACOES`, `GATILHOS_ESCALADA` e `TURNOS_PARA_DESESCALAR`. Todos são placeholders `// TODO: validar com especialista`. |
| `shared/sm/escalation.js` | Máquina de estados: `criarEstadoEscalada`, `avaliarGatilhos`, `avancarTurno`, `turnosAbaixoDoLimiar` (E3), e as consultas de ROE `tetoRoe`, `acaoPermitida`, `excessoDeForca`. `resolverSalvaN3` é o único ponto de entrada da salva. |
| `scripts/test_sm_escalation.js` | 41 verificações, incluídas no `npm test`. |

`shared/combat_engine.js`, `shared/combat_config.js` e `server.js` não foram alterados.

## Regras implementadas

| Nível | Teto do encontro | Respostas autorizadas (acumulam) | Gatilho de subida |
|---|---|---|---|
| N0 Rotina | identificação | vigilância, presença, registro | — |
| N1 Tensão | inspeção | + interrogação, escolta, abordagem consentida | 3 incidentes híbridos em 3 turnos, ou 1 com atribuição ≥ 40 |
| N2 Crise | apresamento | + abordagem coercitiva, apresamento, zona de exclusão | dano a infraestrutura com atribuição ≥ 70 |
| N3 Conflito | apresamento | + emprego de força (salva) | ataque armado com atribuição ≥ 70, ou emprego aberto de meios |

- **Condução e autorização (§9.3):** o ComemCh propõe e o COMPAAz decide. A transição só vale com `{ autorizado: true, por: 'COMPAAz' }`. No jogador único e no lote, a política padrão `AUTORIZA_SEMPRE` faz esse papel. Na SM-4 a decisão passa a vir da estação.
- **Subida:** vai direto ao nível mais alto cujo gatilho foi atingido. Um ataque armado atribuído em plena Rotina leva a N3 sem passar por N1 e N2.
- **Descida:** um nível por vez, depois de 4 turnos seguidos sem gatilho do nível corrente.
- **Vigência:** a transição vale a partir do turno seguinte. O turno é contado no nível que estava em vigor durante ele, o que dá E3_escalada como a soma dos turnos em N0–N2.
- **Ocorrências constabulares:** não contam como gatilho. A ligação com o híbrido vem na SM-3.
- **Excesso de força:** `excessoDeForca(nivel, acao)` dá quantos níveis acima do autorizado está uma ação. É a base do custo político por emprego acima da ROE (§11.3), ligado na SM-7.
- **N3 e a salva (§9.4):** `resolverSalvaN3` chama `combat_engine.resolveEngagement` com os mesmos argumentos, depois de injetar o gerador semeado da campanha, e restaura o gerador anterior em seguida. Abaixo de N3 nada é resolvido, nenhum sorteio é consumido e as unidades ficam intactas.

## Como validar

```bash
node scripts/test_sm_escalation.js   # só a SM-2
npm test                             # tudo (jogo base + SM-1 + SM-2)
```

O teste verifica:

- **ROE:** as respostas de cada nível contêm as do nível anterior, e o encontro em N0 nunca passa da identificação, enquanto em N2 chega ao apresamento.
- **Transições:** cada gatilho da Tabela 9.1, o salto direto a N3, a negação pelo COMPAAz (e a recusa da autorização vinda do ComemCh), a descida nível a nível, o histórico, a contagem por nível e a imutabilidade do estado.
- **Reprodutibilidade:** a mesma sequência de eventos dá a mesma história de escalada.
- **N3:** em 200 sementes, o resultado e as unidades são idênticos aos do motor de salva chamado direto, e o gerador é restaurado depois.
- **N0–N2:** não há salva, nenhum sorteio é consumido e as unidades ficam intactas.

## Ganchos para as próximas fases

- **SM-3:** o gerador constabular emite os eventos de saturação. Os eventos híbridos chegam no formato `{ tipo, atribuicao }`.
- **SM-4:** `decidir` passa a ser a estação COMPAAz, humana ou política de agente.
- **SM-5:** o configurador define o nível inicial (`criarEstadoEscalada(n)`). A regra "perda do KCV em N3 ⇒ derrota Vermelha" entra no término de campanha.
- **SM-7:** o apoio público estreita ou amplia a ROE efetiva sobre `NIVEIS`, e o custo político usa `excessoDeForca`.
