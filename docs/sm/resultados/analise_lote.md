# Análise do lote da OAS-SM — resultados

Gerado por `node scripts/sm_analise.js` sobre `data/sm/dataset_oas_sm.csv` (1040 partidas). Pipeline do Desenho Experimental v1.3 §7, reproduzido sem dependências (`shared/sm/estatistica.js`); o mesmo CSV segue importável no Jamovi/R. Os números refletem os parâmetros placeholder: servem para verificar o pipeline e orientar a revisão, não para conclusões sobre as capacidades.

## 1. Ablação (contribuição marginal de cada capacidade)

Diferença C0 − Ci (todas as capacidades menos a capacidade sem ela), pareada pela semente; p corrigido por Holm entre as cinco capacidades de cada métrica; dz = d de Cohen para pares. Sinal a favor do Azul: E4 e E6 menores são melhores.

| Capacidade retirada | E1_atrib | E2_infra | E3_escalada | E4_custopol | E5_ordem | E6_dispersao | sloc_idx |
|---|---|---|---|---|---|---|---|
| A_MPA | -0,015 (dz -0,11) | -0,400 (dz -0,13) | +0,940 (dz 0,10) | -0,396 (dz -0,11) | +0,003 (dz 0,14) | +0,000 (dz 0,02) | +0,001 (dz 0,11) |
| B_NPaOc | +0,018 (dz 0,12) | +0,300 (dz 0,07) | +0,480 (dz 0,04) | **+5,338 (dz 1,53)** | **+0,099 (dz 3,60)** | **+0,051 (dz 1,50)** | **+0,008 (dz 0,47)** |
| C_Fusao | **+0,353 (dz 2,19)** | **+3,786 (dz 0,92)** | **-6,020 (dz -0,53)** | **-6,610 (dz -1,24)** | **+0,062 (dz 2,79)** | +0,009 (dz 0,32) | +0,003 (dz 0,21) |
| D_USV | +0,019 (dz 0,11) | +0,357 (dz 0,10) | -0,180 (dz -0,02) | -1,080 (dz -0,21) | **+0,008 (dz 0,36)** | +0,001 (dz 0,06) | +0,003 (dz 0,16) |
| E_GVI | -0,014 (dz -0,10) | +0,414 (dz 0,10) | -0,600 (dz -0,06) | **-2,078 (dz -0,60)** | **+0,082 (dz 3,42)** | +0,000 (dz 0,00) | +0,004 (dz 0,24) |

Em negrito: p de Holm < 0,05.

## 2. Fatorial 2⁵ — ANOVA

Modelo com os 5 efeitos principais e as 10 interações de 2ª ordem; o resíduo absorve as interações de ordem superior e a variação entre réplicas (n = 640). Efeito = média em +1 − média em −1.

| Termo | E1_atrib efeito (η²p) | E2_infra efeito (η²p) | E3_escalada efeito (η²p) | E4_custopol efeito (η²p) | E5_ordem efeito (η²p) | E6_dispersao efeito (η²p) | sloc_idx efeito (η²p) |
|---|---|---|---|---|---|---|---|
| A_MPA | +0,006 (0,00) | +0,141 (0,00) | -0,184 (0,00) | -0,349 (0,00) | +0,000 (0,00) | +0,001 (0,00) | +0,000 (0,00) |
| B_NPaOc | **+0,036 (0,02)** | +0,431 (0,00) | +1,047 (0,01) | **+8,666 (0,74)** | **+0,046 (0,74)** | **+0,047 (0,35)** | +0,001 (0,00) |
| C_Fusao | **+0,352 (0,69)** | **+3,364 (0,14)** | **-4,772 (0,11)** | **-1,715 (0,10)** | **+0,025 (0,45)** | **+0,007 (0,01)** | -0,001 (0,00) |
| D_USV | -0,004 (0,00) | +0,391 (0,00) | -0,991 (0,01) | +0,076 (0,00) | +0,001 (0,00) | **-0,007 (0,01)** | -0,000 (0,00) |
| E_GVI | +0,004 (0,00) | +0,176 (0,00) | +0,041 (0,00) | -0,042 (0,00) | **+0,031 (0,57)** | -0,000 (0,00) | +0,001 (0,00) |
| B_NPaOc×C_Fusao | **+0,026 (0,01)** | -0,145 (0,00) | +1,066 (0,01) | **-1,549 (0,08)** | **+0,023 (0,40)** | -0,001 (0,00) | -0,001 (0,00) |
| B_NPaOc×E_GVI | +0,001 (0,00) | +0,069 (0,00) | -0,097 (0,00) | -0,014 (0,00) | **+0,028 (0,50)** | +0,000 (0,00) | +0,002 (0,00) |
| C_Fusao×E_GVI | +0,006 (0,00) | +0,172 (0,00) | +0,059 (0,00) | **-0,603 (0,01)** | **+0,015 (0,22)** | +0,001 (0,00) | +0,000 (0,00) |

Em negrito: p < 0,05 e η²p ≥ 0,01. Interações sem nenhum efeito assim foram omitidas da tabela (estão no cálculo).

## 3. Regressão logística

**Escalada a N3 (nivel_max = 3)** — 75 eventos em 640 partidas.

Eventos por nível: A_MPA 33 (−1) / 42 (+1); B_NPaOc 44 (−1) / 31 (+1); C_Fusao 0 (−1) / 75 (+1); D_USV 29 (−1) / 46 (+1); E_GVI 39 (−1) / 36 (+1).

