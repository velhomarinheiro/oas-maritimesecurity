# Sensibilidade da OAS-SM — resultados

Gerado por `node scripts/sm_sensibilidade.js --replicas 30`. 37 parâmetros (ou grupos) × 2 níveis × 2 condições × 30 réplicas (sementes 11001–11030, espelhadas), 50 s. Parâmetros de partida: os placeholders de `params.js`.

- **C0:** todas as capacidades. **C3:** sem C_Fusão. Configuração de pesquisa: jogador único, intermediário, 45 dias, intensidade 0,5.
- **Efeito padronizado (d):** (média no nível alto − média no nível baixo) ÷ desvio-padrão da métrica na linha de base C0.
- **Níveis:** −30%/+30% (escala, com teto de 1 nas probabilidades e de 100 nas atribuições) ou os valores indicados.

## Linha de base

| Métrica | C0 | C3 (sem C_Fusão) | dp em C0 |
|---|---|---|---|
| E1_atrib | 0,605 | 0,236 | 0,169 |
| E2_infra | 88,000 | 84,667 | 4,012 |
| E3_escalada | 41,400 | 45,000 | 8,962 |
| E4_custopol | 7,908 | 15,219 | 4,718 |
| E5_ordem | 0,113 | 0,044 | 0,032 |
| E6_dispersao | 0,149 | 0,147 | 0,035 |
| sloc_idx | 0,867 | 0,859 | 0,033 |
| nivel_max | 2,100 | 1,067 | 0,548 |
| kcv_perdido | 0,033 | 0,000 | 0,183 |
| apoio_publico_final | 19,719 | 4,955 | 9,967 |
| n_ocorr_crim | 168,267 | 183,467 | 39,340 |
| n_incidentes_hibridos | 13,467 | 14,867 | 4,006 |

Efeito de C_Fusão sobre E1_atrib (C0 − C3) na linha de base: **0,369**.

## Parâmetros mais influentes (tornado)

**E1_atrib em C0** — A6 limiar robusto da investigação (d = -2,65); A7 ritmo de evidência (intermediário) (d = +2,51); A2 fator de negabilidade (d = +2,47); A5 ganho da investigação pós-fato (d = +2,35); F2 peso das fontes de dados (d = +1,62); E1 probabilidade-base por etapa (d = +1,58).

**E1_atrib em C3** — A6 limiar robusto da investigação (d = -2,79); A2 fator de negabilidade (d = +2,63); A7 ritmo de evidência (intermediário) (d = +2,57); A5 ganho da investigação pós-fato (d = +2,47); F3 teto de fusão sem c_fusão (d = +1,53); E1 probabilidade-base por etapa (d = +1,19).

**E2_infra em C0** — T3 dano por ação híbrida (d = -1,56); T1 ações híbridas por turno (d = -1,35); E1 probabilidade-base por etapa (d = +1,28); A5 ganho da investigação pós-fato (d = +0,99); E2 capacidade das plataformas (d = +0,92); A3 limiares de atribuição por etapa (d = +0,90).

**E4_custopol em C0** — A7 ritmo de evidência (intermediário) (d = -4,92); A3 limiares de atribuição por etapa (d = +4,90); A1 ganho de evidência por etapa (d = -4,72); A2 fator de negabilidade (d = -4,09); E1 probabilidade-base por etapa (d = +1,46); E2 capacidade das plataformas (d = +1,44).

**E5_ordem em C0** — E1 probabilidade-base por etapa (d = +11,17); E2 capacidade das plataformas (d = +6,36); F2 peso das fontes de dados (d = +1,57); T4 incidência constabular (λ) (d = -0,76); C8 incidência de falsos alarmes (d = -0,34); F4 ganho de quadro por fusão (d = +0,29, n.s.).

**nivel_max em C0** — A2 fator de negabilidade (d = +2,56); A7 ritmo de evidência (intermediário) (d = +2,56); A5 ganho da investigação pós-fato (d = +2,43); A4 atribuição mínima para n2/n3 (d = -2,01); F2 peso das fontes de dados (d = +1,16); A3 limiares de atribuição por etapa (d = -0,73).

## Efeito padronizado por parâmetro (C0)

