# OAS-SM — Questionário de validação de face

Revisão por especialistas dos parâmetros de projeto da variante de Segurança Marítima (SM-10). Todos os valores abaixo são **placeholders**: foram escolhidos para que o modelo funcione, não a partir de dados. Nada do que o lote produz deve ser usado analiticamente antes desta revisão (Desenho Experimental v1.3, aviso).

## Como responder

1. Para cada item, indique se o valor é plausível. Se não for, proponha um valor (ou uma faixa) e a fonte ou o raciocínio.
2. Registre a confiança: **baixa** (palpite informado), **média** (experiência direta) ou **alta** (dado documentado).
3. Os itens de prioridade **alta** mudam as métricas em mais de um desvio-padrão, ou mudam a conclusão principal do lote. Comece por eles.
4. Valores revisados entram no modelo sem mudar o código: copie `params_especialista.exemplo.json`, edite e rode `node scripts/sm_lote.js --params arquivo.json` (e `sm_sensibilidade.js --params` para a sensibilidade em torno deles). Chaves que começam com "_" registram revisor, data e fonte.
5. Itens marcados **estrutural** (ordem de batalha, bases, infraestrutura) são editados no próprio código (`shared/sm/oob_sm.js`).

Prioridades calculadas a partir de `node scripts/sm_sensibilidade.js` (30 réplicas).

## Resumo por prioridade

| # | Parâmetro | Seção | Prioridade |
|---|---|---|---|
| 1 | `P_BASE` | Motor de encontro (Conceito §9.1) | alta |
| 2 | `PISO_FUSAO` | Motor de encontro (Conceito §9.1) | alta |
| 3 | `CAPACIDADE_POR_TIPO` | Motor de encontro (Conceito §9.1) | alta |
| 4 | `GANHO_EVIDENCIA` | Atribuição (Conceito §9.2) | alta |
| 5 | `FATOR_NEGABILIDADE` | Atribuição (Conceito §9.2) | alta |
| 6 | `PISO_FUSAO_EVIDENCIA` | Atribuição (Conceito §9.2) | alta |
| 7 | `LIMIAR_ATRIBUICAO` | Atribuição (Conceito §9.2) | alta |
| 8 | `PESO_POLITICO` | Atribuição (Conceito §9.2) | alta |
| 12 | `TIPOS_OCORRENCIA` | Trilha constabular (Conceito §5, Tabela 5.1) | alta |
| 13 | `ACOPLAMENTO` | Trilha constabular (Conceito §5, Tabela 5.1) | alta |
| 14 | `FONTES` | C2: estações, papéis e fusão (Conceito §7) | alta |
| 15 | `TETO_FUSAO_SEM_C` | C2: estações, papéis e fusão (Conceito §7) | alta |
| 17 | `DIFICULDADES` | Campanha (Conceito §8) | alta |
| 23 | `HIBRIDO` | Runner: agente Vermelho (híbrido), doutrina Azul e desfecho (SM-8) | alta |
| 25 | `DESFECHO` | Runner: agente Vermelho (híbrido), doutrina Azul e desfecho (SM-8) | alta |
| 9 | `GATILHOS_ESCALADA` | Escada de escalada (Conceito §9.3, Tabela 9.1) | média |
| 16 | `APOIOS` | Apoio externo via COMPAAz (Conceito §7.4, Tabela 7.2) | média |
| 21 | `INFOCOG` | Dimensão informacional e cognitiva (Conceito §6, §11.3) | média |
| 22 | `TERCEIROS` | Custos a terceiros (Conceito §11.3; SM-11) | média |
| 24 | `DOUTRINA` | Runner: agente Vermelho (híbrido), doutrina Azul e desfecho (SM-8) | média |
| 10 | `TURNOS_PARA_DESESCALAR` | Escada de escalada (Conceito §9.3, Tabela 9.1) | baixa |
| 11 | `AREAS_DN` | Trilha constabular (Conceito §5, Tabela 5.1) | não medida |
| 18 | `CRISES` | Campanha (Conceito §8) | não medida |
| 19 | `PRONTIDAO` | OOB de MarSec e prontidão (Conceito §10) | não medida |
| 20 | `FATOR_SEM_GVI` | OOB de MarSec e prontidão (Conceito §10) | não medida |
| 26 | `BASES` | OOB de MarSec (Conceito §10) | estrutural |
| 27 | `MEIOS_AZUIS` | OOB de MarSec (Conceito §10) | estrutural |
| 28 | `INFRA` | OOB de MarSec (Conceito §10) | estrutural |

## Questões de coerência do modelo

Pontos que a análise de sensibilidade e do lote revelaram na SM-10, com os parâmetros placeholder (números de `docs/sm/resultados/`), e que pedem decisão de quem conhece o domínio antes dos valores:

1. **Um só limiar de "atribuição robusta"?** O valor 70 aparece em quatro parâmetros: `CLASSES_ATRIBUICAO` (classe "robusta"), `GATILHOS_ESCALADA.N2/N3.atribuicaoMin` e `HIBRIDO.investigacao.robusta`. Mover só um deles muda a atribuição sem mudar a escalada (item A6 da sensibilidade). Devem ser o mesmo limiar?

   Resposta: 

2. **Excesso de força e danos a terceiros (respondida na revisão; SM-11).** As três situações apontadas — interrupção desnecessária da navegação mercante; uso de força desnecessário contra mercantes e pesqueiros; ações militares que provoquem danos ambientais — agora são geradas pelo modelo (bloco `TERCEIROS`). As frequências são placeholders: falsos alarmes (λ por área e turno e quanto a fusão os reduz), chance de esclarecer na interrogação, chance de força desnecessária por nível N0–N3, chance de dano ambiental por vetor. Estão plausíveis?

   Resposta: 

3. **Cadeia de repressão.** Narcotráfico, contrabando e pesca IUU só contam como reprimidos no apresamento, depois de detecção, identificação, interrogação, abordagem e inspeção em sequência (crime ambiental termina na inspeção; pirataria e imigração, na abordagem — `TIPOS_OCORRENCIA.*.etapaRepressao`). Por isso E5_ordem fica perto de 0,12 mesmo com todas as capacidades, e ±30% em `P_BASE` move E5 em 13 desvios-padrão. A repressão desses tipos exige mesmo o apresamento? As etapas devem ser independentes, ou o êxito numa torna a seguinte mais provável?

   Resposta: 

