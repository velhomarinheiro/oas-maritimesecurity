**OPERAÇÃO ATLÂNTICO SUL**

**VARIANTE DE SEGURANÇA MARÍTIMA (OAS-SM)**

**Desenho Experimental**

**e Esquema de Dados**

**(PBC / MarSec)**

*Fatores, métricas, desenhos e dataset da variante de Segurança
Marítima*

**Versão 1.3**

Documento de Trabalho — OAS-SM/DE

DOCUMENTO FICTÍCIO — USO EDUCACIONAL E DE PESQUISA

**Aviso**

Este documento integra o cenário fictício da *Operação Atlântico Sul* e
sua variante de Segurança Marítima (OAS-SM). Foi elaborado
exclusivamente para instrução militar e como instrumento de pesquisa em
simulação construtiva no contexto do Planejamento Baseado em Capacidades
(PBC). A República de Karthavia, suas forças e seus dirigentes são
inteiramente fictícios e não guardam correspondência com Estados,
organizações ou pessoas reais. O cenário não representa condição
esperada ou desejada, nem expressa posição oficial de qualquer
instituição.

Os valores paramétricos de ameaças, sensores, defesas e custos indicados
neste texto são *placeholders* de projeto, a serem substituídos por
dados validados por especialistas antes de qualquer uso analítico
conclusivo. A denominação e as jurisdições das estações de comando
seguem a organização de referência adotada no projeto.

**Sumário**

**1 Propósito Analítico**

Este documento especifica como a variante OAS-SM gera dados para a
análise estatística no contexto do Planejamento Baseado em Capacidades.
Mantém-se a lógica dual do projeto — o mesmo motor serve ao modo
interativo (humano) e ao modo batch (agentes doutrinários) — e a
estrutura de saída (uma linha por partida) e o pipeline Jamovi/R já
estabelecidos. Alteram-se os fatores sob avaliação, o papel do ISR, o
conjunto de métricas e o esquema de dados, para refletir as duas trilhas
de ameaça (defesa e constabular) e a estrutura de C2.

**2 Fatores sob Avaliação**

Cinco capacidades entram como fatores liga/desliga. Cada fator inclui ou
remove do OOB as unidades correspondentes.

| **Fator**   | **Capacidade**                    | **Unidades / meios**      | **Papel**                                     |
|-------------|-----------------------------------|---------------------------|-----------------------------------------------|
| **A_MPA**   | Patrulha marítima persistente     | Aviação de patrulha (MPA) | Vigilância de área ampla                      |
| **B_NPaOc** | Navios-patrulha oceânicos         | OPV / corvetas            | Presença e interdição                         |
| **C_Fusão** | Fusão de dados / SisGAAz ampliado | Satélite, RF, AIS forense | Consciência situacional, atribuição e triagem |
| **D_USV**   | Sistemas não tripulados           | USV / UAV / ROV           | Sensoriamento persistente e MCM               |
| **E_GVI**   | Abordagem e interdição            | GptFN embarcado + ROE     | Execução da resposta graduada                 |

*Tabela 2.1. Fatores da variante OAS-SM.*

**2.1 Vetor de custo (EAC base 100)**

| **A_MPA** | **B_NPaOc** | **C_Fusão** | **D_USV** | **E_GVI** |
|-----------|-------------|-------------|-----------|-----------|
| 70        | 100         | 55          | 35        | 40        |

*Tabela 2.2. Vetor de custo EAC (placeholder).*

**2.2 Modalidade de C2 como condição controlada**

A modalidade de jogo (jogador único, confronto 1×1 ou estações
distribuídas) não é um dos cinco fatores: é uma condição controlada,
fixada em jogador único nas execuções de pesquisa, para que a variação
de desempenho reflita as capacidades e não a decisão humana. As
modalidades 1×1 (Azul × Vermelho) e distribuída (exercício de
estado-maior) destinam-se ao modo interativo; seus efeitos podem ser
investigados como extensão, em desenho próprio.

**2.3 Apoio externo como tratamento controlado**