| Id | Grupo | Parâmetro | E1_atrib | E2_infra | E3_escalada | E4_custopol | E5_ordem | E6_dispersao | nivel_max | apoio_publico_final |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | fusão | Pisos de fusão por etapa †3/6 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| F2 | fusão | Peso das fontes de dados | **+1,62** | **+0,72** | **-0,40** | **-0,87** | **+1,57** | 0,00 | **+1,16** | **+1,41** |
| F3 | fusão | Teto de fusão sem C_Fusão | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| F4 | fusão | Ganho de quadro por fusão | -0,04 | -0,17 | +0,29 | +0,16 | +0,29 | -0,07 | **-0,37** | -0,09 |
| F5 | fusão | Chance-base de entrar no quadro | +0,15 | +0,09 | -0,09 | -0,14 | +0,12 | -0,05 | +0,18 | +0,06 |
| F6 | fusão | Piso de fusão na evidência | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| F7 | fusão | Bônus de fusão de MPA e CENSIPAM | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| A1 | atribuição | Ganho de evidência por etapa | **+0,43** | -0,08 | +0,34 | **-4,72** | +0,16 | -0,12 | **+0,49** | **+3,38** |
| A2 | atribuição | Fator de negabilidade †2/4 | **+2,47** | **+0,60** | -0,50 | **-4,09** | +0,17 | -0,17 | **+2,56** | **+2,03** |
| A3 | atribuição | Limiares de atribuição por etapa | -0,28 | **+0,90** | **-1,41** | **+4,90** | -0,07 | +0,09 | **-0,73** | **-4,58** |
| A4 | atribuição | Atribuição mínima para N2/N3 | +0,01 | **-0,37** | **+0,40** | -0,10 | -0,11 | +0,19 | **-2,01** | -0,17 |
| A5 | atribuição | Ganho da investigação pós-fato | **+2,35** | **+0,99** | **-1,13** | **-0,34** | +0,11 | -0,21 | **+2,43** | **+0,77** |
| A6 | atribuição | Limiar robusto da investigação | **-2,65** | -0,04 | 0,00 | +0,06 | +0,01 | +0,00 | **+0,24** | -0,04 |
| A7 | atribuição | Ritmo de evidência (intermediário) | **+2,51** | **+0,67** | -0,48 | **-4,92** | +0,13 | -0,13 | **+2,56** | **+3,84** |
| C1 | custos | Peso político por etapa | -0,07 | -0,02 | 0,00 | **+0,78** | +0,00 | -0,01 | -0,06 | **-0,42** |
| C2 | custos | Peso do excesso de força | 0,00 | 0,00 | 0,00 | **+0,24** | 0,00 | 0,00 | 0,00 | -0,06 |
| C3 | custos | Peso dos danos a terceiros | 0,00 | 0,00 | 0,00 | +0,03 | 0,00 | 0,00 | 0,00 | 0,00 |
| C4 | custos | Modulação do custo pelo apoio | 0,00 | 0,00 | 0,00 | **+0,22** | 0,00 | 0,00 | 0,00 | -0,11 |
| C5 | custos | Teto de custo político | -0,01 | -0,04 | +0,08 | +0,01 | +0,06 | +0,01 | 0,00 | +0,08 |
| C6 | custos | Apoio perdido por custo | -0,07 | -0,02 | 0,00 | +0,05 | +0,00 | -0,01 | -0,06 | **-0,47** |
| C7 | custos | Efeito-base da desinformação | -0,15 | -0,09 | 0,00 | **+0,26** | +0,02 | -0,02 | -0,06 | **-3,33** |
| C8 | custos | Incidência de falsos alarmes | -0,15 | +0,04 | -0,33 | **+0,29** | **-0,34** | **-0,47** | +0,12 | -0,29 |
| C9 | custos | Chance de força desnecessária | -0,01 | -0,01 | 0,00 | +0,20 | 0,00 | 0,00 | 0,00 | -0,08 |
| C10 | custos | Chance de dano ambiental | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| C11 | custos | Esclarecimento na interrogação | -0,01 | +0,04 | +0,02 | **-0,84** | -0,13 | +0,02 | -0,06 | **+0,30** |
| T1 | ameaça | Ações híbridas por turno | +0,06 | **-1,35** | -0,45 | -0,28 | 0,00 | +0,10 | **+0,67** | **-0,38** |
| T2 | ameaça | Evasão dos vetores híbridos | **-0,68** | **-0,75** | +0,06 | +0,22 | -0,02 | -0,05 | -0,12 | **-0,29** |
| T3 | ameaça | Dano por ação híbrida | -0,02 | **-1,56** | -0,04 | 0,00 | +0,05 | 0,00 | +0,06 | +0,08 |
| T4 | ameaça | Incidência constabular (λ) | +0,06 | -0,19 | +0,18 | +0,25 | **-0,76** | **-2,01** | -0,06 | -0,06 |
| T5 | ameaça | Saturação instrumentalizada | -0,16 | -0,36 | +0,14 | +0,02 | -0,05 | **+2,06** | -0,12 | 0,00 |
| T6 | ameaça | Ocorrências de cobertura | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| E1 | encontro | Probabilidade-base por etapa †3/6 | **+1,58** | **+1,28** | +0,19 | **+1,46** | **+11,17** | +0,11 | -0,37 | **+3,33** |
| E2 | encontro | Capacidade das plataformas †14/40 | **+1,05** | **+0,92** | -0,22 | **+1,44** | **+6,36** | +0,16 | +0,24 | **+1,94** |
| D1 | doutrina | Ações por estação | +0,01 | -0,02 | +0,11 | +0,30 | 0,00 | +0,06 | 0,00 | -0,01 |
| D2 | doutrina | Surto de ações | -0,10 | -0,09 | +0,19 | +0,20 | -0,06 | +0,03 | -0,24 | -0,19 |
| D3 | doutrina | Urgência (turnos para aceitar risco) | +0,17 | **+0,24** | -0,05 | +0,17 | -0,04 | -0,02 | +0,06 | +0,03 |
| D4 | doutrina | Turnos para desescalar | +0,03 | +0,06 | -0,05 | -0,02 | +0,04 | +0,03 | 0,00 | +0,07 |

