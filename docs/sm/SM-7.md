# SM-7 — Dimensão informacional e cognitiva

**Estado:** concluída · **Especificação:** Conceito v1.6 §6 (Tabela 6.1), §11.3 e §4.1 (lawfare); Desenho Experimental v1.3 §4 (E4_custopol).

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Bloco `INFOCOG`: apoio inicial e de referência, retorno, faixas de largura da ROE, composição e modulação do custo político, teto, eventos no mar, desinformação, catálogo de campanhas, capacidade e prazo. Tudo é placeholder `// TODO: validar com especialista`. O COMPAAz ganha o papel `campanha_informacional`. |
| `shared/sm/infocog.js` | Estado: `criarEstadoInfocog`. Apoio e ROE: `multiplicadorCusto`, `larguraRoe`, `roeEfetiva`. Ações e campanhas: `registrarAcaoAzul`, `registrarEventoMar`, `lancarDesinformacao`, `lancarCampanha`, `eficaciaCampanha`. Fechamento: `avancarTurno`, `metricas`. |
| `shared/sm/campaign.js` | A campanha nasce com `infocog`. O boletim passa a mostrar o apoio público, o custo político (com o teto) e se a ROE está estreitada, normal ou ampliada. |
| `scripts/test_sm_infocog.js` | 49 verificações, incluídas no `npm test`. |

## Regras implementadas

### Apoio público (0–100)

- Começa em 60 e tende à referência (5% da distância por turno).
- Move-se com os eventos no mar:

  | Evento | Pontos |
  |---|---|
  | repressão | +0,5 |
  | SAR com êxito | +3 |
  | SAR fracassado | −4 |
  | dano à infraestrutura | −2 |
  | incidente não respondido | −1 |
  | danos a terceiros | −5 |

- Também se move com o custo político (−3 pontos por unidade) e com as campanhas de cada lado.

### Custo político (§11.3)

- **Composição:** risco por atribuição frágil (SM-1) + 2 × níveis de excesso de força sobre a ROE (SM-2) + 3 × danos a terceiros.
- **Modulação pelo apoio:** multiplicador `1 + 0,5 × (60 − apoio)/60`. Com apoio baixo a mesma ação custa mais; com apoio alto, menos.
- **Gatilho:** a ação frágil vira gatilho explorável pela desinformação.
- **Derrota estratégica:** custo acumulado acima do teto (25) é derrota estratégica Azul (`derrota_estrategica`), mesmo com a infraestrutura intacta.
- **Métrica:** `E4_custopol` = custo acumulado.

### Largura da ROE (§6.3)

- **Apoio abaixo de 30:** a ROE efetiva perde um degrau, ficando com as respostas e o teto do nível anterior.
- **Apoio a partir de 75:** a ROE ganha um degrau, com as respostas do nível seguinte, mas nunca o emprego de força fora de N3.
- **Em N3:** o emprego de força permanece mesmo com apoio baixo.

### Desinformação Vermelha (§6.1)

- Decidida só pelo controlador Vermelho: o motor, o jogador no 1×1 ou a Célula Branca.
- Derruba o apoio em 6 × intensidade.
- Sobre um incidente real ainda não esclarecido, o efeito é ×1,5; sem gatilho, conta como fabricação.

### Campanhas Azuis (§6.2)

| Campanha | Efeito |
|---|---|
| Comunicação estratégica | +3 de apoio |
| Transparência | +2 de apoio; esclarece um gatilho |
| Prova documentada | +6 × atribuição/100; exige prova; esclarece um gatilho |
| Prebunking | metade do efeito da desinformação por 3 turnos |

- **São ações próprias** do COMPAAz: uma por turno, com efeito no turno seguinte.
- **Eficácia:** × (0,5 + 0,5 × fusão).
- **Assimetria de legitimidade:** Azul não dispõe de desinformação; o catálogo não a tem.

### Determinismo

Os efeitos não usam sorteio, e o estado é imutável.

## Como validar

```bash
node scripts/test_sm_infocog.js   # só a SM-7
npm test                          # tudo
```

O teste verifica:

- **Apoio × custo:** a mesma ação custa mais com apoio baixo e menos com alto; custo zero para ação autorizada e fundamentada; excesso de força; danos a terceiros; derrota estratégica no teto.
- **Apoio × ROE:** estreitada e ampliada nos limites; o emprego de força nunca é ampliado; em N3 ele permanece; a desinformação estreita a ROE e encarece a ação, encadeadas.
- **Eventos no mar** e limites de 0–100.
- **Desinformação:** só Vermelho; real > fabricada; proporcional à intensidade.
- **Campanhas:** só COMPAAz; uma por turno; prazo; efeito da fusão e da prova; prebunking com duração; transparência esclarecendo o gatilho.
- **Dinâmica:** retorno à referência, determinismo, imutabilidade e linha no boletim.

## Ganchos para a SM-8

O runner deve:

- chamar `registrarAcaoAzul` após cada encontro, com a etapa tentada, a atribuição ao decidir, o nível e a ação;
- usar `roeEfetiva(nivel, apoio).tetoRoe` como teto do encontro para os contatos do híbrido (a autoridade constabular segue com o seu teto próprio);
- levar ao `registrarEventoMar` as repressões (SM-3), os resultados de SAR e de dano das crises (SM-5);
- fazer o agente Vermelho decidir a desinformação sobre os gatilhos abertos;
- gravar `E4_custopol` no dataset.
