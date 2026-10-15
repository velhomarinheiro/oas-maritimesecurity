# Rastreamento do questionário profissional → parâmetros

Uso do analista. Liga cada item do questionário de validação (`questionario.xlsx`) aos parâmetros de `shared/sm/params.js`, com a regra que converte a resposta profissional em valor técnico. A conversão é automática em `scripts/sm_questionario_importar.js`; os itens "manual" pedem interpretação do analista. A fonte é `shared/sm/questionario_profissional.js`; este arquivo e `rastreamento.json` são gerados por `npm run sm:validacao`.

## Regras de conversão

| Conversão | Unidade da resposta | Regra |
|---|---|---|
| percentual | % | parâmetro = resposta ÷ 100 |
| por_mes | por mês | parâmetro (por turno de 24 h) = resposta ÷ 30 |
| dias | dias | parâmetro (turnos de 24 h) = resposta, arredondada |
| horas | horas | parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada |
| inteiro | quantidade | parâmetro = resposta, arredondada |
| pontos | pontos | parâmetro = resposta |
| escala10 | 0 a 10 | parâmetro = resposta ÷ 10 |
| ganho | % de ganho | multiplicador = 1 + resposta ÷ 100 |
| prob_mensal | % em um mês | probabilidade por turno = 1 − (1 − resposta ÷ 100)^(1/30) |
| meia_vida | dias | fração recuperada por turno = 1 − 0,5^(1/resposta) |
| categoria | escolha | opção escolhida → valor da tabela de opções |
| normalizado | % do total | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo |
| diferenca | % | parâmetro = (resposta − resposta da linha de referência) ÷ 100 |
| reducao | % | parâmetro = (resposta da linha de referência − resposta) ÷ 100 |
| formula |  | fórmula própria do item (ver "regra" do item) |
| manual | texto | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita |

## Itens