Em negrito: p < 0,05 (pareado, sem correção) e |d| ≥ 0,2. † k/n: k das n folhas do grupo batem no teto (1 ou 100) no nível alto, que fica menor que +30%. Há também saturação que a tabela não marca: a fusão é limitada a 1 (e a TETO_FUSAO_SEM_C em C3), de modo que F2 (peso das fontes, que somam 1) só age no nível baixo em C0 e em nenhum nível em C3.

## Robustez da conclusão principal: o efeito de C_Fusão

O lote da SM-8 aponta C_Fusão como o fator mais influente sobre E1_atrib. A conclusão é tida como robusta a um parâmetro quando, nos dois níveis, o efeito (C0 − C3) mantém o sinal e ao menos metade da magnitude da linha de base.

| Id | Parâmetro | efeito no nível baixo | efeito no nível alto | robusto |
|---|---|---|---|---|
| F1 | Pisos de fusão por etapa | 0,406 | 0,378 | sim |
| F2 | Peso das fontes de dados | 0,097 | 0,369 | **não** |
| F3 | Teto de fusão sem C_Fusão | 0,466 | 0,272 | sim |
| F4 | Ganho de quadro por fusão | 0,422 | 0,389 | sim |
| F5 | Chance-base de entrar no quadro | 0,367 | 0,393 | sim |
| F6 | Piso de fusão na evidência | 0,391 | 0,323 | sim |
| F7 | Bônus de fusão de MPA e CENSIPAM | 0,397 | 0,375 | sim |
| A1 | Ganho de evidência por etapa | 0,342 | 0,369 | sim |
| A2 | Fator de negabilidade | 0,128 | 0,212 | **não** |
| A3 | Limiares de atribuição por etapa | 0,360 | 0,353 | sim |
| A4 | Atribuição mínima para N2/N3 | 0,369 | 0,372 | sim |
| A5 | Ganho da investigação pós-fato | 0,131 | 0,215 | **não** |
| A6 | Limiar robusto da investigação | 0,223 | 0,129 | **não** |
| A7 | Ritmo de evidência (intermediário) | 0,128 | 0,226 | **não** |
| C1 | Peso político por etapa | 0,365 | 0,357 | sim |
| C2 | Peso do excesso de força | 0,369 | 0,370 | sim |
| C3 | Peso dos danos a terceiros | 0,369 | 0,369 | sim |
| C4 | Modulação do custo pelo apoio | 0,369 | 0,369 | sim |
| C5 | Teto de custo político | 0,375 | 0,369 | sim |
| C6 | Apoio perdido por custo | 0,365 | 0,358 | sim |
| C7 | Efeito-base da desinformação | 0,368 | 0,368 | sim |
| C8 | Incidência de falsos alarmes | 0,390 | 0,364 | sim |
| C9 | Chance de força desnecessária | 0,369 | 0,367 | sim |
| C10 | Chance de dano ambiental | 0,369 | 0,369 | sim |
| C11 | Esclarecimento na interrogação | 0,384 | 0,370 | sim |
| T1 | Ações híbridas por turno | 0,342 | 0,385 | sim |
| T2 | Evasão dos vetores híbridos | 0,365 | 0,366 | sim |
| T3 | Dano por ação híbrida | 0,366 | 0,368 | sim |
| T4 | Incidência constabular (λ) | 0,387 | 0,391 | sim |
| T5 | Saturação instrumentalizada | 0,393 | 0,369 | sim |
| T6 | Ocorrências de cobertura | 0,369 | 0,369 | sim |
| E1 | Probabilidade-base por etapa | 0,322 | 0,438 | sim |
| E2 | Capacidade das plataformas | 0,322 | 0,385 | sim |
| D1 | Ações por estação | 0,405 | 0,370 | sim |
| D2 | Surto de ações | 0,418 | 0,361 | sim |
| D3 | Urgência (turnos para aceitar risco) | 0,361 | 0,374 | sim |
| D4 | Turnos para desescalar | 0,371 | 0,377 | sim |