4. **Limiar de vitória fora do alcance.** `DESFECHO.ordemVitoriaAzul` = 0,4 está acima do máximo de E5 no lote (≈ 0,21); por isso 83% das partidas terminam "indecisa". O limiar deve ser calibrado junto com a cadeia de repressão.

   Resposta: 

5. **Saturação da fusão.** Os pesos das fontes somam 1: com todas as fontes, a fusão já é plena, e os bônus de MPA e CENSIPAM e o fator A_MPA quase não agem quando C_Fusão está presente. A fusão plena deve exigir todas as fontes, ou as fontes devem ter retornos decrescentes?

   Resposta: 

6. **C_Fusão separa a escalada a N3.** No fatorial não há nenhuma escalada a N3 nem perda do KCV sem C_Fusão: sem fusão ampliada a atribuição robusta não é alcançada. É plausível que, sem o SisGAAz ampliado, o país nunca chegue a atribuir um ataque com robustez suficiente para o conflito aberto?

   Resposta: 

7. **Custo político dominado pela atribuição.** Os parâmetros de atribuição (ganho de evidência, negabilidade, ritmo, limiares) movem E4_custopol em 11 a 14 desvios-padrão: a doutrina aceita agir à frente da atribuição quando o efeito do híbrido é iminente (`DOUTRINA.urgencia`). O custo de agir sem atribuição está no tamanho certo?

   Resposta: 

8. **Erosão do apoio público.** Em 45 dias o apoio cai de 60 para cerca de 24 com todas as capacidades e para cerca de 5 sem C_Fusão; o efeito-base da desinformação (`INFOCOG.desinformacao.base`) move o apoio final em 4 desvios-padrão. A desinformação adversária deve ter esse peso, e o retorno do apoio (`INFOCOG.retornoPorTurno`) deve ser tão lento?

   Resposta: 

9. **O compromisso E5 × E1 não aparece com a doutrina fixa.** O Desenho §4 prevê que perseguir ocorrências tire foco do híbrido. Com o agente doutrinário, E5 e E1 sobem juntas com a fusão (correlação positiva). O compromisso depende de escolha; deve ser examinado em partidas com humanos ou com doutrinas alternativas.

   Resposta: 

## Itens

### 1. `P_BASE` — Motor de encontro (Conceito §9.1)

*shared/sm/params.js* · prioridade **alta** — E1 (|d| máx. 11,17) · sobrescrevível por JSON

Probabilidade-base de sucesso da etapa, para unidade de capacidade 1 com fusão plena (1) e contato sem evasão.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `P_BASE.deteccao` | 0,85 | | | |
| `P_BASE.identificacao` | 0,75 | | | |
| `P_BASE.interrogacao` | 0,8 | | | |
| `P_BASE.abordagem` | 0,7 | | | |
| `P_BASE.inspecao` | 0,8 | | | |
| `P_BASE.apresamento` | 0,75 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 2. `PISO_FUSAO` — Motor de encontro (Conceito §9.1)

*shared/sm/params.js* · prioridade **alta** — F1 (|d| máx. 2,14) · sobrescrevível por JSON

Peso da fusão de dados por etapa: com fusão 0 a probabilidade cai a PISO_FUSAO × P_BASE; com fusão 1 fica em P_BASE. A fusão pesa mais na detecção e na identificação (consciência situacional) e pouco na execução da abordagem (Conceito §7.2; Desenho §3).

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `PISO_FUSAO.deteccao` | 0,4 | | | |
| `PISO_FUSAO.identificacao` | 0,45 | | | |
| `PISO_FUSAO.interrogacao` | 0,7 | | | |
| `PISO_FUSAO.abordagem` | 0,85 | | | |
| `PISO_FUSAO.inspecao` | 0,8 | | | |
| `PISO_FUSAO.apresamento` | 0,9 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 3. `CAPACIDADE_POR_TIPO` — Motor de encontro (Conceito §9.1)

*shared/sm/params.js* · prioridade **alta** — E2 (|d| máx. 6,36) · sobrescrevível por JSON

Capacidade da unidade por tipo de plataforma (board.js COMP_DISPLAY_TYPE), nos dois eixos, de 0 (incapaz) a 1. Tipo ausente = incapaz: encontro nulo. Uma unidade pode trazer `capSM: { sensor, gvi }` próprio, que prevalece.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `CAPACIDADE_POR_TIPO.patrulha_oc.sensor` | 0,85 | | | |
| `CAPACIDADE_POR_TIPO.patrulha_oc.gvi` | 0,9 | | | |
| `CAPACIDADE_POR_TIPO.patrulha_c.sensor` | 0,65 | | | |
| `CAPACIDADE_POR_TIPO.patrulha_c.gvi` | 0,8 | | | |
| `CAPACIDADE_POR_TIPO.fragata.sensor` | 1 | | | |
| `CAPACIDADE_POR_TIPO.fragata.gvi` | 0,75 | | | |
| `CAPACIDADE_POR_TIPO.corveta.sensor` | 0,9 | | | |
| `CAPACIDADE_POR_TIPO.corveta.gvi` | 0,75 | | | |
| `CAPACIDADE_POR_TIPO.destroier.sensor` | 1 | | | |
| `CAPACIDADE_POR_TIPO.destroier.gvi` | 0,7 | | | |
| `CAPACIDADE_POR_TIPO.amphib.sensor` | 0,6 | | | |
| `CAPACIDADE_POR_TIPO.amphib.gvi` | 1 | | | |
| `CAPACIDADE_POR_TIPO.carrier.sensor` | 0,8 | | | |
| `CAPACIDADE_POR_TIPO.carrier.gvi` | 0,6 | | | |
| `CAPACIDADE_POR_TIPO.patrulha.sensor` | 1 | | | |
| `CAPACIDADE_POR_TIPO.patrulha.gvi` | 0 | | | |
| `CAPACIDADE_POR_TIPO.helicoptero.sensor` | 0,7 | | | |
| `CAPACIDADE_POR_TIPO.helicoptero.gvi` | 0,5 | | | |
| `CAPACIDADE_POR_TIPO.aew.sensor` | 0,9 | | | |
| `CAPACIDADE_POR_TIPO.aew.gvi` | 0 | | | |
| `CAPACIDADE_POR_TIPO.submarino.sensor` | 0,7 | | | |
| `CAPACIDADE_POR_TIPO.submarino.gvi` | 0 | | | |
| `CAPACIDADE_POR_TIPO.sub_nuclear.sensor` | 0,8 | | | |
| `CAPACIDADE_POR_TIPO.sub_nuclear.gvi` | 0 | | | |
| `CAPACIDADE_POR_TIPO.specops.sensor` | 0,4 | | | |
| `CAPACIDADE_POR_TIPO.specops.gvi` | 1 | | | |
| `CAPACIDADE_POR_TIPO.logistico.sensor` | 0,3 | | | |
| `CAPACIDADE_POR_TIPO.logistico.gvi` | 0,2 | | | |
| `CAPACIDADE_POR_TIPO.tanque.sensor` | 0,3 | | | |
| `CAPACIDADE_POR_TIPO.tanque.gvi` | 0,1 | | | |
| `CAPACIDADE_POR_TIPO.inspecao_naval.sensor` | 0,4 | | | |
| `CAPACIDADE_POR_TIPO.inspecao_naval.gvi` | 0,9 | | | |
| `CAPACIDADE_POR_TIPO.mcm.sensor` | 0,5 | | | |
| `CAPACIDADE_POR_TIPO.mcm.gvi` | 0,3 | | | |
| `CAPACIDADE_POR_TIPO.usv.sensor` | 0,7 | | | |
| `CAPACIDADE_POR_TIPO.usv.gvi` | 0 | | | |
| `CAPACIDADE_POR_TIPO.uav.sensor` | 0,8 | | | |
| `CAPACIDADE_POR_TIPO.uav.gvi` | 0 | | | |
| `CAPACIDADE_POR_TIPO.rov.sensor` | 0,6 | | | |
| `CAPACIDADE_POR_TIPO.rov.gvi` | 0 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 4. `GANHO_EVIDENCIA` — Atribuição (Conceito §9.2)

