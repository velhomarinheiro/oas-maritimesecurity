# Sensibilidade da OAS-SM — resultados

Gerado por `node scripts/sm_sensibilidade.js --replicas 30`. 33 parâmetros (ou grupos) × 2 níveis × 2 condições × 30 réplicas (sementes 11001–11030, espelhadas), 40 s. Parâmetros de partida: os placeholders de `params.js`.

- **C0:** todas as capacidades. **C3:** sem C_Fusão. Configuração de pesquisa: jogador único, intermediário, 45 dias, intensidade 0,5.
- **Efeito padronizado (d):** (média no nível alto − média no nível baixo) ÷ desvio-padrão da métrica na linha de base C0.
- **Níveis:** −30%/+30% (escala, com teto de 1 nas probabilidades e de 100 nas atribuições) ou os valores indicados.

## Linha de base

| Métrica | C0 | C3 (sem C_Fusão) | dp em C0 |
|---|---|---|---|
| E1_atrib | 0,591 | 0,195 | 0,136 |
| E2_infra | 88,143 | 83,548 | 4,445 |
| E3_escalada | 40,967 | 45,000 | 9,683 |
| E4_custopol | 4,925 | 8,334 | 1,677 |
| E5_ordem | 0,122 | 0,044 | 0,028 |
| E6_dispersao | 0,175 | 0,179 | 0,041 |
| sloc_idx | 0,868 | 0,859 | 0,029 |
| nivel_max | 2,133 | 1,133 | 0,507 |
| kcv_perdido | 0,000 | 0,000 | 0,000 |
| apoio_publico_final | 23,989 | 4,937 | 8,713 |
| n_ocorr_crim | 166,000 | 183,467 | 41,240 |
| n_incidentes_hibridos | 13,033 | 14,833 | 3,961 |

Efeito de C_Fusão sobre E1_atrib (C0 − C3) na linha de base: **0,396**.

## Parâmetros mais influentes (tornado)

**E1_atrib em C0** — A7 ritmo de evidência (intermediário) (d = +3,41); A2 fator de negabilidade (d = +3,33); A6 limiar robusto da investigação (d = -3,14); A5 ganho da investigação pós-fato (d = +2,94); E1 probabilidade-base por etapa (d = +1,92); F2 peso das fontes de dados (d = +1,78).

**E1_atrib em C3** — A6 limiar robusto da investigação (d = -2,89); A7 ritmo de evidência (intermediário) (d = +2,77); A2 fator de negabilidade (d = +2,74); A5 ganho da investigação pós-fato (d = +2,62); F3 teto de fusão sem c_fusão (d = +1,26); E1 probabilidade-base por etapa (d = +1,15).

**E2_infra em C0** — T3 dano por ação híbrida (d = -1,39); T1 ações híbridas por turno (d = -1,28); E1 probabilidade-base por etapa (d = +1,02); A7 ritmo de evidência (intermediário) (d = +1,00); A2 fator de negabilidade (d = +0,87); A5 ganho da investigação pós-fato (d = +0,87).

**E4_custopol em C0** — A3 limiares de atribuição por etapa (d = +13,88); A7 ritmo de evidência (intermediário) (d = -13,50); A1 ganho de evidência por etapa (d = -13,38); A2 fator de negabilidade (d = -11,27); E2 capacidade das plataformas (d = +2,52); C1 peso político por etapa (d = +1,78).

**E5_ordem em C0** — E1 probabilidade-base por etapa (d = +13,17); E2 capacidade das plataformas (d = +7,40); F2 peso das fontes de dados (d = +1,88); T4 incidência constabular (λ) (d = -0,95); F4 ganho de quadro por fusão (d = +0,41); T5 saturação instrumentalizada (d = -0,25, n.s.).

**nivel_max em C0** — A2 fator de negabilidade (d = +2,89); A5 ganho da investigação pós-fato (d = +2,89); A7 ritmo de evidência (intermediário) (d = +2,89); A4 atribuição mínima para n2/n3 (d = -2,23); F2 peso das fontes de dados (d = +1,38); T1 ações híbridas por turno (d = +0,53, n.s.).

## Efeito padronizado por parâmetro (C0)