| Nº | Item | Parâmetro(s) | Conversão | Regra | Hipótese (unidade profissional) | Valor atual | Prioridade |
|---|---|---|---|---|---|---|---|
| A1.1 | AIS | `FONTES.ais.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: fontes) | 20 % do total | 0,2 | alta |
| A1.2 | PREPS | `FONTES.preps.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: fontes) | 10 % do total | 0,1 | alta |
| A1.3 | Radares costeiros | `FONTES.radar.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: fontes) | 15 % do total | 0,15 | alta |
| A1.4 | Contatos de unidades em patrulha | `FONTES.unidades.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: fontes) | 20 % do total | 0,2 | alta |
| A1.5 | Satélite | `FONTES.satelite.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: fontes) | 20 % do total | 0,2 | alta |
| A1.6 | Sistemas de inteligência | `FONTES.inteligencia.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: fontes) | 15 % do total | 0,15 | alta |
| A2.1 | AIS | `FONTES.ais.confiabilidade` | percentual | parâmetro = resposta ÷ 100 | 70 % | 0,7 | alta |
| A2.2 | PREPS | `FONTES.preps.confiabilidade` | percentual | parâmetro = resposta ÷ 100 | 80 % | 0,8 | alta |
| A2.3 | Radares costeiros | `FONTES.radar.confiabilidade` | percentual | parâmetro = resposta ÷ 100 | 85 % | 0,85 | alta |
| A2.4 | Contatos de unidades em patrulha | `FONTES.unidades.confiabilidade` | percentual | parâmetro = resposta ÷ 100 | 95 % | 0,95 | alta |
| A2.5 | Satélite | `FONTES.satelite.confiabilidade` | percentual | parâmetro = resposta ÷ 100 | 60 % | 0,6 | alta |
| A2.6 | Sistemas de inteligência | `FONTES.inteligencia.confiabilidade` | percentual | parâmetro = resposta ÷ 100 | 50 % | 0,5 | alta |
| A3.1 | AIS | `FONTES.ais.latencia` | horas | parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada | 0 horas (até 12 h = imediato) | 0 | alta |
| A3.2 | PREPS | `FONTES.preps.latencia` | horas | parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada | 0 horas (até 12 h = imediato) | 0 | alta |
| A3.3 | Radares costeiros | `FONTES.radar.latencia` | horas | parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada | 0 horas (até 12 h = imediato) | 0 | alta |
| A3.4 | Contatos de unidades em patrulha | `FONTES.unidades.latencia` | horas | parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada | 0 horas (até 12 h = imediato) | 0 | alta |
| A3.5 | Satélite | `FONTES.satelite.latencia` | horas | parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada | 24 horas (até 12 h = imediato) | 1 | alta |
| A3.6 | Sistemas de inteligência | `FONTES.inteligencia.latencia` | horas | parâmetro (turnos de 24 h) = resposta ÷ 24, arredondada | 24 horas (até 12 h = imediato) | 1 | alta |
| A4.1 | Consciência situacional sem o sistema integrado | `TETO_FUSAO_SEM_C` | percentual | parâmetro = resposta ÷ 100 | 55 % | 0,55 | alta |
| A5.1 | Com integração mínima das fontes | `DOUTRINA.quadro.base` | percentual | parâmetro = resposta ÷ 100 | 25 % | 0,25 | média |
| A5.2 | Com integração plena das fontes | `DOUTRINA.quadro.porFusao` | diferenca | parâmetro = (resposta − resposta da linha de referência) ÷ 100 (referência: A5.1) | 85 % | 0,6 | média |
| A5.3 | Acréscimo, em pontos percentuais, quando há veículos não tripulados (USV/UAV) na área | `DOUTRINA.quadro.bonusUsv` | percentual | parâmetro = resposta ÷ 100 | 15 pontos percentuais | 0,15 | média |
| A5.4 | Redução, em %, quando a embarcação procura ativamente não ser detectada (transponder desligado, ocultação) | `DOUTRINA.quadro.pesoEvasao` | percentual | parâmetro = resposta ÷ 100; o modelo multiplica pela evasão de cada ameaça (questão F2) | 50 % | 0,5 | média |
| B1.1 | Detecção do contato | `P_BASE.deteccao` | percentual | parâmetro = resposta ÷ 100 | 85 % | 0,85 | alta |
| B1.2 | Identificação / classificação | `P_BASE.identificacao` | percentual | parâmetro = resposta ÷ 100 | 75 % | 0,75 | alta |
| B1.3 | Interrogação (rádio ou visual) | `P_BASE.interrogacao` | percentual | parâmetro = resposta ÷ 100 | 80 % | 0,8 | alta |
| B1.4 | Abordagem e visita | `P_BASE.abordagem` | percentual | parâmetro = resposta ÷ 100 | 70 % | 0,7 | alta |
| B1.5 | Inspeção | `P_BASE.inspecao` | percentual | parâmetro = resposta ÷ 100 | 80 % | 0,8 | alta |
| B1.6 | Apresamento e condução ao porto | `P_BASE.apresamento` | percentual | parâmetro = resposta ÷ 100 | 75 % | 0,75 | alta |
| B2.1 | Detecção do contato | `PISO_FUSAO.deteccao` | percentual | parâmetro = resposta ÷ 100 | 40 % do valor da questão B1 | 0,4 | alta |
| B2.2 | Identificação / classificação | `PISO_FUSAO.identificacao` | percentual | parâmetro = resposta ÷ 100 | 45 % do valor da questão B1 | 0,45 | alta |
| B2.3 | Interrogação (rádio ou visual) | `PISO_FUSAO.interrogacao` | percentual | parâmetro = resposta ÷ 100 | 70 % do valor da questão B1 | 0,7 | alta |
| B2.4 | Abordagem e visita | `PISO_FUSAO.abordagem` | percentual | parâmetro = resposta ÷ 100 | 85 % do valor da questão B1 | 0,85 | alta |
| B2.5 | Inspeção | `PISO_FUSAO.inspecao` | percentual | parâmetro = resposta ÷ 100 | 80 % do valor da questão B1 | 0,8 | alta |
| B2.6 | Apresamento e condução ao porto | `PISO_FUSAO.apresamento` | percentual | parâmetro = resposta ÷ 100 | 90 % do valor da questão B1 | 0,9 | alta |
| B3.1 | Navio-patrulha oceânico (Cl. Amazonas) | `CAPACIDADE_POR_TIPO.patrulha_oc.sensor` | escala10 | parâmetro = resposta ÷ 10 | 8,5 0 a 10 | 0,85 | alta |
| B3.2 | Navio-patrulha costeiro (Cl. Grajaú, Macaé, Bracuí) | `CAPACIDADE_POR_TIPO.patrulha_c.sensor` | escala10 | parâmetro = resposta ÷ 10 | 6,5 0 a 10 | 0,65 | alta |
| B3.3 | Fragata | `CAPACIDADE_POR_TIPO.fragata.sensor` | escala10 | parâmetro = resposta ÷ 10 | 10 0 a 10 | 1 | alta |
| B3.4 | Corveta | `CAPACIDADE_POR_TIPO.corveta.sensor` | escala10 | parâmetro = resposta ÷ 10 | 9 0 a 10 | 0,9 | alta |
| B3.5 | Contratorpedeiro | `CAPACIDADE_POR_TIPO.destroier.sensor` | escala10 | parâmetro = resposta ÷ 10 | 10 0 a 10 | 1 | alta |
| B3.6 | Navio anfíbio / doca multipropósito | `CAPACIDADE_POR_TIPO.amphib.sensor` | escala10 | parâmetro = resposta ÷ 10 | 6 0 a 10 | 0,6 | alta |
| B3.7 | Navio-aeródromo / porta-helicópteros | `CAPACIDADE_POR_TIPO.carrier.sensor` | escala10 | parâmetro = resposta ÷ 10 | 8 0 a 10 | 0,8 | alta |
| B3.8 | Aeronave de patrulha marítima (P-3AM) | `CAPACIDADE_POR_TIPO.patrulha.sensor` | escala10 | parâmetro = resposta ÷ 10 | 10 0 a 10 | 1 | alta |
| B3.9 | Helicóptero embarcado | `CAPACIDADE_POR_TIPO.helicoptero.sensor` | escala10 | parâmetro = resposta ÷ 10 | 7 0 a 10 | 0,7 | alta |
| B3.10 | Aeronave de alarme aéreo antecipado | `CAPACIDADE_POR_TIPO.aew.sensor` | escala10 | parâmetro = resposta ÷ 10 | 9 0 a 10 | 0,9 | alta |
| B3.11 | Submarino convencional | `CAPACIDADE_POR_TIPO.submarino.sensor` | escala10 | parâmetro = resposta ÷ 10 | 7 0 a 10 | 0,7 | alta |
| B3.12 | Submarino de propulsão nuclear | `CAPACIDADE_POR_TIPO.sub_nuclear.sensor` | escala10 | parâmetro = resposta ÷ 10 | 8 0 a 10 | 0,8 | alta |
| B3.13 | Grupamento de operações especiais | `CAPACIDADE_POR_TIPO.specops.sensor` | escala10 | parâmetro = resposta ÷ 10 | 4 0 a 10 | 0,4 | alta |
| B3.14 | Navio de apoio logístico | `CAPACIDADE_POR_TIPO.logistico.sensor` | escala10 | parâmetro = resposta ÷ 10 | 3 0 a 10 | 0,3 | alta |
| B3.15 | Navio-tanque | `CAPACIDADE_POR_TIPO.tanque.sensor` | escala10 | parâmetro = resposta ÷ 10 | 3 0 a 10 | 0,3 | alta |
| B3.16 | Lancha / aviso de inspeção naval (DN) | `CAPACIDADE_POR_TIPO.inspecao_naval.sensor` | escala10 | parâmetro = resposta ÷ 10 | 4 0 a 10 | 0,4 | alta |
| B3.17 | Navio de contramedidas de minagem | `CAPACIDADE_POR_TIPO.mcm.sensor` | escala10 | parâmetro = resposta ÷ 10 | 5 0 a 10 | 0,5 | alta |
| B3.18 | Veículo de superfície não tripulado (USV) | `CAPACIDADE_POR_TIPO.usv.sensor` | escala10 | parâmetro = resposta ÷ 10 | 7 0 a 10 | 0,7 | alta |
| B3.19 | Aeronave remotamente pilotada (UAV) | `CAPACIDADE_POR_TIPO.uav.sensor` | escala10 | parâmetro = resposta ÷ 10 | 8 0 a 10 | 0,8 | alta |
| B3.20 | Veículo submarino remotamente operado (ROV) | `CAPACIDADE_POR_TIPO.rov.sensor` | escala10 | parâmetro = resposta ÷ 10 | 6 0 a 10 | 0,6 | alta |
| B4.1 | Navio-patrulha oceânico (Cl. Amazonas) | `CAPACIDADE_POR_TIPO.patrulha_oc.gvi` | escala10 | parâmetro = resposta ÷ 10 | 9 0 a 10 | 0,9 | alta |
| B4.2 | Navio-patrulha costeiro (Cl. Grajaú, Macaé, Bracuí) | `CAPACIDADE_POR_TIPO.patrulha_c.gvi` | escala10 | parâmetro = resposta ÷ 10 | 8 0 a 10 | 0,8 | alta |
| B4.3 | Fragata | `CAPACIDADE_POR_TIPO.fragata.gvi` | escala10 | parâmetro = resposta ÷ 10 | 7,5 0 a 10 | 0,75 | alta |
| B4.4 | Corveta | `CAPACIDADE_POR_TIPO.corveta.gvi` | escala10 | parâmetro = resposta ÷ 10 | 7,5 0 a 10 | 0,75 | alta |
| B4.5 | Contratorpedeiro | `CAPACIDADE_POR_TIPO.destroier.gvi` | escala10 | parâmetro = resposta ÷ 10 | 7 0 a 10 | 0,7 | alta |
| B4.6 | Navio anfíbio / doca multipropósito | `CAPACIDADE_POR_TIPO.amphib.gvi` | escala10 | parâmetro = resposta ÷ 10 | 10 0 a 10 | 1 | alta |
| B4.7 | Navio-aeródromo / porta-helicópteros | `CAPACIDADE_POR_TIPO.carrier.gvi` | escala10 | parâmetro = resposta ÷ 10 | 6 0 a 10 | 0,6 | alta |
| B4.8 | Aeronave de patrulha marítima (P-3AM) | `CAPACIDADE_POR_TIPO.patrulha.gvi` | escala10 | parâmetro = resposta ÷ 10 | 0 0 a 10 | 0 | alta |
| B4.9 | Helicóptero embarcado | `CAPACIDADE_POR_TIPO.helicoptero.gvi` | escala10 | parâmetro = resposta ÷ 10 | 5 0 a 10 | 0,5 | alta |
| B4.10 | Aeronave de alarme aéreo antecipado | `CAPACIDADE_POR_TIPO.aew.gvi` | escala10 | parâmetro = resposta ÷ 10 | 0 0 a 10 | 0 | alta |
| B4.11 | Submarino convencional | `CAPACIDADE_POR_TIPO.submarino.gvi` | escala10 | parâmetro = resposta ÷ 10 | 0 0 a 10 | 0 | alta |
| B4.12 | Submarino de propulsão nuclear | `CAPACIDADE_POR_TIPO.sub_nuclear.gvi` | escala10 | parâmetro = resposta ÷ 10 | 0 0 a 10 | 0 | alta |
| B4.13 | Grupamento de operações especiais | `CAPACIDADE_POR_TIPO.specops.gvi` | escala10 | parâmetro = resposta ÷ 10 | 10 0 a 10 | 1 | alta |
| B4.14 | Navio de apoio logístico | `CAPACIDADE_POR_TIPO.logistico.gvi` | escala10 | parâmetro = resposta ÷ 10 | 2 0 a 10 | 0,2 | alta |
| B4.15 | Navio-tanque | `CAPACIDADE_POR_TIPO.tanque.gvi` | escala10 | parâmetro = resposta ÷ 10 | 1 0 a 10 | 0,1 | alta |
| B4.16 | Lancha / aviso de inspeção naval (DN) | `CAPACIDADE_POR_TIPO.inspecao_naval.gvi` | escala10 | parâmetro = resposta ÷ 10 | 9 0 a 10 | 0,9 | alta |
| B4.17 | Navio de contramedidas de minagem | `CAPACIDADE_POR_TIPO.mcm.gvi` | escala10 | parâmetro = resposta ÷ 10 | 3 0 a 10 | 0,3 | alta |
| B4.18 | Veículo de superfície não tripulado (USV) | `CAPACIDADE_POR_TIPO.usv.gvi` | escala10 | parâmetro = resposta ÷ 10 | 0 0 a 10 | 0 | alta |
| B4.19 | Aeronave remotamente pilotada (UAV) | `CAPACIDADE_POR_TIPO.uav.gvi` | escala10 | parâmetro = resposta ÷ 10 | 0 0 a 10 | 0 | alta |
| B4.20 | Veículo submarino remotamente operado (ROV) | `CAPACIDADE_POR_TIPO.rov.gvi` | escala10 | parâmetro = resposta ÷ 10 | 0 0 a 10 | 0 | alta |
| B5.1 | Capacidade de abordagem sem o grupo embarcado | `FATOR_SEM_GVI` | percentual | parâmetro = resposta ÷ 100 | 50 % da capacidade com o grupo | 0,5 | não medida |
| C1.1 | Detecção do contato | `GANHO_EVIDENCIA.deteccao` | percentual | parâmetro = resposta ÷ 100 | 5 % da dúvida remanescente | 0,05 | alta |
| C1.2 | Identificação / classificação | `GANHO_EVIDENCIA.identificacao` | percentual | parâmetro = resposta ÷ 100 | 15 % da dúvida remanescente | 0,15 | alta |
| C1.3 | Interrogação (rádio ou visual) | `GANHO_EVIDENCIA.interrogacao` | percentual | parâmetro = resposta ÷ 100 | 15 % da dúvida remanescente | 0,15 | alta |
| C1.4 | Abordagem e visita | `GANHO_EVIDENCIA.abordagem` | percentual | parâmetro = resposta ÷ 100 | 20 % da dúvida remanescente | 0,2 | alta |
| C1.5 | Inspeção | `GANHO_EVIDENCIA.inspecao` | percentual | parâmetro = resposta ÷ 100 | 30 % da dúvida remanescente | 0,3 | alta |
| C1.6 | Apresamento e condução ao porto | `GANHO_EVIDENCIA.apresamento` | percentual | parâmetro = resposta ÷ 100 | 30 % da dúvida remanescente | 0,3 | alta |
| C2.1 | Ilícito comum (referência) | `FATOR_NEGABILIDADE.baixa` | percentual | parâmetro = resposta ÷ 100 | 100 % do esclarecimento de um ilícito comum | 1 | alta |
| C2.2 | Interferência em GNSS, ataque cibernético | `FATOR_NEGABILIDADE.media` | percentual | parâmetro = resposta ÷ 100 | 80 % do esclarecimento de um ilícito comum | 0,8 | alta |
| C2.3 | Frota-sombra, milícia marítima, drones, minagem | `FATOR_NEGABILIDADE.alta` | percentual | parâmetro = resposta ÷ 100 | 55 % do esclarecimento de um ilícito comum | 0,55 | alta |
| C2.4 | Sabotagem de cabos e dutos submarinos | `FATOR_NEGABILIDADE.muito_alta` | percentual | parâmetro = resposta ÷ 100 | 35 % do esclarecimento de um ilícito comum | 0,35 | alta |
| C3.1 | Rendimento da investigação sem o quadro integrado | `PISO_FUSAO_EVIDENCIA` | percentual | parâmetro = resposta ÷ 100 | 50 % do rendimento com o quadro | 0,5 | alta |
| C4.1 | Interrogação (rádio ou visual) | `LIMIAR_ATRIBUICAO.interrogacao` | pontos | parâmetro = resposta | 20 % de convicção | 20 | alta |
| C4.2 | Abordagem e visita | `LIMIAR_ATRIBUICAO.abordagem` | pontos | parâmetro = resposta | 40 % de convicção | 40 | alta |
| C4.3 | Inspeção | `LIMIAR_ATRIBUICAO.inspecao` | pontos | parâmetro = resposta | 40 % de convicção | 40 | alta |
| C4.4 | Apresamento e condução ao porto | `LIMIAR_ATRIBUICAO.apresamento` | pontos | parâmetro = resposta | 70 % de convicção | 70 | alta |
| C5.1 | Elevar a postura a Crise após dano a infraestrutura crítica | `GATILHOS_ESCALADA.N2.atribuicaoMin` | pontos | parâmetro = resposta | 70 % de convicção | 70 | média |
| C5.2 | Propor o emprego aberto da força (Conflito) após ataque armado | `GATILHOS_ESCALADA.N3.atribuicaoMin` | pontos | parâmetro = resposta | 70 % de convicção | 70 | média |
| C5.3 | Dar por concluída uma investigação de autoria | `HIBRIDO.investigacao.robusta` | pontos | parâmetro = resposta | 70 % de convicção | 70 | alta |
| C6.1 | Em quantos dias uma investigação típica chega à convicção robusta? | `HIBRIDO.investigacao.ganho` | formula | ganho diário g tal que, partindo de 10% de convicção, a convicção robusta R (C5) seja atingida em d dias: g = 1 − ((1 − R/100) ÷ 0,9)^(1/d) | 6,7599 dias | 0,15 | alta |
| C6.2 | Por quantos dias a investigação costuma ser mantida antes de ser arquivada sem conclusão? | `HIBRIDO.investigacao.turnos` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 10 dias | 10 | alta |
| D1.1 | Número de incidentes de natureza híbrida… | `GATILHOS_ESCALADA.N1.incidentesJanela` | inteiro | parâmetro = resposta, arredondada | 3 incidentes | 3 | média |
| D1.2 | …dentro de quantos dias | `GATILHOS_ESCALADA.N1.janelaTurnos` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | média |
| D1.3 | Ou um único incidente com convicção sobre a autoria de pelo menos | `GATILHOS_ESCALADA.N1.atribuicaoMin` | pontos | parâmetro = resposta | 40 % de convicção | 40 | média |
| D2.1 | Dias sem novos gatilhos | `TURNOS_PARA_DESESCALAR` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 4 dias | 4 | baixa |
| E1.1 | Narcotráfico — 2º DN (BA–SE) | `TIPOS_OCORRENCIA.narcotrafico.lambda.2DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 4,5 ocorrências por mês | 0,15 | alta |
| E1.2 | Narcotráfico — 1º DN (RJ–ES) | `TIPOS_OCORRENCIA.narcotrafico.lambda.1DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 6 ocorrências por mês | 0,2 | alta |
| E1.3 | Narcotráfico — 8º DN (SP) | `TIPOS_OCORRENCIA.narcotrafico.lambda.8DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 9 ocorrências por mês | 0,3 | alta |
| E1.4 | Narcotráfico — 5º DN (SC–RS) | `TIPOS_OCORRENCIA.narcotrafico.lambda.5DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 4,5 ocorrências por mês | 0,15 | alta |
| E1.5 | Contrabando / descaminho — 2º DN (BA–SE) | `TIPOS_OCORRENCIA.contrabando.lambda.2DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 3 ocorrências por mês | 0,1 | alta |
| E1.6 | Contrabando / descaminho — 1º DN (RJ–ES) | `TIPOS_OCORRENCIA.contrabando.lambda.1DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 4,5 ocorrências por mês | 0,15 | alta |
| E1.7 | Contrabando / descaminho — 8º DN (SP) | `TIPOS_OCORRENCIA.contrabando.lambda.8DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 6 ocorrências por mês | 0,2 | alta |
| E1.8 | Contrabando / descaminho — 5º DN (SC–RS) | `TIPOS_OCORRENCIA.contrabando.lambda.5DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 4,5 ocorrências por mês | 0,15 | alta |
| E1.9 | Pesca irregular (IUU) — 2º DN (BA–SE) | `TIPOS_OCORRENCIA.pesca_iuu.lambda.2DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 7,5 ocorrências por mês | 0,25 | alta |
| E1.10 | Pesca irregular (IUU) — 1º DN (RJ–ES) | `TIPOS_OCORRENCIA.pesca_iuu.lambda.1DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 4,5 ocorrências por mês | 0,15 | alta |
| E1.11 | Pesca irregular (IUU) — 8º DN (SP) | `TIPOS_OCORRENCIA.pesca_iuu.lambda.8DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 4,5 ocorrências por mês | 0,15 | alta |
| E1.12 | Pesca irregular (IUU) — 5º DN (SC–RS) | `TIPOS_OCORRENCIA.pesca_iuu.lambda.5DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 9 ocorrências por mês | 0,3 | alta |
| E1.13 | Crime ambiental — 2º DN (BA–SE) | `TIPOS_OCORRENCIA.crime_ambiental.lambda.2DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 1,5 ocorrências por mês | 0,05 | alta |
| E1.14 | Crime ambiental — 1º DN (RJ–ES) | `TIPOS_OCORRENCIA.crime_ambiental.lambda.1DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 4,5 ocorrências por mês | 0,15 | alta |
| E1.15 | Crime ambiental — 8º DN (SP) | `TIPOS_OCORRENCIA.crime_ambiental.lambda.8DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 3 ocorrências por mês | 0,1 | alta |
| E1.16 | Crime ambiental — 5º DN (SC–RS) | `TIPOS_OCORRENCIA.crime_ambiental.lambda.5DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 1,5 ocorrências por mês | 0,05 | alta |
| E1.17 | Pirataria / roubo armado — 2º DN (BA–SE) | `TIPOS_OCORRENCIA.pirataria.lambda.2DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 1,5 ocorrências por mês | 0,05 | alta |
| E1.18 | Pirataria / roubo armado — 1º DN (RJ–ES) | `TIPOS_OCORRENCIA.pirataria.lambda.1DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 3 ocorrências por mês | 0,1 | alta |
| E1.19 | Pirataria / roubo armado — 8º DN (SP) | `TIPOS_OCORRENCIA.pirataria.lambda.8DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 3 ocorrências por mês | 0,1 | alta |
| E1.20 | Pirataria / roubo armado — 5º DN (SC–RS) | `TIPOS_OCORRENCIA.pirataria.lambda.5DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 1,5 ocorrências por mês | 0,05 | alta |
| E1.21 | Imigração irregular — 2º DN (BA–SE) | `TIPOS_OCORRENCIA.imigracao.lambda.2DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 3 ocorrências por mês | 0,1 | alta |
| E1.22 | Imigração irregular — 1º DN (RJ–ES) | `TIPOS_OCORRENCIA.imigracao.lambda.1DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 1,5 ocorrências por mês | 0,05 | alta |
| E1.23 | Imigração irregular — 8º DN (SP) | `TIPOS_OCORRENCIA.imigracao.lambda.8DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 1,5 ocorrências por mês | 0,05 | alta |
| E1.24 | Imigração irregular — 5º DN (SC–RS) | `TIPOS_OCORRENCIA.imigracao.lambda.5DN` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 3 ocorrências por mês | 0,1 | alta |
| E2.1 | Narcotráfico | `TIPOS_OCORRENCIA.narcotrafico.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | alta |
| E2.2 | Contrabando / descaminho | `TIPOS_OCORRENCIA.contrabando.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | alta |
| E2.3 | Pesca irregular (IUU) | `TIPOS_OCORRENCIA.pesca_iuu.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | alta |
| E2.4 | Crime ambiental | `TIPOS_OCORRENCIA.crime_ambiental.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | alta |
| E2.5 | Pirataria / roubo armado | `TIPOS_OCORRENCIA.pirataria.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | alta |
| E2.6 | Imigração irregular | `TIPOS_OCORRENCIA.imigracao.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | alta |
| E3.1 | Narcotráfico | `TIPOS_OCORRENCIA.narcotrafico.evasao` | percentual | parâmetro = resposta ÷ 100 | 30 % de redução | 0,3 | alta |
| E3.2 | Contrabando / descaminho | `TIPOS_OCORRENCIA.contrabando.evasao` | percentual | parâmetro = resposta ÷ 100 | 20 % de redução | 0,2 | alta |
| E3.3 | Pesca irregular (IUU) | `TIPOS_OCORRENCIA.pesca_iuu.evasao` | percentual | parâmetro = resposta ÷ 100 | 10 % de redução | 0,1 | alta |
| E3.4 | Crime ambiental | `TIPOS_OCORRENCIA.crime_ambiental.evasao` | percentual | parâmetro = resposta ÷ 100 | 20 % de redução | 0,2 | alta |
| E3.5 | Pirataria / roubo armado | `TIPOS_OCORRENCIA.pirataria.evasao` | percentual | parâmetro = resposta ÷ 100 | 25 % de redução | 0,25 | alta |
| E3.6 | Imigração irregular | `TIPOS_OCORRENCIA.imigracao.evasao` | percentual | parâmetro = resposta ÷ 100 | 5 % de redução | 0,05 | alta |
| E4.1 | Narcotráfico | `TIPOS_OCORRENCIA.narcotrafico.etapaRepressao` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | apresamento escolha | apresamento | alta |
| E4.2 | Contrabando / descaminho | `TIPOS_OCORRENCIA.contrabando.etapaRepressao` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | apresamento escolha | apresamento | alta |
| E4.3 | Pesca irregular (IUU) | `TIPOS_OCORRENCIA.pesca_iuu.etapaRepressao` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | apresamento escolha | apresamento | alta |
| E4.4 | Crime ambiental | `TIPOS_OCORRENCIA.crime_ambiental.etapaRepressao` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | inspeção escolha | inspecao | alta |
| E4.5 | Pirataria / roubo armado | `TIPOS_OCORRENCIA.pirataria.etapaRepressao` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | abordagem escolha | abordagem | alta |
| E4.6 | Imigração irregular | `TIPOS_OCORRENCIA.imigracao.etapaRepressao` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | abordagem escolha | abordagem | alta |
| E5.1 | Interesse do ator em explorar: Narcotráfico (0 = nenhum, 3 = muito) | `TIPOS_OCORRENCIA.narcotrafico.exploravel` | inteiro | parâmetro = resposta, arredondada | 1 0 a 3 | 1 | alta |
| E5.2 | Interesse do ator em explorar: Contrabando / descaminho (0 = nenhum, 3 = muito) | `TIPOS_OCORRENCIA.contrabando.exploravel` | inteiro | parâmetro = resposta, arredondada | 1 0 a 3 | 1 | alta |
| E5.3 | Interesse do ator em explorar: Pesca irregular (IUU) (0 = nenhum, 3 = muito) | `TIPOS_OCORRENCIA.pesca_iuu.exploravel` | inteiro | parâmetro = resposta, arredondada | 3 0 a 3 | 3 | alta |
| E5.4 | Interesse do ator em explorar: Crime ambiental (0 = nenhum, 3 = muito) | `TIPOS_OCORRENCIA.crime_ambiental.exploravel` | inteiro | parâmetro = resposta, arredondada | 2 0 a 3 | 2 | alta |
| E5.5 | Interesse do ator em explorar: Pirataria / roubo armado (0 = nenhum, 3 = muito) | `TIPOS_OCORRENCIA.pirataria.exploravel` | inteiro | parâmetro = resposta, arredondada | 1 0 a 3 | 1 | alta |
| E5.6 | Interesse do ator em explorar: Imigração irregular (0 = nenhum, 3 = muito) | `TIPOS_OCORRENCIA.imigracao.exploravel` | inteiro | parâmetro = resposta, arredondada | 2 0 a 3 | 2 | alta |
| E5.7 | Ocorrências adicionais por mês, em campanha de intensidade máxima, nas áreas fora do esforço principal do ator | `ACOPLAMENTO.lambdaSaturacaoMax` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 45 ocorrências por mês | 1,5 | alta |
| E5.8 | Fração das ocorrências rotineiras que serviriam de cobertura, em campanha de intensidade máxima | `ACOPLAMENTO.pCoberturaMax` | percentual | parâmetro = resposta ÷ 100 | 15 % | 0,15 | alta |
| E5.9 | Fase da ação em que o vínculo de uma ocorrência de cobertura com o ator viria à tona | `ACOPLAMENTO.etapaRevelaVinculo` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | inspeção escolha | inspecao | alta |
| F1.1 | Quantas ações hostis por mês? | `HIBRIDO.acoesPorTurno` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 18 ações por mês | 0,6 | alta |
| F1.2 | Que fração delas concentrada na área de esforço principal? | `HIBRIDO.pAreaAlvo` | percentual | parâmetro = resposta ÷ 100 | 70 % | 0,7 | alta |
| F1.3 | Com a postura já em Crise, qual a chance, em um mês, de o ator passar ao emprego aberto de meios? | `HIBRIDO.empregoAberto.pPorTurno` | prob_mensal | probabilidade por turno = 1 − (1 − resposta ÷ 100)^(1/30) | 78,5361 % em um mês | 0,05 | alta |
| F2.1 | Frota-sombra (transponder desligado, bandeira de conveniência) | `HIBRIDO.vetores.frota_sombra.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: vetores) | 21,4286 % do total | 3 | alta |
| F2.2 | Milícia marítima (pesqueiros a serviço de outro Estado) | `HIBRIDO.vetores.milicia_maritima.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: vetores) | 21,4286 % do total | 3 | alta |
| F2.3 | Sabotagem de cabos e dutos submarinos | `HIBRIDO.vetores.sabotagem_submarina.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: vetores) | 14,2857 % do total | 2 | alta |
| F2.4 | Drones de superfície ou aéreos sem identificação | `HIBRIDO.vetores.usv_uav.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: vetores) | 14,2857 % do total | 2 | alta |
| F2.5 | Interferência em navegação por satélite (GNSS) | `HIBRIDO.vetores.gnss.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: vetores) | 14,2857 % do total | 2 | alta |
| F2.6 | Ataque cibernético a terminais e portos | `HIBRIDO.vetores.ciber.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: vetores) | 7,1429 % do total | 1 | alta |
| F2.7 | Minagem encoberta | `HIBRIDO.vetores.minagem.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: vetores) | 7,1429 % do total | 1 | alta |
| F3.1 | Frota-sombra (transponder desligado, bandeira de conveniência) | `HIBRIDO.vetores.frota_sombra.janela` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | alta |
| F3.2 | Milícia marítima (pesqueiros a serviço de outro Estado) | `HIBRIDO.vetores.milicia_maritima.janela` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | alta |
| F3.3 | Sabotagem de cabos e dutos submarinos | `HIBRIDO.vetores.sabotagem_submarina.janela` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | alta |
| F3.4 | Drones de superfície ou aéreos sem identificação | `HIBRIDO.vetores.usv_uav.janela` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | alta |
| F3.5 | Interferência em navegação por satélite (GNSS) | `HIBRIDO.vetores.gnss.janela` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | alta |
| F3.6 | Minagem encoberta | `HIBRIDO.vetores.minagem.janela` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | alta |
| F4.1 | Frota-sombra (transponder desligado, bandeira de conveniência) | `HIBRIDO.vetores.frota_sombra.dano` | categoria | opção escolhida → valor da tabela de opções (opções: leve → 1; moderado → 2; grave → 3) | moderado escolha | 2 | alta |
| F4.2 | Milícia marítima (pesqueiros a serviço de outro Estado) | `HIBRIDO.vetores.milicia_maritima.dano` | categoria | opção escolhida → valor da tabela de opções (opções: leve → 1; moderado → 2; grave → 3) | leve escolha | 1 | alta |
| F4.3 | Sabotagem de cabos e dutos submarinos | `HIBRIDO.vetores.sabotagem_submarina.dano` | categoria | opção escolhida → valor da tabela de opções (opções: leve → 1; moderado → 2; grave → 3) | grave escolha | 3 | alta |
| F4.4 | Drones de superfície ou aéreos sem identificação | `HIBRIDO.vetores.usv_uav.dano` | categoria | opção escolhida → valor da tabela de opções (opções: leve → 1; moderado → 2; grave → 3) | moderado escolha | 2 | alta |
| F4.5 | Interferência em navegação por satélite (GNSS) | `HIBRIDO.vetores.gnss.dano` | categoria | opção escolhida → valor da tabela de opções (opções: leve → 1; moderado → 2; grave → 3) | leve escolha | 1 | alta |
| F4.6 | Ataque cibernético a terminais e portos | `HIBRIDO.vetores.ciber.dano` | categoria | opção escolhida → valor da tabela de opções (opções: leve → 1; moderado → 2; grave → 3) | moderado escolha | 2 | alta |
| F4.7 | Minagem encoberta | `HIBRIDO.vetores.minagem.dano` | categoria | opção escolhida → valor da tabela de opções (opções: leve → 1; moderado → 2; grave → 3) | grave escolha | 3 | alta |
| F5.1 | Frota-sombra (transponder desligado, bandeira de conveniência) | `HIBRIDO.vetores.frota_sombra.evasao` | percentual | parâmetro = resposta ÷ 100 | 35 % de redução | 0,35 | alta |
| F5.2 | Milícia marítima (pesqueiros a serviço de outro Estado) | `HIBRIDO.vetores.milicia_maritima.evasao` | percentual | parâmetro = resposta ÷ 100 | 10 % de redução | 0,1 | alta |
| F5.3 | Sabotagem de cabos e dutos submarinos | `HIBRIDO.vetores.sabotagem_submarina.evasao` | percentual | parâmetro = resposta ÷ 100 | 45 % de redução | 0,45 | alta |
| F5.4 | Drones de superfície ou aéreos sem identificação | `HIBRIDO.vetores.usv_uav.evasao` | percentual | parâmetro = resposta ÷ 100 | 30 % de redução | 0,3 | alta |
| F5.5 | Interferência em navegação por satélite (GNSS) | `HIBRIDO.vetores.gnss.evasao` | percentual | parâmetro = resposta ÷ 100 | 20 % de redução | 0,2 | alta |
| F5.6 | Minagem encoberta | `HIBRIDO.vetores.minagem.evasao` | percentual | parâmetro = resposta ÷ 100 | 40 % de redução | 0,4 | alta |
| F6.1 | Frota-sombra (transponder desligado, bandeira de conveniência) | `HIBRIDO.vetores.frota_sombra.etapaNeutraliza` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | abordagem escolha | abordagem | alta |
| F6.2 | Milícia marítima (pesqueiros a serviço de outro Estado) | `HIBRIDO.vetores.milicia_maritima.etapaNeutraliza` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | interrogação escolha | interrogacao | alta |
| F6.3 | Sabotagem de cabos e dutos submarinos | `HIBRIDO.vetores.sabotagem_submarina.etapaNeutraliza` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | identificação escolha | identificacao | alta |
| F6.4 | Drones de superfície ou aéreos sem identificação | `HIBRIDO.vetores.usv_uav.etapaNeutraliza` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | identificação escolha | identificacao | alta |
| F6.5 | Interferência em navegação por satélite (GNSS) | `HIBRIDO.vetores.gnss.etapaNeutraliza` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | identificação escolha | identificacao | alta |
| F6.6 | Minagem encoberta | `HIBRIDO.vetores.minagem.etapaNeutraliza` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | identificação escolha | identificacao | alta |
| F7.1 | Sem defesa cibernética integrada ao quadro | `HIBRIDO.ciber.pDano` | percentual | parâmetro = resposta ÷ 100 | 100 % | 1 | alta |
| F7.2 | Com defesa integrada plena | `HIBRIDO.ciber.reducaoPorFusao` | reducao | parâmetro = (resposta da linha de referência − resposta) ÷ 100 (referência: F7.1) | 50 % | 0,5 | alta |
| F7.3 | Convicção inicial sobre a autoria logo após o ataque | `HIBRIDO.ciber.atribuicao` | pontos | parâmetro = resposta | 10 % de convicção | 10 | alta |
| F8.1 | Sem um fato real a explorar, a cada quantos dias surge uma campanha fabricada? | `HIBRIDO.fabricarACada` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 5 dias | 5 | alta |
| F8.2 | Uma campanha fabricada tem que fração do efeito de uma que explora um fato real? | `HIBRIDO.intensidadeFabricacao` | percentual | parâmetro = resposta ÷ 100 | 50 % | 0,5 | alta |
| G1.1 | Patrulha marítima (FAB): dias até o apoio estar em ação | `APOIOS.mpa.prazo` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | média |
| G1.2 | Patrulha marítima (FAB): dias de permanência do apoio | `APOIOS.mpa.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | média |
| G1.3 | Patrulha marítima (FAB): em que fração das solicitações o apoio é concedido | `APOIOS.mpa.disponibilidade` | percentual | parâmetro = resposta ÷ 100 | 80 % | 0,8 | média |
| G1.4 | Polícia Federal: dias até o apoio estar em ação | `APOIOS.pf.prazo` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | média |
| G1.5 | Polícia Federal: dias de permanência do apoio | `APOIOS.pf.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | média |
| G1.6 | Polícia Federal: em que fração das solicitações o apoio é concedido | `APOIOS.pf.disponibilidade` | percentual | parâmetro = resposta ÷ 100 | 90 % | 0,9 | média |
| G1.7 | Receita Federal: dias até o apoio estar em ação | `APOIOS.rf.prazo` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | média |
| G1.8 | Receita Federal: dias de permanência do apoio | `APOIOS.rf.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | média |
| G1.9 | Receita Federal: em que fração das solicitações o apoio é concedido | `APOIOS.rf.disponibilidade` | percentual | parâmetro = resposta ÷ 100 | 90 % | 0,9 | média |
| G1.10 | IBAMA: dias até o apoio estar em ação | `APOIOS.ibama.prazo` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | média |
| G1.11 | IBAMA: dias de permanência do apoio | `APOIOS.ibama.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | média |
| G1.12 | IBAMA: em que fração das solicitações o apoio é concedido | `APOIOS.ibama.disponibilidade` | percentual | parâmetro = resposta ÷ 100 | 80 % | 0,8 | média |
| G1.13 | CENSIPAM (imageamento): dias até o apoio estar em ação | `APOIOS.censipam.prazo` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | média |
| G1.14 | CENSIPAM (imageamento): dias de permanência do apoio | `APOIOS.censipam.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | média |
| G1.15 | CENSIPAM (imageamento): em que fração das solicitações o apoio é concedido | `APOIOS.censipam.disponibilidade` | percentual | parâmetro = resposta ÷ 100 | 90 % | 0,9 | média |
| G1.16 | Inteligência internacional: dias até o apoio estar em ação | `APOIOS.intl.prazo` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | média |
| G1.17 | Inteligência internacional: dias de permanência do apoio | `APOIOS.intl.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 5 dias | 5 | média |
| G1.18 | Inteligência internacional: em que fração das solicitações o apoio é concedido | `APOIOS.intl.disponibilidade` | percentual | parâmetro = resposta ÷ 100 | 60 % | 0,6 | média |
| G2.1 | Patrulha marítima (FAB): acréscimo na qualidade do quadro (pontos percentuais) | `APOIOS.mpa.bonusFusao` | percentual | parâmetro = resposta ÷ 100 | 20 pontos percentuais | 0,2 | média |
| G2.2 | Polícia Federal: ganho de efetividade da ação de repressão | `APOIOS.pf.fatorCapacidade` | ganho | multiplicador = 1 + resposta ÷ 100 | 30 % de ganho | 1,3 | média |
| G2.3 | Receita Federal: ganho de efetividade da ação de repressão | `APOIOS.rf.fatorCapacidade` | ganho | multiplicador = 1 + resposta ÷ 100 | 30 % de ganho | 1,3 | média |
| G2.4 | IBAMA: ganho de efetividade da ação de repressão | `APOIOS.ibama.fatorCapacidade` | ganho | multiplicador = 1 + resposta ÷ 100 | 30 % de ganho | 1,3 | média |
| G2.5 | CENSIPAM (imageamento): acréscimo na qualidade do quadro (pontos percentuais) | `APOIOS.censipam.bonusFusao` | percentual | parâmetro = resposta ÷ 100 | 10 pontos percentuais | 0,1 | média |
| G2.6 | Inteligência internacional: aceleração do esclarecimento de autoria | `APOIOS.intl.fatorRitmo` | ganho | multiplicador = 1 + resposta ÷ 100 | 50 % de ganho | 1,5 | média |
| H1.1 | Navio SAR | `PRONTIDAO.sar.atraso` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 0 dias | 0 | não medida |
| H1.2 | Força de Pronto Emprego | `PRONTIDAO.fpe.atraso` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | não medida |
| H1.3 | Demais unidades (aprestamento) | `PRONTIDAO.demais.atraso` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | não medida |
| H2.1 | Navio SAR — Comando-em-Chefe da Esquadra | `PRONTIDAO.sar.porEstacao.ComemCh` | inteiro | parâmetro = resposta, arredondada | 1 meios | 1 | não medida |
| H2.2 | Navio SAR — cada Distrito Naval | `PRONTIDAO.sar.porEstacao.DN` | inteiro | parâmetro = resposta, arredondada | 1 meios | 1 | não medida |
| H2.3 | Força de Pronto Emprego — Comando-em-Chefe da Esquadra | `PRONTIDAO.fpe.porEstacao.ComemCh` | inteiro | parâmetro = resposta, arredondada | 3 meios | 3 | não medida |
| H2.4 | Força de Pronto Emprego — cada Distrito Naval | `PRONTIDAO.fpe.porEstacao.DN` | inteiro | parâmetro = resposta, arredondada | 2 meios | 2 | não medida |
| I1.1 | Apoio no início de um período de tensão | `INFOCOG.apoioInicial` | pontos | parâmetro = resposta | 60 % | 60 | média |
| I1.2 | Patamar habitual para o qual o apoio tende sem novos fatos | `INFOCOG.apoioReferencia` | pontos | parâmetro = resposta | 60 % | 60 | média |
| I1.3 | Em quantos dias, sem novos fatos, o apoio recupera metade da distância até o patamar habitual | `INFOCOG.retornoPorTurno` | meia_vida | fração recuperada por turno = 1 − 0,5^(1/resposta) | 13,5134 dias | 0,05 | média |
| I1.4 | Abaixo de que apoio as regras de engajamento tendem a ser restringidas | `INFOCOG.faixasRoe.estreita` | pontos | parâmetro = resposta | 30 % | 30 | média |
| I1.5 | Acima de que apoio as regras de engajamento tendem a ser ampliadas | `INFOCOG.faixasRoe.amplia` | pontos | parâmetro = resposta | 75 % | 75 | média |
| I2.1 | Ilícito reprimido e divulgado | `INFOCOG.eventosMar.reprimida` | pontos | parâmetro = resposta | 0,5 pontos percentuais | 0,5 | média |
| I2.2 | Salvamento bem-sucedido | `INFOCOG.eventosMar.sar_sucesso` | pontos | parâmetro = resposta | 3 pontos percentuais | 3 | média |
| I2.3 | Salvamento malsucedido, com vítimas | `INFOCOG.eventosMar.sar_falha` | pontos | parâmetro = resposta | -4 pontos percentuais | -4 | média |
| I2.4 | Dano a infraestrutura crítica | `INFOCOG.eventosMar.dano_infra` | pontos | parâmetro = resposta | -2 pontos percentuais | -2 | média |
| I2.5 | Incidente sem resposta visível | `INFOCOG.eventosMar.incidente_nao_respondido` | pontos | parâmetro = resposta | -1 pontos percentuais | -1 | média |
| I2.6 | Danos a terceiros por ação da Marinha | `INFOCOG.eventosMar.dano_terceiros` | pontos | parâmetro = resposta | -5 pontos percentuais | -5 | média |
| I2.7 | Dano ambiental por ação militar | `INFOCOG.eventosMar.dano_ambiental` | pontos | parâmetro = resposta | -4 pontos percentuais | -4 | média |
| I3.1 | Pontos de apoio perdidos com uma campanha de desinformação de intensidade máxima | `INFOCOG.desinformacao.base` | pontos | parâmetro = resposta | 6 pontos percentuais | 6 | média |
| I3.2 | Quanto a mais rende a desinformação quando explora um erro real da Marinha | `INFOCOG.desinformacao.gatilhoReal` | ganho | multiplicador = 1 + resposta ÷ 100 | 50 % de ganho | 1,5 | média |
| I3.3 | Pontos de apoio recuperados por: comunicação estratégica | `INFOCOG.campanhas.comunicacao_estrategica.ganho` | pontos | parâmetro = resposta | 3 pontos percentuais | 3 | média |
| I3.4 | Pontos de apoio recuperados por: transparência proativa | `INFOCOG.campanhas.transparencia.ganho` | pontos | parâmetro = resposta | 2 pontos percentuais | 2 | média |
| I3.5 | Pontos de apoio recuperados por: divulgação de prova documentada | `INFOCOG.campanhas.prova_documentada.ganho` | pontos | parâmetro = resposta | 6 pontos percentuais | 6 | média |
| I3.6 | Quanto do efeito da desinformação a comunicação preventiva (prebunking) neutraliza | `INFOCOG.campanhas.prebunking.protecao` | percentual | parâmetro = resposta ÷ 100 | 50 % | 0,5 | média |
| I3.7 | Por quantos dias dura a proteção da comunicação preventiva | `INFOCOG.campanhas.prebunking.duracao` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | média |
| I4.1 | Interrogar um navio sem indícios | `PESO_POLITICO.interrogacao` | formula | peso = pontos × u ÷ (convicção mínima da interrogação ÷ 100), com u = custo de 1 ponto (abordagem sem indícios ÷ 10) | 1,25 pontos (abordagem sem indícios = 10) | 0,5 | alta |
| I4.2 | Inspecionar a carga sem indícios suficientes | `PESO_POLITICO.inspecao` | formula | peso = pontos × u ÷ (convicção mínima da inspeção ÷ 100) | 10 pontos (abordagem sem indícios = 10) | 2 | alta |
| I4.3 | Apresar sem prova | `PESO_POLITICO.apresamento` | formula | peso = pontos × u ÷ (convicção mínima do apresamento ÷ 100) | 35 pontos (abordagem sem indícios = 10) | 4 | alta |
| I4.4 | Interromper desnecessariamente a navegação de um navio mercante | `TERCEIROS.interrupcao.excesso` | formula | unidades de excesso = pontos × u ÷ peso do excesso | 25 pontos (abordagem sem indícios = 10) | 1 | média |
| I4.5 | Usar força desnecessária contra um mercante ou pesqueiro (sem vítimas) | `TERCEIROS.forcaDesnecessaria.excesso` | formula | unidades de excesso = pontos × u ÷ peso do excesso | 50 pontos (abordagem sem indícios = 10) | 2 | média |
| I4.6 | Causar danos a terceiros (lesões, avarias) | `INFOCOG.custo.pesoDanos` | formula | peso dos danos = pontos × u | 37,5 pontos (abordagem sem indícios = 10) | 3 | média |
| I4.7 | Causar dano ambiental em ação militar | `TERCEIROS.ambiental.danos` | formula | unidades de dano = pontos × u ÷ peso dos danos | 37,5 pontos (abordagem sem indícios = 10) | 1 | média |
| I4.8 | Desgaste acumulado a partir do qual a operação perde sustentação política | `INFOCOG.tetoCustoPolitico` | formula | teto = pontos × u | 312,5 pontos (abordagem sem indícios = 10) | 25 | média |
| I5.1 | Pontos de apoio perdidos por um episódio de abordagem sem indícios | `INFOCOG.apoioPorCusto` | formula | apoio perdido por unidade de custo = resposta ÷ (custo da abordagem sem indícios) | 2,4 pontos percentuais | 3 | média |
| I5.2 | Com o apoio público em 30%, quanto mais pesa o mesmo erro do que com o apoio no patamar habitual | `INFOCOG.custo.modulacao` | formula | multiplicador = 1 + modulação × (patamar − 30) ÷ patamar; modulação = (resposta ÷ 100) × patamar ÷ (patamar − 30) | 25 % a mais | 0,5 | média |
| J1.1 | Quantas por mês, com integração mínima do quadro? | `TERCEIROS.falsosAlarmes.lambda` | por_mes | parâmetro (por turno de 24 h) = resposta ÷ 30 | 9 embarcações por mês | 0,3 | média |
| J1.2 | Quantas por mês, com integração plena do quadro? | `TERCEIROS.falsosAlarmes.reducaoPorFusao` | formula | redução = 1 − (resposta ÷ resposta da linha J1.1) (referência: J1.1) | 3,6 embarcações por mês | 0,6 | média |
| J1.3 | Fração que são: navio mercante em trânsito regular | `TERCEIROS.falsosAlarmes.tipos.mercante.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: inocentes) | 50 % do total | 1 | média |
| J1.4 | Fração que são: pesqueiro em atividade legal | `TERCEIROS.falsosAlarmes.tipos.pesqueiro.peso` | normalizado | participação relativa; os valores do grupo são reescalados para manter a soma atual do grupo (grupo: inocentes) | 50 % do total | 1 | média |
| J1.5 | Fase da ação em que a inocência fica clara | `TERCEIROS.falsosAlarmes.etapaRevela` | categoria | opção escolhida → valor da tabela de opções (opções: interrogação → interrogacao; identificação → identificacao; abordagem → abordagem; inspeção → inspecao; apresamento → apresamento) | inspeção escolha | inspecao | média |
| J1.6 | Fração esclarecida já na interrogação, antes da abordagem, com integração mínima do quadro | `TERCEIROS.falsosAlarmes.esclareceNaInterrogacao.base` | percentual | parâmetro = resposta ÷ 100 | 20 % | 0,2 | média |
| J1.7 | Idem, com integração plena do quadro | `TERCEIROS.falsosAlarmes.esclareceNaInterrogacao.porFusao` | diferenca | parâmetro = (resposta − resposta da linha de referência) ÷ 100 (referência: J1.6) | 70 % | 0,5 | média |
| J2.1 | Rotina | `TERCEIROS.forcaDesnecessaria.pPorNivel.0` | percentual | parâmetro = resposta ÷ 100 | 5 % | 0,05 | média |
| J2.2 | Tensão | `TERCEIROS.forcaDesnecessaria.pPorNivel.1` | percentual | parâmetro = resposta ÷ 100 | 10 % | 0,1 | média |
| J2.3 | Crise | `TERCEIROS.forcaDesnecessaria.pPorNivel.2` | percentual | parâmetro = resposta ÷ 100 | 20 % | 0,2 | média |
| J2.4 | Conflito | `TERCEIROS.forcaDesnecessaria.pPorNivel.3` | percentual | parâmetro = resposta ÷ 100 | 30 % | 0,3 | média |
| J2.5 | Havendo uso de força, chance de causar lesões ou avarias | `TERCEIROS.forcaDesnecessaria.pDano` | percentual | parâmetro = resposta ÷ 100 | 30 % | 0,3 | média |
| J3.1 | Frota-sombra (transponder desligado, bandeira de conveniência) | `TERCEIROS.ambiental.pPorVetor.frota_sombra` | percentual | parâmetro = resposta ÷ 100 | 5 % | 0,05 | média |
| J3.2 | Milícia marítima (pesqueiros a serviço de outro Estado) | `TERCEIROS.ambiental.pPorVetor.milicia_maritima` | percentual | parâmetro = resposta ÷ 100 | 2 % | 0,02 | média |
| J3.3 | Sabotagem de cabos e dutos submarinos | `TERCEIROS.ambiental.pPorVetor.sabotagem_submarina` | percentual | parâmetro = resposta ÷ 100 | 4 % | 0,04 | média |
| J3.4 | Minagem encoberta | `TERCEIROS.ambiental.pPorVetor.minagem` | percentual | parâmetro = resposta ÷ 100 | 10 % | 0,1 | média |
| J3.5 | Risco ambiental em Rotina, em % do risco em Crise | `TERCEIROS.ambiental.fatorNivel.0` | percentual | parâmetro = resposta ÷ 100 | 50 % do risco em Crise | 0,5 | média |
| J3.6 | Risco ambiental em Tensão, em % do risco em Crise | `TERCEIROS.ambiental.fatorNivel.1` | percentual | parâmetro = resposta ÷ 100 | 75 % do risco em Crise | 0,75 | média |
| J3.7 | Risco ambiental em Crise, em % do risco em Crise | `TERCEIROS.ambiental.fatorNivel.2` | percentual | parâmetro = resposta ÷ 100 | 100 % do risco em Crise | 1 | média |
| J3.8 | Risco ambiental em Conflito, em % do risco em Crise | `TERCEIROS.ambiental.fatorNivel.3` | percentual | parâmetro = resposta ÷ 100 | 150 % do risco em Crise | 1,5 | média |
| K1.1 | Crimes e ilícitos no mar: detecção, prazo ideal | `CRISES.crimes_ilicitos.deteccao.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | não medida |
| K1.2 | Crimes e ilícitos no mar: detecção, prazo máximo | `CRISES.crimes_ilicitos.deteccao.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | não medida |
| K1.3 | Crimes e ilícitos no mar: resposta, prazo ideal | `CRISES.crimes_ilicitos.resposta.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | não medida |
| K1.4 | Crimes e ilícitos no mar: resposta, prazo máximo | `CRISES.crimes_ilicitos.resposta.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 5 dias | 5 | não medida |
| K1.5 | Sabotagem de infraestrutura crítica: detecção, prazo ideal | `CRISES.sabotagem_ic.deteccao.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | não medida |
| K1.6 | Sabotagem de infraestrutura crítica: detecção, prazo máximo | `CRISES.sabotagem_ic.deteccao.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 4 dias | 4 | não medida |
| K1.7 | Sabotagem de infraestrutura crítica: resposta, prazo ideal | `CRISES.sabotagem_ic.resposta.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | não medida |
| K1.8 | Sabotagem de infraestrutura crítica: resposta, prazo máximo | `CRISES.sabotagem_ic.resposta.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 6 dias | 6 | não medida |
| K1.9 | Pesca ilegal em massa: detecção, prazo ideal | `CRISES.pesca_massa.deteccao.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | não medida |
| K1.10 | Pesca ilegal em massa: detecção, prazo máximo | `CRISES.pesca_massa.deteccao.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | não medida |
| K1.11 | Pesca ilegal em massa: resposta, prazo ideal | `CRISES.pesca_massa.resposta.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | não medida |
| K1.12 | Pesca ilegal em massa: resposta, prazo máximo | `CRISES.pesca_massa.resposta.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 6 dias | 6 | não medida |
| K1.13 | Salvaguarda da vida humana no mar (SAR): detecção, prazo ideal | `CRISES.sar.deteccao.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 0 dias | 0 | não medida |
| K1.14 | Salvaguarda da vida humana no mar (SAR): detecção, prazo máximo | `CRISES.sar.deteccao.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | não medida |
| K1.15 | Salvaguarda da vida humana no mar (SAR): resposta, prazo ideal | `CRISES.sar.resposta.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | não medida |
| K1.16 | Salvaguarda da vida humana no mar (SAR): resposta, prazo máximo | `CRISES.sar.resposta.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | não medida |
| K1.17 | Resposta a desastres: detecção, prazo ideal | `CRISES.desastre.deteccao.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | não medida |
| K1.18 | Resposta a desastres: detecção, prazo máximo | `CRISES.desastre.deteccao.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 3 dias | 3 | não medida |
| K1.19 | Resposta a desastres: resposta, prazo ideal | `CRISES.desastre.resposta.ideal` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 2 dias | 2 | não medida |
| K1.20 | Resposta a desastres: resposta, prazo máximo | `CRISES.desastre.resposta.max` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 5 dias | 5 | não medida |
| K2.1 | Crimes e ilícitos no mar: embarcações envolvidas | `CRISES.crimes_ilicitos.efeito.ocorrencias.n` | inteiro | parâmetro = resposta, arredondada | 3 embarcações | 3 | não medida |
| K2.2 | Pesca ilegal em massa: embarcações envolvidas | `CRISES.pesca_massa.efeito.ocorrencias.n` | inteiro | parâmetro = resposta, arredondada | 8 embarcações | 8 | não medida |
| K2.3 | Crimes e ilícitos / pesca em massa: fração das embarcações reprimidas para considerar a resposta adequada | `CRISES.crimes_ilicitos.resposta.fracaoReprimida`<br>`CRISES.pesca_massa.resposta.fracaoReprimida` | percentual | parâmetro = resposta ÷ 100 | 50 % | — | não medida |
| K2.4 | Salvamento: pessoas em perigo | `CRISES.sar.efeito.sar.pessoas` | inteiro | parâmetro = resposta, arredondada | 30 pessoas | 30 | não medida |
| K2.5 | Salvamento: meios necessários | `CRISES.sar.efeito.sar.meios` | inteiro | parâmetro = resposta, arredondada | 1 meios | 1 | não medida |
| K2.6 | Desastre: meios necessários | `CRISES.desastre.efeito.desastre.meios` | inteiro | parâmetro = resposta, arredondada | 2 meios | 2 | não medida |
| K2.7 | Sabotagem de infraestrutura: convicção inicial sobre a autoria | `CRISES.sabotagem_ic.efeito.hibrido.atribuicao` | pontos | parâmetro = resposta | 20 % de convicção | 20 | não medida |
| L1.1 | Quantas ações distintas (designação de meio a um contato) o comando consegue conduzir por dia | `DOUTRINA.acoesPorEstacao` | inteiro | parâmetro = resposta, arredondada | 4 ações por dia | 4 | média |
| L1.2 | Quantas ações extras em um dia de sobrecarga | `DOUTRINA.surto` | inteiro | parâmetro = resposta, arredondada | 2 ações | 2 | média |
| L1.3 | Quantas ações a menos no dia seguinte a uma sobrecarga | `DOUTRINA.penalidadeSurto` | inteiro | parâmetro = resposta, arredondada | 2 ações | 2 | média |
| L1.4 | Faltando quantos dias para o dano, o comandante aceita agir além do que os indícios fundamentam | `DOUTRINA.urgencia` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 1 dias | 1 | média |
| L1.5 | Abaixo de que apoio público o comando priorizaria a comunicação estratégica | `DOUTRINA.apoioParaComunicar` | pontos | parâmetro = resposta | 50 % | 50 | média |
| L1.6 | A cada quantos dias renovar a comunicação preventiva | `DOUTRINA.prebunkingACada` | dias | parâmetro (turnos de 24 h) = resposta, arredondada | 7 dias | 7 | média |
| M1.1 | Êxito da Força Azul: integridade mínima da infraestrutura crítica | `DESFECHO.infraVitoriaAzul` | pontos | parâmetro = resposta | 80 % preservada | 80 | alta |
| M1.2 | Êxito da Força Azul: fração mínima dos ilícitos reprimidos | `DESFECHO.ordemVitoriaAzul` | percentual | parâmetro = resposta ÷ 100 | 40 % | 0,4 | alta |
| M1.3 | Êxito do adversário: integridade da infraestrutura abaixo de | `DESFECHO.infraVitoriaVermelha` | pontos | parâmetro = resposta | 60 % preservada | 60 | alta |
| O1.1 | Comentário | `AREAS_DN` | manual | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita | — texto | — | não medida |
| O2.1 | Comentário | `MEIOS_AZUIS`<br>`BASES` | manual | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita | — texto | — | estrutural |
| O3.1 | Comentário | `INFRA` | manual | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita | — texto | — | estrutural |
| O4.1 | Comentário | `HIBRIDO.vetores.frota_sombra.alvos`<br>`HIBRIDO.vetores.milicia_maritima.alvos`<br>`HIBRIDO.vetores.sabotagem_submarina.alvos`<br>`HIBRIDO.vetores.usv_uav.alvos`<br>`HIBRIDO.vetores.gnss.alvos`<br>`HIBRIDO.vetores.ciber.alvos`<br>`HIBRIDO.vetores.minagem.alvos` | manual | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita | — texto | — | alta |
| O5.1 | Comentário | `APOIOS.mpa.pertinencia`<br>`APOIOS.pf.pertinencia`<br>`APOIOS.rf.pertinencia`<br>`APOIOS.ibama.pertinencia`<br>`APOIOS.censipam.pertinencia`<br>`APOIOS.intl.pertinencia` | manual | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita | — texto | — | média |
| O6.1 | Comentário | `TIPOS_OCORRENCIA.narcotrafico.terrenos`<br>`TIPOS_OCORRENCIA.contrabando.terrenos`<br>`TIPOS_OCORRENCIA.pesca_iuu.terrenos`<br>`TIPOS_OCORRENCIA.crime_ambiental.terrenos`<br>`TIPOS_OCORRENCIA.pirataria.terrenos`<br>`TIPOS_OCORRENCIA.imigracao.terrenos` | manual | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita | — texto | — | alta |
| O7.1 | Comentário | `DOUTRINA` | manual | sem conversão automática: a resposta é interpretada pelo analista e registrada no código ou na sobrescrita | — texto | — | média |

## Parâmetros fora do questionário (decisões de projeto)

| Parâmetro | Motivo |
|---|---|
| `DIFICULDADES` | níveis de dificuldade do jogo (névoa, ritmo para fins de jogabilidade) |
| `HIBRIDO.maxAcoesHumano` | teto de jogabilidade para o jogador Vermelho humano |
| `HIBRIDO.empregoAberto.intensidadeMin` | limiar da intensidade híbrida configurada no cenário |
| `HIBRIDO.empregoAberto.nivelMin` | regra da escada (emprego aberto só a partir de Crise) |
| `DOUTRINA.quadro.teto` | teto técnico da chance de entrar no quadro |
| `INFOCOG.campanhasPorTurno` | ritmo de jogo (uma campanha por turno) |
| `INFOCOG.prazoCampanha` | ritmo de jogo |
| `INFOCOG.campanhas.prebunking.ganho` | a comunicação preventiva protege, não recupera apoio |
| `CRISES.desastre.efeito.desastre.escala` | reservado (escala única no modelo atual) |
| `LIMIAR_ATRIBUICAO.deteccao` | detecção e identificação não exigem fundamento (vigilância) |
| `LIMIAR_ATRIBUICAO.identificacao` | idem |
| `PESO_POLITICO.deteccao` | idem |
| `PESO_POLITICO.identificacao` | idem |
| `PESO_POLITICO.abordagem` | âncora da escala de gravidade da questão I4 (abordagem sem indícios = 10 pontos) |
| `INFOCOG.custo.pesoExcesso` | unidade da escala de gravidade: a questão I4 move as unidades de excesso de cada situação, não o peso |
| `HIBRIDO.vetores.ciber.janela` | o ataque cibernético resolve no próprio turno |
| `HIBRIDO.vetores.lawfare` | lawfare age pela desinformação (questões F8 e I3), não no mar |