*shared/sm/params.js* · prioridade **alta** — A1 (|d| máx. 4,72) · sobrescrevível por JSON

Fração da distância até 100% que cada etapa bem-sucedida cobre, antes dos moduladores (negabilidade, fusão, ritmo). A detecção pouco diz sobre quem está por trás; a inspeção e o apresamento produzem prova.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `GANHO_EVIDENCIA.deteccao` | 0,05 | | | |
| `GANHO_EVIDENCIA.identificacao` | 0,15 | | | |
| `GANHO_EVIDENCIA.interrogacao` | 0,15 | | | |
| `GANHO_EVIDENCIA.abordagem` | 0,2 | | | |
| `GANHO_EVIDENCIA.inspecao` | 0,3 | | | |
| `GANHO_EVIDENCIA.apresamento` | 0,3 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 5. `FATOR_NEGABILIDADE` — Atribuição (Conceito §9.2)

*shared/sm/params.js* · prioridade **alta** — A2 (|d| máx. 4,09, muda a conclusão sobre C_Fusão) · sobrescrevível por JSON

Multiplicador do ganho de evidência pela negabilidade do vetor (Tabela 4.1).

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `FATOR_NEGABILIDADE.baixa` | 1 | | | |
| `FATOR_NEGABILIDADE.media` | 0,8 | | | |
| `FATOR_NEGABILIDADE.alta` | 0,55 | | | |
| `FATOR_NEGABILIDADE.muito_alta` | 0,35 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 6. `PISO_FUSAO_EVIDENCIA` — Atribuição (Conceito §9.2)

*shared/sm/params.js* · prioridade **alta** — F6 (|d| máx. 1,05) · sobrescrevível por JSON

Peso da fusão sobre o ganho de evidência: com fusão 0 o ganho cai a este piso; com fusão 1 é integral.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `PISO_FUSAO_EVIDENCIA` | 0,5 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 7. `LIMIAR_ATRIBUICAO` — Atribuição (Conceito §9.2)

*shared/sm/params.js* · prioridade **alta** — A3 (|d| máx. 4,90) · sobrescrevível por JSON

Atribuição mínima (0–100) a partir da qual cada etapa é resposta fundamentada. Agir acima disso não é proibido (a ROE é que proíbe), mas gera risco político proporcional à distância.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `LIMIAR_ATRIBUICAO.deteccao` | 0 | | | |
| `LIMIAR_ATRIBUICAO.identificacao` | 0 | | | |
| `LIMIAR_ATRIBUICAO.interrogacao` | 20 | | | |
| `LIMIAR_ATRIBUICAO.abordagem` | 40 | | | |
| `LIMIAR_ATRIBUICAO.inspecao` | 40 | | | |
| `LIMIAR_ATRIBUICAO.apresamento` | 70 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 8. `PESO_POLITICO` — Atribuição (Conceito §9.2)

*shared/sm/params.js* · prioridade **alta** — C1 (|d| máx. 1,31) · sobrescrevível por JSON

Peso político de agir em cada etapa sem a atribuição correspondente.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `PESO_POLITICO.deteccao` | 0 | | | |
| `PESO_POLITICO.identificacao` | 0 | | | |
| `PESO_POLITICO.interrogacao` | 0,5 | | | |
| `PESO_POLITICO.abordagem` | 2 | | | |
| `PESO_POLITICO.inspecao` | 2 | | | |
| `PESO_POLITICO.apresamento` | 4 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 9. `GATILHOS_ESCALADA` — Escada de escalada (Conceito §9.3, Tabela 9.1)

*shared/sm/params.js* · prioridade **média** — A4 (|d| máx. 0,40) · sobrescrevível por JSON

Gatilhos de subida (Tabela 9.1), avaliados sobre os eventos do turno e a janela recente.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `GATILHOS_ESCALADA.N1.incidentesJanela` | 3 | | | |
| `GATILHOS_ESCALADA.N1.janelaTurnos` | 3 | | | |
| `GATILHOS_ESCALADA.N1.atribuicaoMin` | 40 | | | |
| `GATILHOS_ESCALADA.N2.atribuicaoMin` | 70 | | | |
| `GATILHOS_ESCALADA.N3.atribuicaoMin` | 70 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 10. `TURNOS_PARA_DESESCALAR` — Escada de escalada (Conceito §9.3, Tabela 9.1)

*shared/sm/params.js* · prioridade **baixa** — D4 (|d| máx. 0,06) · sobrescrevível por JSON

Turnos consecutivos sem gatilho do nível corrente para propor descida de um nível.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `TURNOS_PARA_DESESCALAR` | 4 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 11. `AREAS_DN` — Trilha constabular (Conceito §5, Tabela 5.1)