| Id | Grupo | Parâmetro | E1_atrib | E2_infra | E3_escalada | E4_custopol | E5_ordem | E6_dispersao | nivel_max | apoio_publico_final |
|---|---|---|---|---|---|---|---|---|---|---|
| F1 | fusão | Pisos de fusão por etapa †3/6 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| F2 | fusão | Peso das fontes de dados | **+1,78** | **+0,51** | **-0,42** | **-1,31** | **+1,88** | -0,10 | **+1,38** | **+1,98** |
| F3 | fusão | Teto de fusão sem C_Fusão | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| F4 | fusão | Ganho de quadro por fusão | +0,01 | -0,01 | -0,06 | -0,07 | **+0,41** | -0,02 | +0,13 | +0,23 |
| F5 | fusão | Chance-base de entrar no quadro | -0,09 | -0,08 | +0,10 | +0,10 | +0,16 | +0,05 | 0,00 | -0,01 |
| F6 | fusão | Piso de fusão na evidência | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| F7 | fusão | Bônus de fusão de MPA e CENSIPAM | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| A1 | atribuição | Ganho de evidência por etapa | **+0,74** | **+0,57** | -0,27 | **-13,38** | -0,01 | -0,12 | **+0,39** | **+4,42** |
| A2 | atribuição | Fator de negabilidade †2/4 | **+3,33** | **+0,87** | **-0,93** | **-11,27** | -0,03 | -0,02 | **+2,89** | **+2,37** |
| A3 | atribuição | Limiares de atribuição por etapa | -0,23 | **+0,29** | **-0,79** | **+13,88** | +0,16 | +0,06 | -0,13 | **-5,18** |
| A4 | atribuição | Atribuição mínima para N2/N3 | +0,03 | **-0,39** | **+0,42** | **+0,30** | -0,20 | +0,08 | **-2,23** | **-0,44** |
| A5 | atribuição | Ganho da investigação pós-fato | **+2,94** | **+0,87** | **-1,04** | **-0,71** | +0,02 | +0,01 | **+2,89** | **+0,71** |
| A6 | atribuição | Limiar robusto da investigação | **-3,14** | -0,01 | 0,00 | -0,04 | +0,01 | +0,00 | +0,13 | +0,03 |
| A7 | atribuição | Ritmo de evidência (intermediário) | **+3,41** | **+1,00** | **-0,93** | **-13,50** | -0,06 | -0,02 | **+2,89** | **+4,52** |
| C1 | custos | Peso político por etapa | -0,04 | -0,05 | 0,00 | **+1,78** | +0,00 | 0,00 | +0,07 | **-0,45** |
| C2 | custos | Peso do excesso de força | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| C3 | custos | Peso dos danos a terceiros | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| C4 | custos | Modulação do custo pelo apoio | 0,00 | 0,00 | 0,00 | **+0,34** | 0,00 | 0,00 | 0,00 | -0,10 |
| C5 | custos | Teto de custo político | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| C6 | custos | Apoio perdido por custo | -0,04 | -0,05 | 0,00 | +0,02 | +0,00 | 0,00 | +0,07 | **-0,45** |
| C7 | custos | Efeito-base da desinformação | **-0,30** | **-0,25** | 0,00 | **+0,38** | +0,13 | -0,01 | +0,20 | **-4,22** |
| T1 | ameaça | Ações híbridas por turno | -0,05 | **-1,28** | -0,33 | -0,03 | -0,09 | +0,06 | +0,53 | **-0,47** |
| T2 | ameaça | Evasão dos vetores híbridos | **-0,84** | **-0,46** | -0,08 | -0,05 | +0,09 | -0,02 | +0,07 | -0,13 |
| T3 | ameaça | Dano por ação híbrida | +0,06 | **-1,39** | -0,04 | -0,04 | -0,01 | +0,00 | +0,07 | +0,05 |
| T4 | ameaça | Incidência constabular (λ) | +0,16 | -0,17 | +0,13 | **+1,01** | **-0,95** | **-2,29** | -0,13 | 0,00 |
| T5 | ameaça | Saturação instrumentalizada | **-0,53** | **-0,49** | -0,06 | +0,03 | -0,25 | **+2,08** | +0,07 | -0,26 |
| T6 | ameaça | Ocorrências de cobertura | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| E1 | encontro | Probabilidade-base por etapa †3/6 | **+1,92** | **+1,02** | +0,15 | **+1,12** | **+13,17** | +0,16 | -0,33 | **+4,64** |
| E2 | encontro | Capacidade das plataformas †14/40 | **+1,29** | **+0,58** | +0,10 | **+2,52** | **+7,40** | +0,13 | -0,26 | **+2,32** |
| D1 | doutrina | Ações por estação | -0,02 | -0,02 | 0,00 | -0,02 | +0,10 | +0,09 | +0,13 | +0,09 |
| D2 | doutrina | Surto de ações | +0,08 | -0,03 | -0,04 | -0,06 | +0,07 | +0,04 | **+0,26** | +0,03 |
| D3 | doutrina | Urgência (turnos para aceitar risco) | **+0,38** | **+0,26** | -0,01 | **+0,23** | -0,02 | +0,00 | +0,13 | +0,15 |
| D4 | doutrina | Turnos para desescalar | +0,04 | +0,09 | -0,05 | +0,01 | -0,05 | +0,01 | +0,07 | -0,01 |

