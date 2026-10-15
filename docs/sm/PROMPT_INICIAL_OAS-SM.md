# Prompt inicial — Adaptação OAS → OAS-SM (Segurança Marítima)

> **Como usar:** cole este texto como a primeira mensagem de uma sessão do Claude Code conectada ao
> repositório do projeto **Operação Atlântico Sul (OAS)**. Anexe também, nesta mesma pasta, os dois
> documentos de referência: `OAS-SM_Conceito_e_Regras_v1.6.docx` e
> `OAS-SM_Desenho_Experimental_v1.3.docx`. Eles são a especificação; este prompt é o guia de execução.

---

## 1. Objetivo

Adaptar a ferramenta existente da **Operação Atlântico Sul (OAS)** para a variante de **Segurança
Marítima (OAS-SM)**, descrita nos dois documentos anexos. A OAS-SM reposiciona o jogo da guerra naval
de alta intensidade para o espectro de *Maritime Security* e ameaças híbridas, preservando a
arquitetura e o motor de salva do jogo base, que passa a ser o **caso-limite de escalada terminal (N3)**.

**Não reescrever o que existe.** Reusar `engine/game/agents/runner`, `salvo.ts`, `rng.ts`, `hex.ts`,
`state.ts`, `oob.ts` e os testes já aprovados. A adaptação é feita por **extensão** e por **novos
módulos**, com a mesma disciplina *fase-gated* do projeto.

## 2. Antes de escrever qualquer código

1. Leia o `CLAUDE.md` do repositório e os arquivos de convenção do projeto
   (`rules-and-learnings.md`, `ways-of-working.md`, e o `briefing construcao ferramenta.pdf`, se presentes).
2. Mapeie a estrutura atual: localize `salvo.ts`, `rng.ts`, `hex.ts`, `state.ts`, `oob.ts`, o runner de
   lote e a suíte de testes. **Rode os testes existentes** e registre o baseline verde.
3. Leia os dois documentos anexos (Conceito v1.6 e Desenho Experimental v1.3). Em caso de conflito entre
   este prompt e os documentos, **os documentos prevalecem**; aponte a divergência.
4. **Produza um plano** (fase a fase, com arquivos a criar/alterar e testes previstos) e **aguarde
   validação** antes de implementar. Depois, avance **uma fase por vez**, cada uma com testes verdes
   antes de prosseguir.

## 3. Princípios inegociáveis

- **Determinismo:** mesma semente ⇒ exatamente a mesma campanha (inclui ocorrências constabulares,
  crises e apoios concedidos). É critério de aceitação e deve ter teste.
- **Motor de salva intocado:** a escalada terminal (N3) chama `salvo.ts` **sem alterar sua física**
  nem os testes herdados.
- **Interruptores de fator:** ligar/desligar um fator (A–E) altera **apenas** as unidades previstas no OOB.
- **Uma linha por partida** no dataset, no esquema da Seção 6 do Desenho Experimental, importável em Jamovi/R.
- **TypeScript**, mesmo estilo, lint e padrões de teste do projeto. Sem dependências novas sem justificativa.

## 4. Novos módulos (nomes de referência — ajuste ao padrão do repo)

| Módulo | Responsabilidade |
|---|---|
| `encounter.ts` | Resolução abaixo do limiar: detecção, identificação, interrogação, abordagem/vistoria (GVI), inspeção, apresamento. Modulada por capacidade da unidade e qualidade da fusão. Serve às duas trilhas. |
| `c2.ts` | Seis estações (COMPAAz, ComemCh, 1º/2º/5º/8º DN), barramento de fusão / quadro operacional comum, papéis por estação, modalidades (único, 1×1, distribuído) e o despacho de apoios externos pelo COMPAAz (patrulha via FAB e interagências, com prazo). |
| `constab.ts` | Gerador estocástico das ocorrências da trilha constabular por área e tipo (narcotráfico, contrabando/descaminho, IUU, crimes ambientais, pirataria, imigração), com a dupla função (governança + saturação). |
| `campaign.ts` | Configurador de cenário (ativação de áreas, trilhas, postura/forças, dificuldade e modo), dificuldade como névoa de atribuição (3 níveis), episódios de crise (Detecção/Resposta), boletim de situação e Célula Branca. |
| `infocog.ts` | Dimensão informacional e cognitiva: indicador de apoio público/confiança, desinformação Vermelha × campanhas informacionais Azuis, modulando custo político e largura das ROE. |

