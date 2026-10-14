# SM-3 — Gerador constabular e dupla função

**Estado:** concluída · **Especificação:** Conceito v1.6 §3, §4.2, §5 (Tabela 5.1), §7.1; Desenho Experimental v1.3 §4 (E5, E6), §5.2 e §8.

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Bloco novo com as áreas de DN (`AREAS_DN`), a distância máxima da costa (`DIST_MAX_COSTA`, ≈ ZEE), os seis tipos de ocorrência (`TIPOS_OCORRENCIA`), `TETO_CONSTABULAR`, `ACOPLAMENTO` e os sais das sub-sequências. Todos são placeholders `// TODO: validar com especialista`. |
| `shared/sm/constab.js` | `criarEstadoConstab`, `avancarTurno`, `registrarResposta`, `vistaDoJogador` e `metricas`, além dos auxiliares `areaDoHex`, `hexesDaArea` e `poisson`. |
| `scripts/test_sm_constab.js` | 36 verificações, incluídas no `npm test`. |

## Regras implementadas

- **Áreas:** são faixas de linhas da grade 28×20, de norte a sul:
  - 2º DN: linhas 1–6;
  - 1º DN: linhas 7–10;
  - 8º DN: linhas 11–12;
  - 5º DN: linhas 13–20.

  As ocorrências só surgem em hexágonos de mar a até 3 hexágonos da costa (≈ 200 mn).
- **Incidência:** cada combinação área × tipo sorteia uma Poisson(λ) por turno de 24 h. Cada tipo tem os terrenos onde pode surgir, um prazo em turnos (sem resposta, a ocorrência escapa), a evasão do contato no motor de encontro, a etapa que conta como repressão e o órgão interagências pertinente, este último para a SM-4.
- **Autoridade constabular:** a repressão é aplicação da lei e não escalada. Seu teto no motor de encontro é o apresamento em qualquer nível. A ROE N0–N3 da SM-2 vale para os contatos do híbrido, de modo que tratar uma cobertura como crime comum é legítimo — e é aí que mora o dilema da triagem.
- **Dupla função (§5.2):**
  - **Cobertura:** com probabilidade `pCoberturaMax × intensidade`, uma ocorrência de rotina encobre a trilha de defesa. Quando um encontro com ela chega à inspeção, `registrarResposta` devolve um evento `incidente_hibrido`, no formato que a escada de escalada (SM-2) consome.
  - **Saturação:** quando há intensidade híbrida, o híbrido provoca ocorrências extras, de tipos exploráveis, nas áreas ativas fora do seu alvo — o "flanco oposto" de §4.2.
  - **Triagem:** as duas marcas ficam ocultas, e `vistaDoJogador` as remove.
- **Métricas:**
  - `E5_ordem` = reprimidas / geradas;
  - `E6_dispersao` = esforço Azul em ocorrências instrumentalizadas / esforço constabular total, contado em unidade-resposta efetiva;
  - também saem as colunas `n_ocorr_crim` e `ocorr_reprimidas` da Tabela 6.1.
- **Determinismo e blocagem:** a semente da campanha gera duas sub-sequências independentes. A de rotina não depende do acoplamento nem das ações Azuis, então a mesma semente produz as mesmas ocorrências de rotina em qualquer condição experimental. A de saturação só é consumida quando há intensidade. Os IDs (`OC-…` para rotina, `OS-…` para saturação) também não dependem uma da outra. O estado guarda os contadores dos geradores e é imutável.

## Como validar

```bash
node scripts/test_sm_constab.js   # só a SM-3
npm test                          # tudo
```

O teste verifica:

- **Geografia:** cobertura das 20 linhas pelas áreas, só mar, a até 3 hexágonos da costa.
- **Reprodutibilidade e blocagem:** mesma semente ⇒ mesmas ocorrências, e a rotina é a mesma com ou sem acoplamento.
- **Incidência:** a observada bate com λ em 2.000 turnos, a menos de 4 desvios-padrão, por área × tipo.
- **Configurador:** só as áreas e os tipos ativos geram ocorrências.
- **Ciclo de vida:** prazo de cada ocorrência e escape sem resposta.
- **Repressão:** a ocorrência é reprimida se e só se o encontro (SM-1) chega à etapa de repressão do tipo.
- **Acoplamento:** saturação só no flanco oposto e crescente com a intensidade; a inspeção de uma cobertura gera evento híbrido que leva a escada a N1, e a rotina nunca gera esse evento.
- **Métricas:** cálculo de E5 e E6.

## Ganchos para as próximas fases

- **SM-4:** `TIPOS_OCORRENCIA[tipo].orgao` liga cada ocorrência ao apoio interagências pertinente (PF, RF, IBAMA). A área (`area` → `AREAS_DN[].estacao`) define qual Distrito Naval lidera a resposta.
- **SM-5:** o configurador passa `areasAtivas` e `tiposAtivos`. O episódio de crise "pesca ilegal em massa" pode usar a mesma geração com λ elevado.
- **Pendente:** a intensidade e a área-alvo do híbrido virão do agente Vermelho, ou do jogador no modo 1×1.