O apoio externo centralizado pelo COMPAAz — a patrulha marítima ativada
junto à FAB e os apoios interagências (Polícia Federal, Receita Federal,
IBAMA, CENSIPAM e cooperação de inteligência) — **não é um fator
liga/desliga de capacidade**, mas um modificador condicional de
efetividade: só atua sobre a ação pertinente à atribuição do órgão e
está sujeito a prazo. Por isso é modelado como um tratamento binário
controlado, **apoio_externo** (disponível / indisponível), e não como
sexto fator — o que evitaria inflar o fatorial para 2⁶. No desenho
principal, apoio_externo é fixado em *disponível* (condição realista de
emprego); seu efeito marginal é medido em um contraste dedicado (5.2).

**3 ISR / Fusão: Nova Centralidade**

No jogo base, o ISR é constante de controle. Na OAS-SM isso se inverte:
a fusão de dados (fator **C_Fusão**) passa a ser capacidade sob
avaliação, porque a consciência situacional é a variável decisiva em
Maritime Security. A fusão alimenta o barramento comum das estações de
C2 e condiciona duas decisões críticas: a atribuição na trilha de defesa
e a triagem das ocorrências na trilha constabular (distinguir rotina de
cobertura para o híbrido).

**4 Métricas**

O atrito deixa de ser a métrica primária. O conjunto reflete os efeitos
das duas trilhas: neutralização/atribuição, integridade da
infraestrutura, contenção da escalada, custo político e ordem marítima.

| **Métrica**         | **Definição**                                                                    | **Sentido**    |
|---------------------|----------------------------------------------------------------------------------|----------------|
| **E1_atrib**        | Fração de incidentes do híbrido neutralizados e/ou atribuídos de forma robusta.  | Maior é melhor |
| **E2_infra**        | Integridade da infraestrutura crítica (FPSOs + cabos/dutos) preservada, em VP.   | Maior é melhor |
| **E3_escalada**     | Turnos mantidos abaixo do limiar de conflito (contenção).                        | Maior é melhor |
| **E4_custopol**     | Custo político acumulado (respostas erradas, danos a terceiros).                 | Menor é melhor |
| **E5_ordem**        | Fração de ocorrências constabulares detectadas e reprimidas (governança).        | Maior é melhor |
| **E6_dispersao**    | Capacidade Azul desviada pela carga constabular instrumentalizada (acoplamento). | Menor é melhor |
| **sloc_idx**        | Índice de segurança/fluidez das linhas de comunicação marítima.                  | Maior é melhor |
| **atrito_terminal** | Perdas no caso-limite N3, quando houver escalada aberta.                         | Contextual     |

*Tabela 4.1. Métricas da variante OAS-SM.*

A tensão central do jogador aparece na relação entre **E5_ordem** e
**E1_atrib**: perseguir toda ocorrência eleva a governança mas eleva
também E6_dispersao e abre janelas ao híbrido; ignorá-las preserva o
foco mas degrada a ordem. O equilíbrio depende da triagem e, portanto,
de C_Fusão.

**5 Desenhos Experimentais**

**5.1 Desenhos principais**

Preservam-se os dois desenhos complementares: a ablação isola a
contribuição individual de cada capacidade; o fatorial completo captura
efeitos de interação. Em ambos, apoio_externo é fixado em disponível.

| **Desenho**                                       | **Condições** | **Réplicas** | **Partidas** |
|---------------------------------------------------|---------------|--------------|--------------|
| Ablação (C0 = todas; C1–C5 = sem cada capacidade) | 6             | 50           | **300**      |
| Fatorial completo 2⁵                              | 32            | 20           | **640**      |
| **Subtotal principal**                            | —             | —            | **940**      |

*Tabela 5.1. Volumes dos desenhos principais (modalidade de C2 e apoio
externo fixos).*

**5.2 Contraste de apoio externo**

Para estimar o efeito marginal da coordenação externa do COMPAAz sem
inflar o fatorial, roda-se um contraste dedicado sobre a condição C0
(todas as capacidades ativas), variando apenas **apoio_externo** entre
disponível e indisponível, com sementes espelhadas. A comparação incide
sobretudo sobre E5_ordem e E1_atrib (ganho de efetividade) e sobre
E4_custopol (respostas mais bem fundamentadas).

| **Contraste**                                  | **Condições** | **Réplicas** | **Partidas** |
|------------------------------------------------|---------------|--------------|--------------|
| C0 × apoio_externo (disponível / indisponível) | 2             | 50           | **100**      |

