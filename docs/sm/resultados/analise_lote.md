# Análise do lote da OAS-SM — resultados

Gerado por `node scripts/sm_analise.js` sobre `data/sm/dataset_oas_sm.csv` (1040 partidas). Pipeline do Desenho Experimental v1.3 §7, reproduzido sem dependências (`shared/sm/estatistica.js`); o mesmo CSV segue importável no Jamovi/R. Os números refletem os parâmetros placeholder: servem para verificar o pipeline e orientar a revisão, não para conclusões sobre as capacidades.

## 1. Ablação (contribuição marginal de cada capacidade)

Diferença C0 − Ci (todas as capacidades menos a capacidade sem ela), pareada pela semente; p corrigido por Holm entre as cinco capacidades de cada métrica; dz = d de Cohen para pares. Sinal a favor do Azul: E4 e E6 menores são melhores.

| Capacidade retirada | E1_atrib | E2_infra | E3_escalada | E4_custopol | E5_ordem | E6_dispersao | sloc_idx |
|---|---|---|---|---|---|---|---|
| A_MPA | +0,016 (dz 0,14) | -0,143 (dz -0,06) | -0,480 (dz -0,07) | +0,035 (dz 0,02) | +0,004 (dz 0,23) | -0,000 (dz -0,03) | +0,002 (dz 0,29) |
| B_NPaOc | +0,053 (dz 0,36) | +1,229 (dz 0,34) | -1,440 (dz -0,13) | **+4,126 (dz 2,14)** | **+0,102 (dz 3,11)** | **+0,053 (dz 1,51)** | **+0,006 (dz 0,40)** |
| C_Fusao | **+0,352 (dz 2,05)** | **+3,829 (dz 0,96)** | **-6,160 (dz -0,60)** | **-3,477 (dz -1,40)** | **+0,062 (dz 2,26)** | -0,005 (dz -0,19) | +0,004 (dz 0,33) |
| D_USV | -0,005 (dz -0,03) | -0,071 (dz -0,02) | -0,540 (dz -0,06) | -0,087 (dz -0,05) | **+0,008 (dz 0,34)** | -0,004 (dz -0,25) | +0,003 (dz 0,12) |
| E_GVI | +0,024 (dz 0,14) | +0,629 (dz 0,19) | -0,020 (dz -0,00) | **-1,743 (dz -0,83)** | **+0,084 (dz 2,80)** | +0,000 (dz 0,01) | **+0,006 (dz 0,52)** |

Em negrito: p de Holm < 0,05.

## 2. Fatorial 2⁵ — ANOVA

Modelo com os 5 efeitos principais e as 10 interações de 2ª ordem; o resíduo absorve as interações de ordem superior e a variação entre réplicas (n = 640). Efeito = média em +1 − média em −1.

| Termo | E1_atrib efeito (η²p) | E2_infra efeito (η²p) | E3_escalada efeito (η²p) | E4_custopol efeito (η²p) | E5_ordem efeito (η²p) | E6_dispersao efeito (η²p) | sloc_idx efeito (η²p) |
|---|---|---|---|---|---|---|---|
| A_MPA | +0,003 (0,00) | -0,016 (0,00) | +0,219 (0,00) | -0,025 (0,00) | +0,002 (0,00) | -0,001 (0,00) | -0,000 (0,00) |
| B_NPaOc | **+0,058 (0,06)** | +0,708 (0,01) | +0,931 (0,01) | **+6,118 (0,85)** | **+0,044 (0,72)** | **+0,051 (0,34)** | +0,001 (0,00) |
| C_Fusao | **+0,362 (0,73)** | **+3,560 (0,16)** | **-4,862 (0,13)** | **-1,006 (0,13)** | **+0,022 (0,40)** | -0,004 (0,00) | +0,001 (0,00) |
| D_USV | +0,005 (0,00) | +0,092 (0,00) | -0,731 (0,00) | +0,114 (0,00) | +0,001 (0,00) | -0,002 (0,00) | -0,001 (0,00) |
| E_GVI | -0,003 (0,00) | +0,029 (0,00) | 0,000 (0,00) | **-0,508 (0,04)** | **+0,032 (0,58)** | -0,000 (0,00) | +0,000 (0,00) |
| B_NPaOc×C_Fusao | **+0,031 (0,02)** | +0,145 (0,00) | +0,931 (0,01) | **-0,971 (0,13)** | **+0,020 (0,35)** | -0,000 (0,00) | -0,000 (0,00) |
| B_NPaOc×E_GVI | -0,002 (0,00) | +0,060 (0,00) | -0,206 (0,00) | **-0,420 (0,03)** | **+0,028 (0,50)** | -0,001 (0,00) | +0,000 (0,00) |
| C_Fusao×E_GVI | -0,008 (0,00) | -0,033 (0,00) | 0,000 (0,00) | **-0,492 (0,04)** | **+0,014 (0,20)** | +0,000 (0,00) | +0,000 (0,00) |