*shared/sm/params.js* · prioridade **não medida** — fora do catálogo de sensibilidade · sobrescrevível por JSON

Áreas dos Distritos Navais na grade 28×20 (linhas 0-indexadas, inclusivas), de norte a sul. Só hexágonos de mar a até DIST_MAX_COSTA da terra (≈ ZEE, 200 mn com hexágono de ~75 mn) recebem ocorrências.

Foco da revisão: limites jurisdicionais na carta.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `AREAS_DN` | [{"id":"2DN","estacao":"Com2ºDN","nome":"Flanco norte (BA–SE)","linhas":[0,5]}, {"id":"1DN","estacao":"Com1ºDN","nome":"Campos/Búzios (RJ–ES)","linhas":[6,9]}, {"id":"8DN","estacao":"Com8ºDN","nome":"Bacia de Santos (SP)","linhas":[10,11]}, {"id":"5DN","estacao":"Com5ºDN","nome":"Flanco sul (SC–RS)","linhas":[12,19]}] | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 12. `TIPOS_OCORRENCIA` — Trilha constabular (Conceito §5, Tabela 5.1)

*shared/sm/params.js* · prioridade **alta** — T4 (|d| máx. 2,92) · sobrescrevível por JSON

Tipos de ocorrência. Por tipo:   lambda       incidência média por turno de 24 h, por área (Poisson);   terrenos     terrenos onde a ocorrência pode surgir (board.js T_*);   etapaRepressao  etapa do motor de encontro que conta como reprimida;   duracao      turnos até a ocorrência se encerrar sem resposta (escapa);   evasao       evasão do contato nas etapas de percepção (SM-1);   exploravel   peso relativo do tipo quando o híbrido instrumentaliza                ocorrências para saturação (0 = nunca). Terrenos: 1 águas rasas, 2 plataforma, 3 águas profundas, 4 bacia petrolífera.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `TIPOS_OCORRENCIA.narcotrafico.rotulo` | 'Narcotráfico' | | | |
| `TIPOS_OCORRENCIA.narcotrafico.terrenos` | [1, 2, 3] | | | |
| `TIPOS_OCORRENCIA.narcotrafico.lambda.2DN` | 0,15 | | | |
| `TIPOS_OCORRENCIA.narcotrafico.lambda.1DN` | 0,2 | | | |
| `TIPOS_OCORRENCIA.narcotrafico.lambda.8DN` | 0,3 | | | |
| `TIPOS_OCORRENCIA.narcotrafico.lambda.5DN` | 0,15 | | | |
| `TIPOS_OCORRENCIA.narcotrafico.etapaRepressao` | 'apresamento' | | | |
| `TIPOS_OCORRENCIA.narcotrafico.duracao` | 2 | | | |
| `TIPOS_OCORRENCIA.narcotrafico.evasao` | 0,3 | | | |
| `TIPOS_OCORRENCIA.narcotrafico.exploravel` | 1 | | | |
| `TIPOS_OCORRENCIA.contrabando.rotulo` | 'Contrabando / descaminho' | | | |
| `TIPOS_OCORRENCIA.contrabando.terrenos` | [1, 2] | | | |
| `TIPOS_OCORRENCIA.contrabando.lambda.2DN` | 0,1 | | | |
| `TIPOS_OCORRENCIA.contrabando.lambda.1DN` | 0,15 | | | |
| `TIPOS_OCORRENCIA.contrabando.lambda.8DN` | 0,2 | | | |
| `TIPOS_OCORRENCIA.contrabando.lambda.5DN` | 0,15 | | | |
| `TIPOS_OCORRENCIA.contrabando.etapaRepressao` | 'apresamento' | | | |
| `TIPOS_OCORRENCIA.contrabando.duracao` | 2 | | | |
| `TIPOS_OCORRENCIA.contrabando.evasao` | 0,2 | | | |
| `TIPOS_OCORRENCIA.contrabando.exploravel` | 1 | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.rotulo` | 'Pesca irregular (IUU)' | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.terrenos` | [1, 2, 3, 4] | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.lambda.2DN` | 0,25 | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.lambda.1DN` | 0,15 | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.lambda.8DN` | 0,15 | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.lambda.5DN` | 0,3 | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.etapaRepressao` | 'apresamento' | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.duracao` | 3 | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.evasao` | 0,1 | | | |
| `TIPOS_OCORRENCIA.pesca_iuu.exploravel` | 3 | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.rotulo` | 'Crime ambiental' | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.terrenos` | [1, 2, 4] | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.lambda.2DN` | 0,05 | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.lambda.1DN` | 0,15 | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.lambda.8DN` | 0,1 | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.lambda.5DN` | 0,05 | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.etapaRepressao` | 'inspecao' | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.duracao` | 3 | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.evasao` | 0,2 | | | |
| `TIPOS_OCORRENCIA.crime_ambiental.exploravel` | 2 | | | |
| `TIPOS_OCORRENCIA.pirataria.rotulo` | 'Pirataria / roubo armado' | | | |
| `TIPOS_OCORRENCIA.pirataria.terrenos` | [1, 2, 4] | | | |
| `TIPOS_OCORRENCIA.pirataria.lambda.2DN` | 0,05 | | | |
| `TIPOS_OCORRENCIA.pirataria.lambda.1DN` | 0,1 | | | |
| `TIPOS_OCORRENCIA.pirataria.lambda.8DN` | 0,1 | | | |
| `TIPOS_OCORRENCIA.pirataria.lambda.5DN` | 0,05 | | | |
| `TIPOS_OCORRENCIA.pirataria.etapaRepressao` | 'abordagem' | | | |
| `TIPOS_OCORRENCIA.pirataria.duracao` | 1 | | | |
| `TIPOS_OCORRENCIA.pirataria.evasao` | 0,25 | | | |
| `TIPOS_OCORRENCIA.pirataria.exploravel` | 1 | | | |
| `TIPOS_OCORRENCIA.imigracao.rotulo` | 'Imigração irregular' | | | |
| `TIPOS_OCORRENCIA.imigracao.terrenos` | [1, 2] | | | |
| `TIPOS_OCORRENCIA.imigracao.lambda.2DN` | 0,1 | | | |
| `TIPOS_OCORRENCIA.imigracao.lambda.1DN` | 0,05 | | | |
| `TIPOS_OCORRENCIA.imigracao.lambda.8DN` | 0,05 | | | |
| `TIPOS_OCORRENCIA.imigracao.lambda.5DN` | 0,1 | | | |
| `TIPOS_OCORRENCIA.imigracao.etapaRepressao` | 'abordagem' | | | |
| `TIPOS_OCORRENCIA.imigracao.duracao` | 2 | | | |
| `TIPOS_OCORRENCIA.imigracao.evasao` | 0,05 | | | |
| `TIPOS_OCORRENCIA.imigracao.exploravel` | 2 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 13. `ACOPLAMENTO` — Trilha constabular (Conceito §5, Tabela 5.1)