*Tabela 5.2. Contraste de apoio externo (extensão focada).*

Total geral: **1.040 partidas** (940 principais + 100 do contraste).
Sementes espelhadas entre condições garantem blocagem; a semente também
fixa a sequência de ocorrências constabulares e de apoios concedidos, de
modo que a mesma semente reproduza exatamente a mesma campanha (critério
de aceitação).

**6 Esquema do Dataset**

Uma linha por partida. Colunas compatíveis com o pipeline do projeto,
acrescidas das métricas das duas trilhas, da configuração de C2 e do
apoio externo.

| **Coluna**                            | **Tipo** | **Descrição**                                                       |
|---------------------------------------|----------|---------------------------------------------------------------------|
| bloco, condicao, replica, semente     | id       | Identificação da célula experimental.                               |
| modalidade_C2                         | cat      | Modalidade de comando (padrão: 'unico').                            |
| apoio_externo                         | 0/1      | Tratamento: apoio externo disponível (padrão: 1).                   |
| A_MPA, B_NPaOc, C_Fusão, D_USV, E_GVI | −1/+1    | Fatores (codificação de contraste).                                 |
| n_capacidades, custo_total            | num      | Capacidades ativas e custo EAC.                                     |
| E1_atrib, E2_infra, E3_escalada       | num      | Métricas da trilha de defesa.                                       |
| E4_custopol                           | num      | Custo político acumulado.                                           |
| E5_ordem, E6_dispersao                | num      | Métricas da trilha constabular e do acoplamento.                    |
| n_ocorr_crim, ocorr_reprimidas        | num      | Ocorrências constabulares geradas e atendidas.                      |
| mpa_solicitada, mpa_atendida          | num      | Pedidos de patrulha marítima (FAB via COMPAAz) e atendimentos.      |
| apoio_pf, apoio_rf, apoio_ibama       | num      | Apoios usados: Polícia Federal, Receita Federal, IBAMA.             |
| apoio_censipam, apoio_intl            | num      | Apoios usados: imageamento (CENSIPAM) e inteligência internacional. |
| n_apoios_concedidos, efeito_apoio     | num      | Apoios concedidos e ganho de efetividade atribuível.                |
| sloc_idx                              | num      | Índice de segurança das SLOC.                                       |
| kcv_perdido                           | 0/1      | KCV abatido em N3 (derrota Vermelha).                               |
| nivel_max                             | 0–3      | Nível máximo de escalada atingido.                                  |

*Tabela 6.1. Colunas do dataset OAS-SM (CSV/UTF-8 e/ou XLSX).*

**7 Pipeline Estatístico**

O pipeline Jamovi + R é reutilizado sem alteração estrutural: ablação
com correção de Holm sobre as contribuições marginais; ANOVA fatorial
com η² parcial sobre E1–E6; regressão logística sobre kcv_perdido e
sobre a ocorrência de escalada a N3; e visualização de Pareto (ggplot2)
no plano custo × efeito. Com as duas trilhas, a análise ganha um exame
específico do compromisso E5_ordem × E1_atrib em função de C_Fusão. O
contraste de apoio externo (5.2) entra como teste de diferença entre as
duas condições de apoio_externo sobre E5_ordem, E1_atrib e E4_custopol,
com tamanho de efeito reportado.

**8 Critérios de Aceitação**

- Determinismo: mesma semente reproduz exatamente a mesma campanha
  (incluindo as ocorrências constabulares).

- O motor de encontro respeita seus limites (encontro nulo ⇒ sem efeito;
  atribuição plena ⇒ resposta máxima autorizada).

- A escalada a N3 aciona o motor de salva sem alterar sua física nem os
  testes herdados.

- Ativar/desativar um fator altera apenas as unidades previstas no OOB.

- A troca de modalidade de C2 (único ↔ distribuído) não altera as
  regras, apenas quem decide cada estação.

- O apoio externo atua apenas sobre a ação pertinente à atribuição do
  órgão e respeita o prazo; com apoio_externo = 0, nenhum apoio é
  concedido.

- Gera o dataset no esquema da seção 6, importável em Jamovi/R.

- Executa os 1.040 cenários (940 principais + 100 do contraste de apoio)
  em lote.

- Perda do KCV encerra a partida como derrota Vermelha.