Em negrito: p < 0,05 e η²p ≥ 0,01. Interações sem nenhum efeito assim foram omitidas da tabela (estão no cálculo).

## 3. Regressão logística

**Escalada a N3 (nivel_max = 3)** — 85 eventos em 640 partidas.

Eventos por nível: A_MPA 45 (−1) / 40 (+1); B_NPaOc 45 (−1) / 40 (+1); C_Fusao 0 (−1) / 85 (+1); D_USV 35 (−1) / 50 (+1); E_GVI 42 (−1) / 43 (+1).

**Separação:** C_Fusao separa os desfechos — num dos níveis não há nenhum evento, e o coeficiente da logística iria ao infinito. O efeito desse fator é a própria tabela acima; o modelo abaixo é ajustado só dentro do nível com eventos, sobre os demais fatores.

| Termo | coeficiente (logit) | razão de chances (+1 × −1) | EP | p |
|---|---|---|---|---|
| (intercepto) | -1,034 | — | 0,128 | <0,001 |
| A_MPA | -0,081 | 0,85 | 0,128 | 0,524 |
| B_NPaOc | -0,081 | 0,85 | 0,128 | 0,524 |
| D_USV | +0,243 | 1,63 | 0,128 | 0,058 |
| E_GVI | +0,016 | 1,03 | 0,127 | 0,899 |

n = 320, 85 eventos. Codificação ±1: a razão de chances de +1 contra −1 é exp(2 × coeficiente). IRLS convergiu em 5 iterações.

**Perda do KCV (kcv_perdido)** — 16 eventos em 640 partidas.

Eventos por nível: A_MPA 9 (−1) / 7 (+1); B_NPaOc 8 (−1) / 8 (+1); C_Fusao 0 (−1) / 16 (+1); D_USV 5 (−1) / 11 (+1); E_GVI 7 (−1) / 9 (+1).

**Separação:** C_Fusao separa os desfechos — num dos níveis não há nenhum evento, e o coeficiente da logística iria ao infinito. O efeito desse fator é a própria tabela acima; o modelo abaixo é ajustado só dentro do nível com eventos, sobre os demais fatores.

| Termo | coeficiente (logit) | razão de chances (+1 × −1) | EP | p |
|---|---|---|---|---|
| (intercepto) | -3,036 | — | 0,279 | <0,001 |
| A_MPA | -0,133 | 0,77 | 0,259 | 0,607 |
| B_NPaOc | -0,000 | 1,00 | 0,258 | 1,000 |
| D_USV | +0,415 | 2,29 | 0,276 | 0,133 |
| E_GVI | +0,133 | 1,31 | 0,259 | 0,607 |

n = 320, 16 eventos. Codificação ±1: a razão de chances de +1 contra −1 é exp(2 × coeficiente). IRLS convergiu em 8 iterações.

## 4. Pareto: custo EAC × efeito

Médias por condição do fatorial (32). Custo = soma do EAC das capacidades ativas (Tabela 2.2: A_MPA 70, B_NPaOc 100, C_Fusao 55, D_USV 35, E_GVI 40). Rótulo = capacidades ativas pela letra (A–E).