*shared/sm/params.js* · prioridade **alta** — T5 (|d| máx. 3,02); T6 (|d| máx. 0,00) · sobrescrevível por JSON

Acoplamento com o híbrido (Conceito §4.2, §5.2).

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `ACOPLAMENTO.pCoberturaMax` | 0,15 | | | |
| `ACOPLAMENTO.lambdaSaturacaoMax` | 1,5 | | | |
| `ACOPLAMENTO.etapaRevelaVinculo` | 'inspecao' | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 14. `FONTES` — C2: estações, papéis e fusão (Conceito §7)

*shared/sm/params.js* · prioridade **alta** — F2 (|d| máx. 1,62, muda a conclusão sobre C_Fusão) · sobrescrevível por JSON

Fontes de dados de embarcações (Tabela 8.3). `peso` é a contribuição para a qualidade da fusão; `confiabilidade`, a confiança de um contato reportado só por ela; `latencia`, turnos até o reporte chegar ao barramento.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `FONTES.ais.rotulo` | 'AIS' | | | |
| `FONTES.ais.peso` | 0,2 | | | |
| `FONTES.ais.confiabilidade` | 0,7 | | | |
| `FONTES.ais.latencia` | 0 | | | |
| `FONTES.preps.rotulo` | 'PREPS' | | | |
| `FONTES.preps.peso` | 0,1 | | | |
| `FONTES.preps.confiabilidade` | 0,8 | | | |
| `FONTES.preps.latencia` | 0 | | | |
| `FONTES.radar.rotulo` | 'Radares costeiros' | | | |
| `FONTES.radar.peso` | 0,15 | | | |
| `FONTES.radar.confiabilidade` | 0,85 | | | |
| `FONTES.radar.latencia` | 0 | | | |
| `FONTES.unidades.rotulo` | 'Contatos de unidades em patrulha' | | | |
| `FONTES.unidades.peso` | 0,2 | | | |
| `FONTES.unidades.confiabilidade` | 0,95 | | | |
| `FONTES.unidades.latencia` | 0 | | | |
| `FONTES.satelite.rotulo` | 'Satélite' | | | |
| `FONTES.satelite.peso` | 0,2 | | | |
| `FONTES.satelite.confiabilidade` | 0,6 | | | |
| `FONTES.satelite.latencia` | 1 | | | |
| `FONTES.inteligencia.rotulo` | 'Sistemas de inteligência' | | | |
| `FONTES.inteligencia.peso` | 0,15 | | | |
| `FONTES.inteligencia.confiabilidade` | 0,5 | | | |
| `FONTES.inteligencia.latencia` | 1 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 15. `TETO_FUSAO_SEM_C` — C2: estações, papéis e fusão (Conceito §7)

*shared/sm/params.js* · prioridade **alta** — F3 (|d| máx. 1,92) · sobrescrevível por JSON

Sem o fator C_Fusão (SisGAAz ampliado), a fusão não passa deste teto.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `TETO_FUSAO_SEM_C` | 0,55 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 16. `APOIOS` — Apoio externo via COMPAAz (Conceito §7.4, Tabela 7.2)

*shared/sm/params.js* · prioridade **média** — F7 (|d| máx. 0,33) · sobrescrevível por JSON

Por apoio: `prazo` em turnos até entrar em vigor; `duracao` em turnos de vigência; `disponibilidade` = probabilidade de o pedido ser atendido; `pertinencia` = tipos de ação/ocorrência sobre os quais atua; efeito:   fatorCapacidade  multiplica a capacidade da unidade no encontro;   bonusFusao       soma à qualidade da fusão no encontro;   fatorRitmo       multiplica o ritmo de evidência (atribuição). 'hibrido' na pertinência = contatos da trilha de defesa.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `APOIOS.mpa.rotulo` | 'Patrulha marítima (FAB)' | | | |
| `APOIOS.mpa.prazo` | 1 | | | |
| `APOIOS.mpa.duracao` | 1 | | | |
| `APOIOS.mpa.disponibilidade` | 0,8 | | | |
| `APOIOS.mpa.pertinencia` | [*] | | | |
| `APOIOS.mpa.bonusFusao` | 0,2 | | | |
| `APOIOS.pf.rotulo` | 'Polícia Federal' | | | |
| `APOIOS.pf.prazo` | 1 | | | |
| `APOIOS.pf.duracao` | 3 | | | |
| `APOIOS.pf.disponibilidade` | 0,9 | | | |
| `APOIOS.pf.pertinencia` | [narcotrafico] | | | |
| `APOIOS.pf.fatorCapacidade` | 1,3 | | | |
| `APOIOS.rf.rotulo` | 'Receita Federal' | | | |
| `APOIOS.rf.prazo` | 1 | | | |
| `APOIOS.rf.duracao` | 3 | | | |
| `APOIOS.rf.disponibilidade` | 0,9 | | | |
| `APOIOS.rf.pertinencia` | [contrabando] | | | |
| `APOIOS.rf.fatorCapacidade` | 1,3 | | | |
| `APOIOS.ibama.rotulo` | 'IBAMA' | | | |
| `APOIOS.ibama.prazo` | 2 | | | |
| `APOIOS.ibama.duracao` | 3 | | | |
| `APOIOS.ibama.disponibilidade` | 0,8 | | | |
| `APOIOS.ibama.pertinencia` | [crime_ambiental, pesca_iuu] | | | |
| `APOIOS.ibama.fatorCapacidade` | 1,3 | | | |
| `APOIOS.censipam.rotulo` | 'CENSIPAM (imageamento)' | | | |
| `APOIOS.censipam.prazo` | 1 | | | |
| `APOIOS.censipam.duracao` | 2 | | | |
| `APOIOS.censipam.disponibilidade` | 0,9 | | | |
| `APOIOS.censipam.pertinencia` | [*] | | | |
| `APOIOS.censipam.bonusFusao` | 0,1 | | | |
| `APOIOS.intl.rotulo` | 'Inteligência internacional' | | | |
| `APOIOS.intl.prazo` | 3 | | | |
| `APOIOS.intl.duracao` | 5 | | | |
| `APOIOS.intl.disponibilidade` | 0,6 | | | |
| `APOIOS.intl.pertinencia` | [hibrido] | | | |
| `APOIOS.intl.fatorRitmo` | 1,5 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 17. `DIFICULDADES` — Campanha (Conceito §8)

