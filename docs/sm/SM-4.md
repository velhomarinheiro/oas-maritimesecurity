# SM-4 — Comando e controle: estações, barramento, modalidades e apoios

**Estado:** concluída · **Especificação:** Conceito v1.6 §7 (Tabelas 7.1 e 7.2), §8.7 (Tabela 8.3), §10.4; Desenho Experimental v1.3 §2.2, §2.3, §5.2, §6 e §8.

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Blocos novos: `ESTACOES` (com os papéis de cada estação), `MODALIDADES`, `FONTES` (Tabela 8.3), `TETO_FUSAO_SEM_C`, `APOIOS` (Tabela 7.2, com prazo, duração, disponibilidade, pertinência e efeito) e `SAL_APOIO`. Todos são placeholders `// TODO: validar com especialista`. |
| `shared/sm/c2.js` | Estações e papéis (`estacao`, `estacaoDaArea`, `temPapel`); modalidades (`criarC2`, `estacoesDe`); a regra única de decisão (`autorizarDecisao`, `exigirDecisao`); o adaptador da escada (`decisorEscalada`); a fusão e o quadro operacional comum (`qualidadeFusao`, `criarBarramento`, `publicar`, `quadroComum`, `vistaDaEstacao`). |
| `shared/sm/apoio.js` | Despacho de apoios pelo COMPAAz: `criarEstadoApoio`, `solicitar`, `vigentes`, `modificadores`, `aplicar`, `usarApoios`. |
| `scripts/test_sm_c2.js` | 60 verificações, incluídas no `npm test`. |

A especificação põe o despacho de apoios dentro de `c2.ts`. Aqui ele ficou num arquivo próprio, `apoio.js`, para separar o que não tem sorteio (C2) do que tem (concessão de apoios).

## Regras implementadas

- **Estações e papéis (Tabela 7.1):**
  - COMPAAz: autorizar a escalada, priorizar o esforço, alocar ISR e NPaOc, pedir MPA e apoios.
  - ComemCh: propor a escalada, empregar a Esquadra, engajar em N3.
  - Distritos Navais: responder a ocorrências e empregar os meios da sua área.
  - Nenhuma estação toma decisão de outra.
- **Modalidades (§7.3):**
  - `unico`: um controlador para as seis estações; o Vermelho é o motor.
  - `1x1`: um jogador Azul e um Vermelho.
  - `distribuido`: seis usuários distintos; o Vermelho é o motor ou a Célula Branca.

  Só muda o mapa estação → controlador. Toda decisão passa por `autorizarDecisao`, que confere duas coisas: se quem decide controla a estação e se a estação tem o papel. É a mesma regra nas três modalidades.
- **Escalada:** `decisorEscalada(c2, politica)` liga a escada da SM-2 ao controlador do COMPAAz. A proposta é conduzida pelo ComemCh e só a decisão do COMPAAz a aplica.
- **Fusão (§7.2, §8.7):**
  - A qualidade da fusão é a soma dos pesos das fontes ligadas (AIS, PREPS, radar costeiro, unidades em patrulha, satélite, inteligência). Sem o fator C_Fusão ela fica limitada a 0,55; os apoios de MPA e CENSIPAM somam bônus. É esse número que entra no motor de encontro, afetando detecção, identificação e o ganho de atribuição.
  - O barramento guarda reportes por fonte e por estação. O quadro comum agrega cada contato e respeita a latência de cada fonte. A confiança combinada é o OU ruidoso das confiabilidades das fontes, e `redundante` marca o contato visto por mais de uma fonte.
  - Todas as estações veem o mesmo quadro, em qualquer modalidade.
- **Apoio externo (§7.4; Desenho §2.3):**
  - Só o controlador do COMPAAz pede apoio (papéis `solicitar_mpa` e `solicitar_apoio`).
  - Cada pedido vale para uma área. O sorteio de disponibilidade usa uma sub-sequência própria da semente. O apoio entra em vigor após o prazo e dura N turnos.
  - Concedido, atua só sobre a ação pertinente à atribuição do órgão:
    - PF: narcotráfico;
    - Receita Federal: contrabando;
    - IBAMA: pesca e crime ambiental;
    - CENSIPAM e MPA: detecção em qualquer ação;
    - inteligência internacional: só contatos do híbrido, acelerando a atribuição.
  - Com `apoioExterno = 0` nenhum pedido é concedido e nenhum sorteio é consumido. Sem aviação de patrulha na OOB (fator A_MPA, SM-6), a MPA não é ativada.
  - `usarApoios` aplica os moduladores ao encontro e registra as colunas da Tabela 6.1: `mpa_solicitada`, `mpa_atendida`, `apoio_pf`, `apoio_rf`, `apoio_ibama`, `apoio_censipam`, `apoio_intl`, `n_apoios_concedidos` e `efeito_apoio`. Esta última é o ganho na probabilidade de chegar à etapa-alvo.
- **Ajuste na SM-3:** a pertinência dos órgãos saiu de `TIPOS_OCORRENCIA` e ficou só em `APOIOS`, para haver uma única fonte. Pela Tabela 7.2, pirataria e imigração não têm órgão pertinente.

## Como validar

```bash
node scripts/test_sm_c2.js   # só a SM-4
npm test                     # tudo
```

O teste verifica:

- **Estações:** as seis da Tabela 7.1, com papéis exclusivos.
- **Modalidades:** configurações válidas e recusadas.
- **Papéis isolados:** um DN não decide pelo outro; o ComemCh não autoriza a escalada; o COMPAAz não responde a ocorrência.
- **Escalada:** a decisão vem do controlador do COMPAAz.
- **Fusão:** monotonicidade, teto sem C_Fusão, latência, fontes desligadas, redundância e quadro igual para todas as estações.
- **Apoios:**
  - pedido só pelo COMPAAz;
  - `apoio_externo = 0` sem concessão;
  - sem MPA na OOB;
  - taxa de atendimento ≈ disponibilidade em 4.000 pedidos;
  - prazo, duração e área;
  - pertinência por órgão;
  - ganho e contadores;
  - reprodutibilidade.
- **Mini-campanha integrada (SM-1 a SM-4):** ocorrências, respostas dos DN com apoios do COMPAAz e escada, rodada nas três modalidades. O resultado é idêntico em `unico`, `1x1` e `distribuido`. O contraste `apoio_externo = 0` não concede nenhum apoio e mantém as mesmas ocorrências geradas (sementes espelhadas).

## Ganchos para as próximas fases

- **SM-5:** o configurador escolhe a modalidade e as fontes ligadas. A Célula Branca entra como controlador Vermelho no distribuído.
- **SM-6:** o fator C_Fusão liga `cFusao`, o A_MPA liga `mpaOrganica` e o B_NPaOc dá os navios que o COMPAAz aloca (`alocar_npaoc`).
- **SM-8:** o runner lê `apoio.contadores` para as colunas do dataset.