**Separação:** C_Fusao separa os desfechos — num dos níveis não há nenhum evento, e o coeficiente da logística iria ao infinito. O efeito desse fator é a própria tabela acima; o modelo abaixo é ajustado só dentro do nível com eventos, sobre os demais fatores.

| Termo | coeficiente (logit) | razão de chances (+1 × −1) | EP | p |
|---|---|---|---|---|
| (intercepto) | -1,230 | — | 0,137 | <0,001 |
| A_MPA | +0,161 | 1,38 | 0,134 | 0,230 |
| B_NPaOc | -0,233 | 0,63 | 0,135 | 0,084 |
| D_USV | +0,305 | 1,84 | 0,136 | 0,025 |
| E_GVI | -0,054 | 0,90 | 0,134 | 0,688 |

n = 320, 75 eventos. Codificação ±1: a razão de chances de +1 contra −1 é exp(2 × coeficiente). IRLS convergiu em 6 iterações.

**Perda do KCV (kcv_perdido)** — 5 eventos em 640 partidas.

Poucos eventos para estimar o modelo (menos de 10 numa das classes).

## 4. Pareto: custo EAC × efeito

Médias por condição do fatorial (32). Custo = soma do EAC das capacidades ativas (Tabela 2.2: A_MPA 70, B_NPaOc 100, C_Fusao 55, D_USV 35, E_GVI 40). Rótulo = capacidades ativas pela letra (A–E).

**E1_atrib** — fronteira: ∅ (0; 0,202) → D (35; 0,237) → C (55; 0,562) → CE (95; 0,563) → BC (155; 0,609) → ABC (225; 0,626) → ABCE (265; 0,645).

**E2_infra** — fronteira: ∅ (0; 84,357) → D (35; 85,071) → C (55; 88,214) → CD (90; 88,607) → CDE (130; 88,679) → BCD (190; 88,821) → BCDE (230; 89,143) → ABCDE (300; 89,214).

**E5_ordem** — fronteira: ∅ (0; 0,001) → E (40; 0,004) → CE (95; 0,006) → B (100; 0,009) → BE (140; 0,036) → BDE (175; 0,039) → BCE (195; 0,113) → BCDE (230; 0,119) → ABCDE (300; 0,119).

Sensibilidade da fronteira ao vetor de custo: cada custo EAC a −30% e +30% (os demais fixos). Conta as condições que entram ou saem da fronteira.

| Custo alterado | E1_atrib −30% | E1_atrib +30% | E2_infra −30% | E2_infra +30% | E5_ordem −30% | E5_ordem +30% |
|---|---|---|---|---|---|---|
| A_MPA | 0 | **1** | **1** | 0 | **1** | 0 |
| B_NPaOc | 0 | 0 | 0 | **1** | **1** | 0 |
| C_Fusao | 0 | 0 | 0 | 0 | **2** | **2** |
| D_USV | **1** | **1** | 0 | **2** | 0 | 0 |
| E_GVI | **2** | 0 | **3** | 0 | 0 | **1** |

## 5. Contraste de apoio externo (C0, disponível × indisponível)

| Métrica | com apoio | sem apoio | diferença | dz | p (pareado) |
|---|---|---|---|---|---|
| E5_ordem | 0,112 | 0,076 | +0,037 | 1,57 | <0,001 |
| E1_atrib | 0,656 | 0,393 | +0,263 | 1,54 | <0,001 |
| E4_custopol | 8,616 | 7,587 | +1,029 | 0,22 | 0,133 |

Com apoio_externo = 0, apoios concedidos: 0 (critério de aceitação: nenhum).

## 6. Compromisso E5_ordem × E1_atrib em função de C_Fusão

| C_Fusão | E1_atrib | E5_ordem | E6_dispersao | correlação E5 × E1 (entre partidas) |
|---|---|---|---|---|
| −1 | 0,230 | 0,013 | 0,127 | 0,024 |
| +1 | 0,583 | 0,038 | 0,134 | 0,118 |

Um compromisso (Desenho §4) apareceria como correlação negativa entre E5 e E1. Com a doutrina fixa do agente, as duas métricas sobem juntas com a fusão; o compromisso só se exprime quando o decisor escolhe onde gastar as ações — isto é, em partidas com humanos ou com doutrinas alternativas.

## 7. Sensibilidade do desfecho aos limiares

Desfechos no lote: indecisa 869, derrota_vermelha_kcv 50, conflito_vitoria_azul 32, conflito_vitoria_vermelha 74, conflito_indeciso 12, derrota_estrategica_azul 3. 171 partidas terminaram por N3 ou derrota estratégica e não dependem destes limiares. Reclassificação das 869 demais (verificada contra o motor: idêntica) — % de vitória Azul:

| infraVitoriaAzul \ ordemVitoriaAzul | 0,05 | 0,10 | 0,15 | 0,20 | 0,30 | 0,40 |
|---|---|---|---|---|---|---|
| 70 | 33% | 17% | 1% | 0% | 0% | 0% |
| 75 | 33% | 17% | 1% | 0% | 0% | 0% |
| 80 | 32% | 17% | 1% | 0% | 0% | **0%** |
| 85 | 25% | 13% | 1% | 0% | 0% | 0% |
| 90 | 10% | 6% | 0% | 0% | 0% | 0% |

Em negrito, os limiares atuais (80 / 0.4). E5_ordem nas partidas que chegaram ao fim: mediana 0,022, máximo 0,162. Com o limiar de ordem acima do que o modelo produz, "indecisa" domina por construção — os limiares de DESFECHO e a cadeia de repressão (seis etapas) precisam ser calibrados juntos.