*shared/sm/params.js* · prioridade **alta** — A7 (|d| máx. 4,92, muda a conclusão sobre C_Fusão) · sobrescrevível por JSON

Dificuldade como névoa de atribuição (§8.2, Tabela 8.1). Não altera a física: só o ritmo de evidência (atribuição), o que o Azul vê da intenção e dos meios do híbrido, e a adaptação do adversário (respostas repetidas rendem menos evidência).   ritmo                multiplicador do ganho de evidência (SM-1)   intencaoAPartirDe    atribuição a partir da qual a intenção do híbrido aparece   ocultacaoAteContato  meios do híbrido fora do quadro até um encontro efetivo   adaptacao            { fator, piso }: ritmo × fator^(repetições), ≥ piso

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `DIFICULDADES.basico.rotulo` | 'Básico' | | | |
| `DIFICULDADES.basico.ritmo` | 1,5 | | | |
| `DIFICULDADES.basico.intencaoAPartirDe` | 0 | | | |
| `DIFICULDADES.basico.ocultacaoAteContato` | false | | | |
| `DIFICULDADES.basico.adaptacao` | null | | | |
| `DIFICULDADES.intermediario.rotulo` | 'Intermediário' | | | |
| `DIFICULDADES.intermediario.ritmo` | 1 | | | |
| `DIFICULDADES.intermediario.intencaoAPartirDe` | 40 | | | |
| `DIFICULDADES.intermediario.ocultacaoAteContato` | false | | | |
| `DIFICULDADES.intermediario.adaptacao` | null | | | |
| `DIFICULDADES.avancado.rotulo` | 'Avançado' | | | |
| `DIFICULDADES.avancado.ritmo` | 0,6 | | | |
| `DIFICULDADES.avancado.intencaoAPartirDe` | 70 | | | |
| `DIFICULDADES.avancado.ocultacaoAteContato` | true | | | |
| `DIFICULDADES.avancado.adaptacao.fator` | 0,85 | | | |
| `DIFICULDADES.avancado.adaptacao.piso` | 0,4 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 18. `CRISES` — Campanha (Conceito §8)

*shared/sm/params.js* · prioridade **não medida** — fora do catálogo de sensibilidade · sobrescrevível por JSON

Repertório de crises (Tabela 8.2). Por tipo: trilha; marcos de Detecção e de Resposta com prazo ideal (nota 1) e prazo máximo (nota 0), em turnos contados do início do episódio; efeito que o episódio injeta. Nas crises constabulares, a resposta é adequada quando `fracaoReprimida` das ocorrências injetadas é reprimida; nas tarefas, `meios` é o número de meios que a tarefa exige.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `CRISES.crimes_ilicitos.rotulo` | 'Crimes e ilícitos no mar' | | | |
| `CRISES.crimes_ilicitos.trilha` | 'constabular' | | | |
| `CRISES.crimes_ilicitos.deteccao.ideal` | 1 | | | |
| `CRISES.crimes_ilicitos.deteccao.max` | 3 | | | |
| `CRISES.crimes_ilicitos.resposta.ideal` | 2 | | | |
| `CRISES.crimes_ilicitos.resposta.max` | 5 | | | |
| `CRISES.crimes_ilicitos.resposta.fracaoReprimida` | 0,5 | | | |
| `CRISES.crimes_ilicitos.efeito.ocorrencias.tipo` | 'narcotrafico' | | | |
| `CRISES.crimes_ilicitos.efeito.ocorrencias.n` | 3 | | | |
| `CRISES.sabotagem_ic.rotulo` | 'Sabotagem de infraestrutura crítica' | | | |
| `CRISES.sabotagem_ic.trilha` | 'defesa' | | | |
| `CRISES.sabotagem_ic.deteccao.ideal` | 1 | | | |
| `CRISES.sabotagem_ic.deteccao.max` | 4 | | | |
| `CRISES.sabotagem_ic.resposta.ideal` | 2 | | | |
| `CRISES.sabotagem_ic.resposta.max` | 6 | | | |
| `CRISES.sabotagem_ic.efeito.hibrido.tipo` | 'dano_infra' | | | |
| `CRISES.sabotagem_ic.efeito.hibrido.atribuicao` | 20 | | | |
| `CRISES.pesca_massa.rotulo` | 'Pesca ilegal em massa' | | | |
| `CRISES.pesca_massa.trilha` | 'constabular' | | | |
| `CRISES.pesca_massa.deteccao.ideal` | 1 | | | |
| `CRISES.pesca_massa.deteccao.max` | 3 | | | |
| `CRISES.pesca_massa.resposta.ideal` | 3 | | | |
| `CRISES.pesca_massa.resposta.max` | 6 | | | |
| `CRISES.pesca_massa.resposta.fracaoReprimida` | 0,5 | | | |
| `CRISES.pesca_massa.efeito.ocorrencias.tipo` | 'pesca_iuu' | | | |
| `CRISES.pesca_massa.efeito.ocorrencias.n` | 8 | | | |
| `CRISES.sar.rotulo` | 'Salvaguarda da vida humana no mar (SAR)' | | | |
| `CRISES.sar.trilha` | 'constabular' | | | |
| `CRISES.sar.deteccao.ideal` | 0 | | | |
| `CRISES.sar.deteccao.max` | 2 | | | |
| `CRISES.sar.resposta.ideal` | 1 | | | |
| `CRISES.sar.resposta.max` | 3 | | | |
| `CRISES.sar.efeito.sar.pessoas` | 30 | | | |
| `CRISES.sar.efeito.sar.meios` | 1 | | | |
| `CRISES.desastre.rotulo` | 'Resposta a desastres' | | | |
| `CRISES.desastre.trilha` | 'constabular' | | | |
| `CRISES.desastre.deteccao.ideal` | 1 | | | |
| `CRISES.desastre.deteccao.max` | 3 | | | |
| `CRISES.desastre.resposta.ideal` | 2 | | | |
| `CRISES.desastre.resposta.max` | 5 | | | |
| `CRISES.desastre.efeito.desastre.escala` | 1 | | | |
| `CRISES.desastre.efeito.desastre.meios` | 2 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 19. `PRONTIDAO` — OOB de MarSec e prontidão (Conceito §10)

