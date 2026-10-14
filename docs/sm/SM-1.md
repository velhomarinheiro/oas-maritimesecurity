# SM-1 — Motor de encontro e mecânica de atribuição

**Estado:** concluída · **Especificação:** Conceito v1.6 §9.1–9.2, §8.4; Desenho Experimental v1.3 §8.

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Todos os parâmetros numéricos da variante (probabilidades-base, peso da fusão, capacidade por tipo de unidade, ganho de evidência, negabilidade, limiares de atribuição, pesos políticos, rótulos). Cada valor é placeholder marcado com `// TODO: validar com especialista`. |
| `shared/sm/attribution.js` | `acumularEvidencia`, `classificarAtribuicao`, `respostaAutorizada`, `riscoPolitico`. Funções puras. |
| `shared/sm/encounter.js` | `resolverEncontro` (detecção → identificação → interrogação → abordagem/GVI → inspeção → apresamento), `probabilidadeEtapa`, `capacidadeUnidade`, `rotuloProbabilidade`, `formatarProbabilidade`. |
| `scripts/test_sm_encounter.js` | 45 verificações, incluídas no `npm test`. |

Nenhum arquivo do jogo base foi alterado.

## Regras implementadas

- **Probabilidade da etapa:** `P_BASE × capacidade × (piso + (1 − piso) × fusão) × (1 − evasão)`. A evasão do contato vale apenas para detecção e identificação. A capacidade vem do eixo da etapa: `sensor` nas três primeiras, `gvi` nas três últimas. Ela é lida em `unidade.capSM` ou, na falta dele, na tabela por tipo de plataforma.
- **Encadeamento:** cada etapa tentada consome um sorteio do gerador semeado. O encontro para na primeira falha e nunca passa de `min(etapaAlvo, tetoRoe)`.
- **Atribuição (0–100):** cada etapa bem-sucedida cobre uma fração da distância até 100. Essa fração é modulada pela negabilidade do vetor, pela fusão e pelo `ritmo`, que é o gancho da névoa por dificuldade da SM-5. A atribuição nunca diminui e nunca passa de 100.
- **Dilema agir × aguardar:** `respostaAutorizada` dá a etapa mais alta que a atribuição fundamenta, limitada pelo teto da ROE. Agir além disso é permitido, porque o limite rígido é a ROE. O preço é `custoPolitico`, proporcional ao déficit de atribuição. O encontro devolve `excesso` (a etapa tentada sem fundamento) e `custoPolitico`, avaliados pela atribuição que havia ao decidir agir.
- **Encontro nulo:** sem unidade, sem contato, sem etapa-alvo, ROE que não permite nenhuma etapa, unidade sem sensor ou contato com evasão total. Nesses casos o resultado é `efetivo: false` com o motivo, **nenhum sorteio é consumido** e a atribuição fica intacta.

## Como validar

```bash
node scripts/test_sm_encounter.js   # só a SM-1
npm test                            # tudo (jogo base + SM-1)
```

O teste verifica:

- determinismo: 500 encontros com a mesma semente dão o mesmo resultado, e semente diferente dá resultado diferente;
- sorteios consumidos iguais às etapas tentadas;
- encontro nulo sem efeito e sem deslocar a semente;
- atribuição plena levando ao teto da ROE para cada teto;
- monotonicidade em fusão, capacidade e atribuição;
- limites p = 0 e p = 1;
- efeito da negabilidade e do ritmo;
- faixas dos rótulos.

## Ganchos para as próximas fases

- **SM-2:** `tetoRoe` passa a vir do nível de escalada (N0–N3).
- **SM-3:** os contatos constabulares chegam ao mesmo `resolverEncontro`, com a negabilidade e a evasão próprias de cada tipo de ocorrência.
- **SM-5:** a dificuldade entra pelo `ritmo` e pela `evasao`, sem mudar a física.
- **SM-6:** o fator E_GVI altera `capSM.gvi`, e o fator C_Fusão altera a `fusao`.