Em negrito: p < 0,05 (pareado, sem correção) e |d| ≥ 0,2. † k/n: k das n folhas do grupo batem no teto (1 ou 100) no nível alto, que fica menor que +30%. Há também saturação que a tabela não marca: a fusão é limitada a 1 (e a TETO_FUSAO_SEM_C em C3), de modo que F2 (peso das fontes, que somam 1) só age no nível baixo em C0 e em nenhum nível em C3.

## Robustez da conclusão principal: o efeito de C_Fusão

O lote da SM-8 aponta C_Fusão como o fator mais influente sobre E1_atrib. A conclusão é tida como robusta a um parâmetro quando, nos dois níveis, o efeito (C0 − C3) mantém o sinal e ao menos metade da magnitude da linha de base.

| Id | Parâmetro | efeito no nível baixo | efeito no nível alto | robusto |
|---|---|---|---|---|
| F1 | Pisos de fusão por etapa | 0,382 | 0,361 | sim |
| F2 | Peso das fontes de dados | 0,153 | 0,396 | **não** |
| F3 | Teto de fusão sem C_Fusão | 0,395 | 0,242 | sim |
| F4 | Ganho de quadro por fusão | 0,364 | 0,366 | sim |
| F5 | Chance-base de entrar no quadro | 0,359 | 0,360 | sim |
| F6 | Piso de fusão na evidência | 0,412 | 0,351 | sim |
| F7 | Bônus de fusão de MPA e CENSIPAM | 0,388 | 0,386 | sim |
| A1 | Ganho de evidência por etapa | 0,362 | 0,427 | sim |
| A2 | Fator de negabilidade | 0,135 | 0,256 | **não** |
| A3 | Limiares de atribuição por etapa | 0,375 | 0,403 | sim |
| A4 | Atribuição mínima para N2/N3 | 0,396 | 0,400 | sim |
| A5 | Ganho da investigação pós-fato | 0,174 | 0,257 | **não** |
| A6 | Limiar robusto da investigação | 0,242 | 0,164 | **não** |
| A7 | Ritmo de evidência (intermediário) | 0,135 | 0,264 | **não** |
| C1 | Peso político por etapa | 0,399 | 0,396 | sim |
| C2 | Peso do excesso de força | 0,396 | 0,396 | sim |
| C3 | Peso dos danos a terceiros | 0,396 | 0,396 | sim |
| C4 | Modulação do custo pelo apoio | 0,396 | 0,396 | sim |
| C5 | Teto de custo político | 0,396 | 0,396 | sim |
| C6 | Apoio perdido por custo | 0,399 | 0,396 | sim |
| C7 | Efeito-base da desinformação | 0,412 | 0,387 | sim |
| T1 | Ações híbridas por turno | 0,398 | 0,377 | sim |
| T2 | Evasão dos vetores híbridos | 0,396 | 0,368 | sim |
| T3 | Dano por ação híbrida | 0,393 | 0,391 | sim |
| T4 | Incidência constabular (λ) | 0,395 | 0,419 | sim |
| T5 | Saturação instrumentalizada | 0,398 | 0,337 | sim |
| T6 | Ocorrências de cobertura | 0,396 | 0,396 | sim |
| E1 | Probabilidade-base por etapa | 0,308 | 0,430 | sim |
| E2 | Capacidade das plataformas | 0,313 | 0,383 | sim |
| D1 | Ações por estação | 0,389 | 0,385 | sim |
| D2 | Surto de ações | 0,382 | 0,396 | sim |
| D3 | Urgência (turnos para aceitar risco) | 0,383 | 0,434 | sim |
| D4 | Turnos para desescalar | 0,399 | 0,401 | sim |

A conclusão depende de 5 parâmetro(s): F2 (peso das fontes de dados), A2 (fator de negabilidade), A5 (ganho da investigação pós-fato), A6 (limiar robusto da investigação), A7 (ritmo de evidência (intermediário)). São prioridade na revisão de especialistas.