*shared/sm/params.js* · prioridade **não medida** — fora do catálogo de sensibilidade · sobrescrevível por JSON

Escalões de prontidão (Tabela 10.4), em turnos de 24 h entre o acionamento e o início do movimento. `porEstacao`: quantos meios do escalão cada estação designa (o COMPAAz não tem meios de superfície próprios).

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `PRONTIDAO.sar.rotulo` | 'Navio SAR' | | | |
| `PRONTIDAO.sar.atraso` | 0 | | | |
| `PRONTIDAO.sar.porEstacao.ComemCh` | 1 | | | |
| `PRONTIDAO.sar.porEstacao.DN` | 1 | | | |
| `PRONTIDAO.fpe.rotulo` | 'Força de Pronto Emprego' | | | |
| `PRONTIDAO.fpe.atraso` | 1 | | | |
| `PRONTIDAO.fpe.porEstacao.ComemCh` | 3 | | | |
| `PRONTIDAO.fpe.porEstacao.DN` | 2 | | | |
| `PRONTIDAO.demais.rotulo` | 'Demais unidades (aprestamento)' | | | |
| `PRONTIDAO.demais.atraso` | 2 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 20. `FATOR_SEM_GVI` — OOB de MarSec e prontidão (Conceito §10)

*shared/sm/params.js* · prioridade **não medida** — fora do catálogo de sensibilidade · sobrescrevível por JSON

Sem grupamento de Fuzileiros embarcado (fator E_GVI), a capacidade de abordagem dos navios da estação cai a esta fração.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `FATOR_SEM_GVI` | 0,5 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 21. `INFOCOG` — Dimensão informacional e cognitiva (Conceito §6, §11.3)

*shared/sm/params.js* · prioridade **média** — C2 (|d| máx. 0,49); C3 (|d| máx. 0,04); C4 (|d| máx. 0,51); C5 (|d| máx. 0,19); C6 (|d| máx. 0,07); C7 (|d| máx. 0,34) · sobrescrevível por JSON

Indicador de apoio público / confiança (0–100) e custo político.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `INFOCOG.apoioInicial` | 60 | | | |
| `INFOCOG.apoioReferencia` | 60 | | | |
| `INFOCOG.retornoPorTurno` | 0,05 | | | |
| `INFOCOG.faixasRoe.estreita` | 30 | | | |
| `INFOCOG.faixasRoe.amplia` | 75 | | | |
| `INFOCOG.custo.pesoExcesso` | 2 | | | |
| `INFOCOG.custo.pesoDanos` | 3 | | | |
| `INFOCOG.custo.modulacao` | 0,5 | | | |
| `INFOCOG.tetoCustoPolitico` | 25 | | | |
| `INFOCOG.apoioPorCusto` | 3 | | | |
| `INFOCOG.eventosMar.reprimida` | 0,5 | | | |
| `INFOCOG.eventosMar.sar_sucesso` | 3 | | | |
| `INFOCOG.eventosMar.sar_falha` | -4 | | | |
| `INFOCOG.eventosMar.dano_infra` | -2 | | | |
| `INFOCOG.eventosMar.incidente_nao_respondido` | -1 | | | |
| `INFOCOG.eventosMar.dano_terceiros` | -5 | | | |
| `INFOCOG.eventosMar.dano_ambiental` | -4 | | | |
| `INFOCOG.desinformacao.base` | 6 | | | |
| `INFOCOG.desinformacao.gatilhoReal` | 1,5 | | | |
| `INFOCOG.campanhas.comunicacao_estrategica.rotulo` | 'Comunicação estratégica' | | | |
| `INFOCOG.campanhas.comunicacao_estrategica.ganho` | 3 | | | |
| `INFOCOG.campanhas.transparencia.rotulo` | 'Transparência proativa' | | | |
| `INFOCOG.campanhas.transparencia.ganho` | 2 | | | |
| `INFOCOG.campanhas.transparencia.esclareceGatilho` | true | | | |
| `INFOCOG.campanhas.prova_documentada.rotulo` | 'Divulgação de prova documentada' | | | |
| `INFOCOG.campanhas.prova_documentada.ganho` | 6 | | | |
| `INFOCOG.campanhas.prova_documentada.exigeProva` | true | | | |
| `INFOCOG.campanhas.prova_documentada.esclareceGatilho` | true | | | |
| `INFOCOG.campanhas.prebunking.rotulo` | 'Prebunking' | | | |
| `INFOCOG.campanhas.prebunking.ganho` | 0 | | | |
| `INFOCOG.campanhas.prebunking.protecao` | 0,5 | | | |
| `INFOCOG.campanhas.prebunking.duracao` | 3 | | | |
| `INFOCOG.campanhasPorTurno` | 1 | | | |
| `INFOCOG.prazoCampanha` | 1 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 22. `TERCEIROS` — Custos a terceiros (Conceito §11.3; SM-11)

*shared/sm/params.js* · prioridade **média** — C8 (|d| máx. 0,78); C9 (|d| máx. 0,30); C10 (|d| máx. 0,00); C11 (|d| máx. 0,84) · sobrescrevível por JSON

Respostas erradas e danos a terceiros, nas três situações apontadas na revisão de face:   1. interrupção desnecessária da navegação mercante;   2. uso de força desnecessário contra navios mercantes e pesqueiros;   3. ações militares que provocam danos ambientais. As duas primeiras nascem de FALSOS ALARMES: embarcações em atividade legal que o quadro toma por suspeitas (tanto menos quanto melhor a fusão). Para o Azul, são ocorrências como as outras; a inocência só se esclarece na inspeção (ou antes, na interrogação, com chance que cresce com a fusão). Abordar um inocente interrompe a navegação; a abordagem pode ainda degenerar em uso de força, mais provável quanto mais alta a postura (N0–N3). O custo entra no custo político como excesso (INFOCOG.custo.pesoExcesso) e danos a terceiros (INFOCOG.custo.pesoDanos); falsos alarmes não contam como ocorrências criminais (E5_ordem).