Estender também: `state.ts` (postura de escalada N0–N3, nível de atribuição, estações de C2, apoio público,
prontidão), `oob.ts` (meios de MarSec inspirados na MB atual, proxies Vermelhos, escalões de prontidão
SAR/FPE/48 h) e o runner/coleta (novas colunas e métricas).

## 5. Mecânicas essenciais (resumo; detalhe nos documentos)

- **Atribuição (0–100%):** variável epistêmica central. Agir com atribuição parcial (risco político) ×
  aguardar (risco operacional).
- **Escada de escalada N0→N3** (Rotina, Tensão, Crise, Conflito), ROE por nível; N3 aciona a salva.
- **Turnos de 24 h**, campanha de 30–60 dias. Fuel Points preservados na forma, recalibrados.
- **Prontidão:** Navio SAR (1/estação, imediato); Força de Pronto Emprego (2/DN, 3/Esquadra, ≤24 h);
  demais unidades só iniciam movimento 48 h após o acionamento.
- **Apoio externo via COMPAAz:** patrulha marítima (FAB, com prazo) e interagências (PF, RF, IBAMA,
  CENSIPAM, inteligência internacional) — bônus de efetividade condicionado à atribuição do órgão.
- **Dimensão informacional:** apoio público modula custo político e ROE; campanhas são ações próprias.

## 6. Fatores e dados (Desenho Experimental)

- **Fatores (2⁵):** A_MPA, B_NPaOc, C_Fusão, D_USV, E_GVI. Vetor de custo EAC base 100 (placeholder).
- **Métricas:** E1_atrib, E2_infra, E3_escalada, E4_custopol, E5_ordem, E6_dispersao, sloc_idx, atrito_terminal.
- **Tratamento controlado:** `apoio_externo` (disponível/indisponível); modalidade de C2 fixa em `unico` na pesquisa.
- **Desenhos:** ablação (6×50 = 300) + fatorial 2⁵ (32×20 = 640) = 940; **contraste de apoio** (C0 × apoio, 2×50 = 100). **Total 1.040**.
- **Dataset:** colunas da Tabela 6.1 do Desenho Experimental (inclui apoio_externo, mpa_*, apoio_*, E5/E6).

## 7. Plano de fases (gates)

| Fase | Entrega | Validação |
|---|---|---|
| SM-1 | `encounter.ts` + mecânica de atribuição | Determinismo; limites (encontro nulo ⇒ sem efeito; atribuição plena ⇒ resposta máxima). |
| SM-2 | Máquina de escalada + ROE por nível | Transições reproduzíveis; N3 aciona a salva sem alterar sua física. |
| SM-3 | `constab.ts` (ocorrências) + dupla função | Incidência por área reproduzível; acoplamento com o híbrido. |
| SM-4 | `c2.ts`: 6 estações, barramento, modalidades, despacho de apoios | Troca de modalidade sem alterar regras; papéis isolados; apoio respeita atribuição e prazo. |
| SM-5 | `campaign.ts`: configurador, dificuldade (3 níveis), crises, boletim, Célula Branca | Setup reproduzível; dificuldade altera névoa, não física; crises disparam. |
| SM-6 | OOB estendido, interruptores de fator, prontidão (SAR/FPE/48 h) | Fator altera só as unidades previstas; prazos em turnos. |
| SM-7 | `infocog.ts` (apoio público, desinformação × campanhas) | Apoio público move custo político e ROE; campanhas como ações próprias. |
| SM-8 | Runner e coleta com o novo esquema de dados | Dataset importável em Jamovi/R; lote de 1.040 completa. |
| SM-9 | UI interativa (modos único, 1×1 e EM) reusando o motor | Verificação funcional com o demonstrador. |
| SM-10 | Validação de face e análise de sensibilidade | Revisão por especialistas; sensibilidade a fusão/atribuição/custos. |

## 8. Entregáveis de cada fase

Código + testes (determinismo e limites) + nota curta do que foi feito e como validar. Não marcar uma
fase como concluída com testes falhando ou implementação parcial. Parâmetros numéricos (custos, prazos,
incidências, pesos) são **placeholders de projeto** — deixe-os centralizados e configuráveis, com
`// TODO: validar com especialista`.

## 9. Primeira resposta esperada do Code

1. Confirmação de que leu as convenções do repo e rodou o baseline de testes (resultado).
2. Um mapa do que será reusado × estendido × criado.
3. O **plano da Fase SM-1** (arquivos, assinaturas, testes) para aprovação — **sem** ainda implementar.