## Checagem de face (sentido esperado × observado)

Para cada parâmetro, o sentido em que se espera que as métricas se movam quando ele sobe (hipótese de projeto). Testes pareados com correção de Holm sobre a família inteira.

| Id | Métrica | Condição | Esperado | Δ observado | p (Holm) | Situação |
|---|---|---|---|---|---|---|
| F1 | E1_atrib | C3 | sobe | +0,022 | 1,000 | nulo |
| F2 | E1_atrib | C3 | sobe | 0,000 | 1,000 | nulo |
| F3 | E1_atrib | C3 | sobe | +0,153 | <0,001 | coerente |
| F3 | E5_ordem | C3 | sobe | +0,039 | <0,001 | coerente |
| F4 | E1_atrib | C0 | sobe | +0,001 | 1,000 | nulo |
| F4 | E5_ordem | C0 | sobe | +0,011 | 0,067 | nulo |
| F5 | E1_atrib | C0 | sobe | -0,012 | 1,000 | nulo |
| F5 | E5_ordem | C0 | sobe | +0,004 | 1,000 | nulo |
| F6 | E1_atrib | C3 | sobe | +0,061 | <0,001 | coerente |
| A1 | E1_atrib | C0 | sobe | +0,100 | 0,001 | coerente |
| A1 | nivel_max | C0 | sobe | +0,200 | 0,140 | nulo |
| A2 | E1_atrib | C0 | sobe | +0,452 | <0,001 | coerente |
| A3 | E4_custopol | C0 | sobe | +23,271 | <0,001 | coerente |
| A4 | nivel_max | C0 | desce | -1,133 | <0,001 | coerente |
| A5 | nivel_max | C0 | sobe | +1,467 | <0,001 | coerente |
| A6 | nivel_max | C0 | desce | +0,067 | 1,000 | nulo |
| A7 | E1_atrib | C0 | sobe | +0,463 | <0,001 | coerente |
| C1 | E4_custopol | C0 | sobe | +2,985 | <0,001 | coerente |
| C2 | E4_custopol | C0 | sobe | 0,000 | 1,000 | nulo |
| C3 | E4_custopol | C0 | sobe | 0,000 | 1,000 | nulo |
| C4 | E4_custopol | C0 | sobe | +0,577 | <0,001 | coerente |
| C6 | apoio_publico_final | C0 | desce | -3,938 | <0,001 | coerente |
| C7 | apoio_publico_final | C0 | desce | -36,807 | <0,001 | coerente |
| T1 | E2_infra | C0 | desce | -5,690 | <0,001 | coerente |
| T1 | n_incidentes_hibridos | C0 | sobe | +6,833 | <0,001 | coerente |
| T2 | E1_atrib | C0 | desce | -0,113 | <0,001 | coerente |
| T3 | E2_infra | C0 | desce | -6,200 | <0,001 | coerente |
| T4 | n_ocorr_crim | C0 | sobe | +83,333 | <0,001 | coerente |
| T5 | n_ocorr_crim | C0 | sobe | +15,933 | 0,199 | nulo |
| E1 | E1_atrib | C0 | sobe | +0,261 | <0,001 | coerente |
| E1 | E5_ordem | C0 | sobe | +0,363 | <0,001 | coerente |
| E2 | E1_atrib | C0 | sobe | +0,175 | <0,001 | coerente |
| E2 | E5_ordem | C0 | sobe | +0,204 | <0,001 | coerente |
| D1 | E5_ordem | C0 | sobe | +0,003 | 1,000 | nulo |
| D3 | E4_custopol | C0 | sobe | +0,389 | 0,163 | nulo |

Resumo: 22 coerentes, 13 sem efeito detectável, 0 contraintuitivos.

"Sem efeito detectável" não confirma nem refuta a hipótese: o parâmetro pode estar saturado nesta configuração ou o efeito pode ser menor do que o lote resolve. "Contraintuitivo" pede exame do mecanismo antes de qualquer uso analítico.

## Parâmetros inertes nesta configuração

- C2 Peso do excesso de força (`INFOCOG.custo.pesoExcesso`)
- C3 Peso dos danos a terceiros (`INFOCOG.custo.pesoDanos`)
- C5 Teto de custo político (`INFOCOG.tetoCustoPolitico`)
- T6 Ocorrências de cobertura (`ACOPLAMENTO.pCoberturaMax`)