**E1_atrib** — fronteira: ∅ (0; 0,182) → D (35; 0,250) → C (55; 0,559) → CE (95; 0,559) → BC (155; 0,631) → BCD (190; 0,667).

**E2_infra** — fronteira: ∅ (0; 84,393) → D (35; 85,500) → C (55; 88,286) → CD (90; 88,607) → AC (125; 88,893) → BC (155; 89,071) → BCD (190; 89,786).

**E5_ordem** — fronteira: ∅ (0; 0,001) → E (40; 0,004) → CE (95; 0,007) → B (100; 0,009) → BD (135; 0,009) → BE (140; 0,037) → BDE (175; 0,041) → BCE (195; 0,110) → BCDE (230; 0,115).

Sensibilidade da fronteira ao vetor de custo: cada custo EAC a −30% e +30% (os demais fixos). Conta as condições que entram ou saem da fronteira.

| Custo alterado | E1_atrib −30% | E1_atrib +30% | E2_infra −30% | E2_infra +30% | E5_ordem −30% | E5_ordem +30% |
|---|---|---|---|---|---|---|
| A_MPA | 0 | 0 | 0 | 0 | **2** | 0 |
| B_NPaOc | 0 | 0 | **1** | 0 | **1** | 0 |
| C_Fusao | 0 | 0 | 0 | 0 | **2** | **2** |
| D_USV | 0 | **1** | 0 | **2** | 0 | **1** |
| E_GVI | **1** | 0 | **2** | 0 | **1** | **1** |

## 5. Contraste de apoio externo (C0, disponível × indisponível)

| Métrica | com apoio | sem apoio | diferença | dz | p (pareado) |
|---|---|---|---|---|---|
| E5_ordem | 0,121 | 0,082 | +0,039 | 1,65 | <0,001 |
| E1_atrib | 0,645 | 0,389 | +0,256 | 1,26 | <0,001 |
| E4_custopol | 4,552 | 4,936 | -0,384 | -0,24 | 0,101 |

Com apoio_externo = 0, apoios concedidos: 0 (critério de aceitação: nenhum).

## 6. Compromisso E5_ordem × E1_atrib em função de C_Fusão

| C_Fusão | E1_atrib | E5_ordem | E6_dispersao | correlação E5 × E1 (entre partidas) |
|---|---|---|---|---|
| −1 | 0,235 | 0,014 | 0,155 | 0,099 |
| +1 | 0,597 | 0,037 | 0,152 | 0,179 |

Um compromisso (Desenho §4) apareceria como correlação negativa entre E5 e E1. Com a doutrina fixa do agente, as duas métricas sobem juntas com a fusão; o compromisso só se exprime quando o decisor escolhe onde gastar as ações — isto é, em partidas com humanos ou com doutrinas alternativas.

## 7. Sensibilidade do desfecho aos limiares

Desfechos no lote: indecisa 866, derrota_vermelha_kcv 59, conflito_vitoria_azul 33, conflito_vitoria_vermelha 74, conflito_indeciso 8. 174 partidas terminaram por N3 ou derrota estratégica e não dependem destes limiares. Reclassificação das 866 demais (verificada contra o motor: idêntica) — % de vitória Azul:

| infraVitoriaAzul \ ordemVitoriaAzul | 0,05 | 0,10 | 0,15 | 0,20 | 0,30 | 0,40 |
|---|---|---|---|---|---|---|
| 70 | 34% | 16% | 2% | 0% | 0% | 0% |
| 75 | 34% | 16% | 2% | 0% | 0% | 0% |
| 80 | 32% | 15% | 2% | 0% | 0% | **0%** |
| 85 | 24% | 12% | 1% | 0% | 0% | 0% |
| 90 | 11% | 7% | 1% | 0% | 0% | 0% |

Em negrito, os limiares atuais (80 / 0.4). E5_ordem nas partidas que chegaram ao fim: mediana 0,023, máximo 0,211. Com o limiar de ordem acima do que o modelo produz, "indecisa" domina por construção — os limiares de DESFECHO e a cadeia de repressão (seis etapas) precisam ser calibrados juntos.