A conclusão depende de 5 parâmetro(s): F2 (peso das fontes de dados), A2 (fator de negabilidade), A5 (ganho da investigação pós-fato), A6 (limiar robusto da investigação), A7 (ritmo de evidência (intermediário)). São prioridade na revisão de especialistas.

## Checagem de face (sentido esperado × observado)

Para cada parâmetro, o sentido em que se espera que as métricas se movam quando ele sobe (hipótese de projeto). Testes pareados com correção de Holm sobre a família inteira.

| Id | Métrica | Condição | Esperado | Δ observado | p (Holm) | Situação |
|---|---|---|---|---|---|---|
| F1 | E1_atrib | C3 | sobe | +0,028 | 1,000 | nulo |
| F2 | E1_atrib | C3 | sobe | 0,000 | 1,000 | nulo |
| F3 | E1_atrib | C3 | sobe | +0,193 | <0,001 | coerente |
| F3 | E5_ordem | C3 | sobe | +0,032 | <0,001 | coerente |
| F4 | E1_atrib | C0 | sobe | -0,007 | 1,000 | nulo |
| F4 | E5_ordem | C0 | sobe | +0,009 | 1,000 | nulo |
| F5 | E1_atrib | C0 | sobe | +0,026 | 1,000 | nulo |
| F5 | E5_ordem | C0 | sobe | +0,004 | 1,000 | nulo |
| F6 | E1_atrib | C3 | sobe | +0,068 | <0,001 | coerente |
| A1 | E1_atrib | C0 | sobe | +0,073 | 0,101 | nulo |
| A1 | nivel_max | C0 | sobe | +0,267 | 0,107 | nulo |
| A2 | E1_atrib | C0 | sobe | +0,416 | <0,001 | coerente |
| A3 | E4_custopol | C0 | sobe | +23,119 | <0,001 | coerente |
| A4 | nivel_max | C0 | desce | -1,100 | <0,001 | coerente |
| A5 | nivel_max | C0 | sobe | +1,333 | <0,001 | coerente |
| A6 | nivel_max | C0 | desce | +0,133 | 0,477 | nulo |
| A7 | E1_atrib | C0 | sobe | +0,423 | <0,001 | coerente |
| C1 | E4_custopol | C0 | sobe | +3,698 | <0,001 | coerente |
| C2 | E4_custopol | C0 | sobe | +1,124 | 0,099 | nulo |
| C3 | E4_custopol | C0 | sobe | +0,155 | 1,000 | nulo |
| C4 | E4_custopol | C0 | sobe | +1,023 | <0,001 | coerente |
| C6 | apoio_publico_final | C0 | desce | -4,692 | <0,001 | coerente |
| C7 | apoio_publico_final | C0 | desce | -33,150 | <0,001 | coerente |
| C8 | E4_custopol | C0 | sobe | +1,374 | 0,477 | nulo |
| T1 | E2_infra | C0 | desce | -5,405 | <0,001 | coerente |
| T1 | n_incidentes_hibridos | C0 | sobe | +6,633 | <0,001 | coerente |
| T2 | E1_atrib | C0 | desce | -0,115 | <0,001 | coerente |
| T3 | E2_infra | C0 | desce | -6,243 | <0,001 | coerente |
| T4 | n_ocorr_crim | C0 | sobe | +84,433 | <0,001 | coerente |
| T5 | n_ocorr_crim | C0 | sobe | +22,867 | 0,028 | coerente |
| E1 | E1_atrib | C0 | sobe | +0,266 | <0,001 | coerente |
| E1 | E5_ordem | C0 | sobe | +0,359 | <0,001 | coerente |
| E2 | E1_atrib | C0 | sobe | +0,177 | <0,001 | coerente |
| E2 | E5_ordem | C0 | sobe | +0,205 | <0,001 | coerente |
| D1 | E5_ordem | C0 | sobe | -0,000 | 1,000 | nulo |
| D3 | E4_custopol | C0 | sobe | +0,808 | 0,872 | nulo |

Resumo: 22 coerentes, 14 sem efeito detectável, 0 contraintuitivos.

"Sem efeito detectável" não confirma nem refuta a hipótese: o parâmetro pode estar saturado nesta configuração ou o efeito pode ser menor do que o lote resolve. "Contraintuitivo" pede exame do mecanismo antes de qualquer uso analítico.

## Parâmetros inertes nesta configuração

- C10 Chance de dano ambiental (`TERCEIROS.ambiental.pPorVetor.*`)
- T6 Ocorrências de cobertura (`ACOPLAMENTO.pCoberturaMax`)

