# SM-8 — Runner e coleta com o novo esquema de dados

**Estado:** concluída · **Especificação:** Desenho Experimental v1.3 §2–§8 (Tabelas 2.2, 4.1, 5.1, 5.2 e 6.1); Conceito v1.6 §8.6, §9.3–9.4 e §11.

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Blocos novos, todos placeholders `// TODO: validar com especialista`: <ul><li>`HIBRIDO`: ações por vetor, investigação pós-fato, emprego aberto;</li><li>`DOUTRINA`: orçamento de ações, surto, quadro comum, urgência, campanhas;</li><li>`DESFECHO`;</li><li>`CUSTO_EAC` (70/100/55/35/40, Tabela 2.2);</li><li>`SAL_RUNNER`.</li></ul> |
| `shared/sm/constab.js` | `injetarOcorrencia`: ocorrências das crises, injetadas sem consumir as sub-sequências do gerador. |
| `shared/sm/runner.js` | `jogarPartida` (uma campanha), `jogarTerminal` (N3 com o jogo base), `condicoes`, `delineamento`, `linhaDe`, `rodarLote`, `paraCsv`, `COLUNAS`, `CFG_PESQUISA`. |
| `scripts/sm_lote.js` / `npm run sm:lote` | Roda o lote e grava `data/sm/dataset_oas_sm.csv`. O CSV gerado fica fora do git (`.gitignore`), por ser reproduzível pelo comando. |
| `scripts/test_sm_runner.js` | 42 verificações, incluídas no `npm test`. Inclui o lote completo de 1.040 partidas. |

## O laço do turno (24 h)

1. **Crises (SM-5):**
   - crimes e pesca em massa injetam ocorrências;
   - sabotagem gera uma ação híbrida contra cabo ou duto da área;
   - SAR e desastre geram uma tarefa.

   Os marcos são registrados assim:
   - Detecção: quando o episódio entra no quadro.
   - Resposta adequada: metade das ocorrências reprimida, a sabotagem frustrada ou a tarefa atendida.
2. **Ocorrências constabulares (SM-3)**, com saturação e cobertura pela intensidade híbrida.
3. **Agente Vermelho (motor):**
   - a cada turno, Poisson(0,6 × intensidade) ações por vetor da Tabela 4.1, contra a infraestrutura das áreas ativas (70% na área-alvo);
   - o ciberataque resolve no próprio turno;
   - a desinformação incide sobre o gatilho aberto mais recente, ou há uma fabricação a cada 5 turnos;
   - o emprego aberto de meios (gatilho de N3) só ocorre em N2 e com intensidade ≥ 0,8.
4. **Quadro comum:** cada contato aberto entra no quadro com chance de 0,25 + 0,6 × fusão (com MPA/CENSIPAM em vigor), + 0,15 com sistemas não tripulados, teto de 0,95. No avançado, o híbrido só aparece no contato.
5. **COMPAAz:**
   - pede MPA, PF, RF, IBAMA, CENSIPAM ou inteligência para a área com mais contatos pertinentes;
   - lança a campanha informacional, nesta ordem de preferência: prova documentada (se houve inspeção ou apresamento no turno anterior), transparência sobre um gatilho aberto, comunicação estratégica (com apoio abaixo de 50) ou prebunking periódico.
6. **Prontidão (SM-6):** SAR e FPE são acionados no 1º turno. Os demais meios são acionados quando o acúmulo da estação passa dos meios disponíveis e chegam 48 h depois.
7. **Respostas:**
   - **Tarefas de vida (SAR) primeiro.** Depois cada estação gasta seu orçamento: 4 ações, mais um surto de 2 quando o acúmulo excede o orçamento, descontado no turno seguinte (§8.6).
   - **A Esquadra** responde ao híbrido em qualquer área.
   - **Os DN** respondem ao híbrido e às ocorrências da sua área.
   - **Contra o híbrido**, o alvo do encontro é a resposta que a atribuição fundamenta sob a ROE efetiva (SM-2 × SM-7). A um turno do efeito, a doutrina aceita o risco político e vai à etapa que neutraliza.
   - **Contra o crime**, a autoridade constabular vale até a etapa de repressão do tipo.
   - **Meios livres patrulham** atrás de contatos ocultos.
   - **Custo político:** cada encontro passa por `registrarAcaoAzul` (SM-7). No híbrido, a atribuição considerada é a do momento de decidir. No constabular, é a obtida na própria inspeção.
8. **Efeitos do híbrido:**
   - a ação não frustrada no prazo causa dano à infraestrutura e vira evento para a escada;
   - a ação consumada é percebida e investigada por 10 turnos, com o ritmo da dificuldade e da inteligência internacional;
   - quando a atribuição chega à robusta (70%), a investigação gera o evento do tipo da ação (dano_infra ou ataque_armado), que é o caminho para N2 e N3.
9. **Escada (SM-2)**, autorizada pelo COMPAAz. A doutrina autoriza todas as transições.
10. **N3:** joga a partida do jogo base com a mesma semente, o pacote de capacidades completo e o motor de salva intocado, capturando o estado final pelo coletor de passos. Isso encerra a campanha:
    - perda do KCV ⇒ `derrota_vermelha_kcv`;
    - senão, o vencedor do conflito.