Foco da revisão: frequências e pesos.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `TERCEIROS.falsosAlarmes.lambda` | 0,3 | | | |
| `TERCEIROS.falsosAlarmes.reducaoPorFusao` | 0,6 | | | |
| `TERCEIROS.falsosAlarmes.tipos.mercante.rotulo` | 'Navio mercante em trânsito regular' | | | |
| `TERCEIROS.falsosAlarmes.tipos.mercante.aparenta` | 'contrabando' | | | |
| `TERCEIROS.falsosAlarmes.tipos.mercante.peso` | 1 | | | |
| `TERCEIROS.falsosAlarmes.tipos.mercante.interrompeNavegacao` | true | | | |
| `TERCEIROS.falsosAlarmes.tipos.pesqueiro.rotulo` | 'Pesqueiro em atividade legal' | | | |
| `TERCEIROS.falsosAlarmes.tipos.pesqueiro.aparenta` | 'pesca_iuu' | | | |
| `TERCEIROS.falsosAlarmes.tipos.pesqueiro.peso` | 1 | | | |
| `TERCEIROS.falsosAlarmes.tipos.pesqueiro.interrompeNavegacao` | false | | | |
| `TERCEIROS.falsosAlarmes.etapaRevela` | 'inspecao' | | | |
| `TERCEIROS.falsosAlarmes.esclareceNaInterrogacao.base` | 0,2 | | | |
| `TERCEIROS.falsosAlarmes.esclareceNaInterrogacao.porFusao` | 0,5 | | | |
| `TERCEIROS.interrupcao.excesso` | 1 | | | |
| `TERCEIROS.forcaDesnecessaria.pPorNivel` | [0,05, 0,1, 0,2, 0,3] | | | |
| `TERCEIROS.forcaDesnecessaria.excesso` | 2 | | | |
| `TERCEIROS.forcaDesnecessaria.pDano` | 0,3 | | | |
| `TERCEIROS.ambiental.pPorVetor.frota_sombra` | 0,05 | | | |
| `TERCEIROS.ambiental.pPorVetor.milicia_maritima` | 0,02 | | | |
| `TERCEIROS.ambiental.pPorVetor.sabotagem_submarina` | 0,04 | | | |
| `TERCEIROS.ambiental.pPorVetor.minagem` | 0,1 | | | |
| `TERCEIROS.ambiental.fatorNivel` | [0,5, 0,75, 1, 1,5] | | | |
| `TERCEIROS.ambiental.danos` | 1 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 23. `HIBRIDO` — Runner: agente Vermelho (híbrido), doutrina Azul e desfecho (SM-8)

*shared/sm/params.js* · prioridade **alta** — A5 (|d| máx. 2,47, muda a conclusão sobre C_Fusão); A6 (|d| máx. 2,79, muda a conclusão sobre C_Fusão); T1 (|d| máx. 2,28); T2 (|d| máx. 0,92); T3 (|d| máx. 1,94) · sobrescrevível por JSON

Ações do híbrido por vetor (Tabela 4.1). `maritimo`: gera contato no mar a ser encontrado; `etapaNeutraliza`: etapa do encontro que frustra a ação; `janela`: turnos até a ação produzir efeito; `alvos`: tipos de infraestrutura visados; `dano`: SP retirados do alvo; `evento`: tipo do evento para a escada (SM-2); `sloc`: ameaça a fluidez das SLOC; `peso`: frequência relativa na escolha do vetor.

78 valores — ver `shared/sm/params.js`. Proposta: | | Fonte: | | Confiança: |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 24. `DOUTRINA` — Runner: agente Vermelho (híbrido), doutrina Azul e desfecho (SM-8)

*shared/sm/params.js* · prioridade **média** — F4 (|d| máx. 0,72); F5 (|d| máx. 0,29); D1 (|d| máx. 0,36); D2 (|d| máx. 0,37); D3 (|d| máx. 0,24) · sobrescrevível por JSON

Doutrina do agente Azul (jogador único / lote).

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `DOUTRINA.acoesPorEstacao` | 4 | | | |
| `DOUTRINA.surto` | 2 | | | |
| `DOUTRINA.penalidadeSurto` | 2 | | | |
| `DOUTRINA.quadro.base` | 0,25 | | | |
| `DOUTRINA.quadro.porFusao` | 0,6 | | | |
| `DOUTRINA.quadro.bonusUsv` | 0,15 | | | |
| `DOUTRINA.quadro.teto` | 0,95 | | | |
| `DOUTRINA.quadro.pesoEvasao` | 0,5 | | | |
| `DOUTRINA.urgencia` | 1 | | | |
| `DOUTRINA.apoioParaComunicar` | 50 | | | |
| `DOUTRINA.prebunkingACada` | 7 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 25. `DESFECHO` — Runner: agente Vermelho (híbrido), doutrina Azul e desfecho (SM-8)

*shared/sm/params.js* · prioridade **alta** — o limiar de ordem está acima do máximo de E5 no lote (análise do lote, §7) · sobrescrevível por JSON

Desfecho (§11.2) — limiares sobre as métricas finais.

| Parâmetro | Valor atual | Valor proposto | Fonte / justificativa | Confiança |
|---|---|---|---|---|
| `DESFECHO.infraVitoriaAzul` | 80 | | | |
| `DESFECHO.ordemVitoriaAzul` | 0,4 | | | |
| `DESFECHO.infraVitoriaVermelha` | 60 | | | |

Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 26. `BASES` — OOB de MarSec (Conceito §10)

*shared/sm/oob_sm.js* · prioridade **estrutural** · editar no código

Hexágonos-base (navegáveis) de cada estação, na grade 28×20.

7 entradas — ver `shared/sm/oob_sm.js`.

Correções propostas: 


Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 27. `MEIOS_AZUIS` — OOB de MarSec (Conceito §10)

*shared/sm/oob_sm.js* · prioridade **estrutural** · editar no código

Meios Azuis. `prioridade` ordena a designação de prontidão (menor primeiro); `sar` marca o meio apto a ser Navio SAR.

Foco da revisão: composição, quantitativos, lotação.

41 entradas — ver `shared/sm/oob_sm.js`.

Correções propostas: 


Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

### 28. `INFRA` — OOB de MarSec (Conceito §10)

*shared/sm/oob_sm.js* · prioridade **estrutural** · editar no código

Infraestrutura crítica (centro de gravidade, §2.2). Posições da carta OAS-MAP-001; cabos e dutos são traçados abstratos entre hexágonos.

Foco da revisão: traçados, SP.

15 entradas — ver `shared/sm/oob_sm.js`.

Correções propostas: 


Plausível? ☐ sim ☐ não ☐ não sei · Comentário: 