11. **Dimensão informacional (SM-7):** campanhas em vigor e retorno do apoio. Custo político acima do teto encerra a campanha em `derrota_estrategica_azul`.

**Abstrações:**

- **Espaço:** dentro da área o meio alcança o contato no turno (24 h, hexágono de ~75 mn); a Esquadra atua em qualquer área.
- **Combustível:** Fuel Points não são modelados no runner; o movimento hexágono a hexágono fica para a UI (SM-9).
- **Determinismo:** toda a aleatoriedade vem da semente, em sub-sequências próprias (rotina, saturação, apoios, crises, quadro, encontros, Vermelho).

## Dataset

- **Formato:** uma linha por partida, em CSV UTF-8, com vírgula como separador, ponto decimal, quebra de linha LF e campo vazio para ausente.
- **Colunas:** primeiro as 33 da Tabela 6.1, na ordem: `bloco, condicao, replica, semente, modalidade_C2, apoio_externo, A_MPA, B_NPaOc, C_Fusao, D_USV, E_GVI, n_capacidades, custo_total, E1_atrib … E6_dispersao, n_ocorr_crim, ocorr_reprimidas, mpa_solicitada, mpa_atendida, apoio_pf … apoio_intl, n_apoios_concedidos, efeito_apoio, sloc_idx, kcv_perdido, nivel_max`. Depois, as complementares: `atrito_terminal` (Tabela 4.1), `desfecho`, `turnos`, `n_incidentes_hibridos`, `apoio_publico_final`, `crise_deteccao_media`, `crise_resposta_media`.

**Grafia:** `C_Fusão` está como `C_Fusao`, para importar no R sem ajuste.

**Definições operacionais** (a Tabela 4.1 define o conceito, não a fórmula):

| Métrica | Definição |
|---|---|
| E1_atrib | ações híbridas frustradas ou atribuídas com robustez ÷ ações híbridas; vazio se não houve nenhuma |
| E2_infra | SP final da infraestrutura ÷ SP inicial × 100 |
| E3_escalada | turnos jogados abaixo de N3 |
| E4_custopol | custo político acumulado |
| E5_ordem | ocorrências reprimidas ÷ geradas |
| E6_dispersao | esforço em ocorrências instrumentalizadas ÷ esforço constabular |
| sloc_idx | 1 − (área-turnos com ameaça aberta às SLOC ÷ área-turnos) |

**Desenhos:**

| Bloco | Condições | Réplicas | Partidas | Sementes |
|---|---|---|---|---|
| Ablação | C0 + C1–C5 | 50 | 300 | 5001–5050 |
| Fatorial 2⁵ | F01–F32 (Yates) | 20 | 640 | 7001–7020 |
| Contraste | C0 × apoio_externo 1/0 | 50 | 100 | 9001–9050 |
| **Total** | | | **1.040** | |

As sementes são espelhadas entre as condições de cada bloco. A configuração de pesquisa (`CFG_PESQUISA`) é: jogador único, intermediário, 45 dias, intensidade híbrida 0,5, todas as áreas e trilhas.

## Primeiro lote (parâmetros placeholder)

O lote de 1.040 partidas leva cerca de 7 s. Importado com o pandas (como substituto do Jamovi/R, ausentes nesta máquina), dá 1.040 × 40, com todas as colunas numéricas lidas como números.

Efeitos principais no fatorial (média em +1 menos média em −1):

| Métrica | A_MPA | B_NPaOc | C_Fusao | D_USV | E_GVI |
|---|---|---|---|---|---|
| E1_atrib | +0,003 | +0,058 | **+0,362** | +0,005 | −0,003 |
| E2_infra | −0,02 | +0,71 | **+3,56** | +0,09 | +0,03 |
| E4_custopol | −0,03 | **+6,12** | −1,01 | +0,11 | −0,51 |
| E5_ordem | +0,002 | **+0,044** | +0,022 | +0,001 | +0,032 |
| nivel_max | +0,01 | −0,04 | **+1,17** | +0,05 | −0,02 |

- **Contraste de apoio:** com apoio, E1 vai de 0,39 a 0,65, E5 de 0,08 a 0,12 e E4 de 4,9 a 4,6.
- **Desfechos:** 83% indecisa, 17% chegam a N3, com 59 perdas do KCV.

**Para a SM-10 (sensibilidade/calibração):**

- **C_Fusão** é o fator mais sensível, como o Conceito §7.2 antecipa. A fusão melhor também leva a mais escalada, porque atribuição robusta é o gatilho de N2/N3.
- **A_MPA e D_USV** saem quase sem efeito. Com todas as fontes e o C_Fusão ligados, a fusão já é 1 e a chance de entrar no quadro bate no teto, então o bônus satura. Eles só pesam sem C_Fusão. É um ponto de calibração, não de código.
- **"Indecisa"** domina o desfecho porque E5 fica baixo (~0,1) diante do limiar de vitória Azul (0,4). Os limiares de `DESFECHO` são placeholders.

## Como validar

```bash
node scripts/test_sm_runner.js   # só a SM-8 (inclui o lote de 1.040)
npm run sm:lote                  # gera data/sm/dataset_oas_sm.csv
npm test                         # tudo
```
