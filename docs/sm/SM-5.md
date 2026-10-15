# SM-5 — Configurador, dificuldade, crises, boletim e Célula Branca

**Estado:** concluída · **Especificação:** Conceito v1.6 §8.1–8.5 (Tabelas 8.1 e 8.2), Tabela 4.1 e §9.5; Desenho Experimental v1.3 §5.2.

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Blocos novos, todos placeholders `// TODO: validar com especialista`: `DURACAO_DIAS` (30–60, padrão 45), `VETORES_HIBRIDOS` (Tabela 4.1, com negabilidade), `FATORES_SM`, `DIFICULDADES` (Tabela 8.1), `CRISES` (Tabela 8.2, com marcos e efeito), `N_CRISES`, `SAL_CRISES` e `AJUSTAVEIS_CELULA_BRANCA`. |
| `shared/sm/campaign.js` | Funções por bloco: <ul><li>configurador: `configurarCampanha`, `iniciarCampanha`;</li><li>crises: `agendarCrises`, `avancarCrises`, `registrarDeteccaoCrise`, `registrarRespostaCrise`, `notaMarco`, `efeitosDaCrise`;</li><li>névoa: `ritmoDeEvidencia`, `registrarPadrao`, `revelarContato`, `vistaHibrida`;</li><li>boletim: `gerarBoletim`;</li><li>Célula Branca: `intervir`, `consumirInjetados`.</li></ul> |
| `scripts/test_sm_campaign.js` | 71 verificações, incluídas no `npm test`. |

## Regras implementadas

### Configurador (§8.1)

O configurador valida e completa os campos abaixo:

- áreas ativas;
- trilhas ligadas (defesa e/ou constabular), com os vetores híbridos e os tipos de ocorrência de cada uma;
- nível inicial N0–N3;
- fatores A_MPA … E_GVI (±1);
- força inicial de plataformas e portos (fração do SP);
- dificuldade;
- modalidade e controladores;
- Célula Branca (não existe no jogador único, onde o motor exerce a função);
- duração de 30 a 60 dias;
- `apoio_externo`;
- intensidade e área-alvo do híbrido (sorteada pela semente se omitida);
- fontes ligadas;
- "mostrar os números".

`iniciarCampanha` monta, a partir dele, os estados de C2, da escada, do gerador constabular (só se a trilha estiver ligada), do apoio (a MPA só existe se A_MPA = +1) e das crises.

### Dificuldade como névoa (§8.2)

| Nível | Ritmo de evidência | Intenção visível a partir de | Meios do híbrido | Adaptação |
|---|---|---|---|---|
| Básico | ×1,5 | 0% | visíveis | — |
| Intermediário | ×1,0 | 40% (parcial) | visíveis | — |
| Avançado | ×0,6 | 70% (robusta) | ocultos até um encontro | resposta repetida: ×0,85ⁿ, com piso de 0,4 |

A dificuldade só entra pelo `ritmo` do encontro e pela `vistaHibrida`. As probabilidades, os sorteios, as incidências e o setup são idênticos entre os níveis.

### Crises (§8.3)

- **Jogador único:** a semente sorteia 2 ou 3 crises de tipos distintos, em janelas sucessivas da campanha (do 4º dia até 3 dias antes do fim), cada uma numa área ativa.
- **Com Célula Branca:** nada é sorteado; ela injeta as crises.
- **Disparo:** a crise dispara no turno de início e traz o efeito do tipo. Os efeitos são ocorrências extras (crimes, pesca em massa), um evento híbrido de dano (sabotagem), pessoas a salvar (SAR) e escala de desastre. O runner os aplica na SM-8.
- **Marcos:** Detecção e Resposta, ambos contados a partir do início. A nota é 1 até o prazo ideal, cai linearmente até 0 no prazo máximo, e uma resposta inadequada vale 0. Sem resposta até o prazo máximo, a crise se encerra com nota 0.

### Boletim (§8.4)

O boletim traz:

- postura (N0–N3);
- ações com a chance de cada etapa em palavras ("quase certo", "provável", "arriscado", "remoto") ou, com o interruptor, também em número;
- variação de atribuição;
- ordem marítima;
- crises em curso;
- prévia do próximo evento: concreta no básico, "indefinido" nos demais.

Sai como dados estruturados e como linhas de texto.

### Célula Branca (§8.5)

A Célula Branca pode:

- injetar crise, evento híbrido ou ocorrência;
- ajustar `intensidadeHibrida`, `areaAlvoHibrida`, `mostrarNumeros` ou `dificuldade` (cada ajuste revalida a configuração);
- transferir uma área a outro Distrito Naval;
- anular um lance.

Toda intervenção exige justificativa e fica registrada com turno e ator. Com Célula Branca configurada, só ela intervém; sem ela, o motor exerce as funções.

## Como validar

```bash
node scripts/test_sm_campaign.js   # só a SM-5
npm test                           # tudo
```

O teste verifica:

- **Configurador:** padrões, 13 configurações inválidas recusadas e setup reproduzível.
- **Névoa, não física:** mesmos setup, probabilidades, sorteios, etapas e ocorrências nos três níveis; só a atribuição muda. Também a intenção por nível, a ocultação até o contato e a adaptação com piso.
- **Crises:**
  - 2–3 por campanha, de tipos distintos e em janelas sucessivas;
  - todo o repertório aparece em 300 sementes;
  - sem sabotagem quando a trilha de defesa está desligada;
  - disparo no turno exato;
  - notas dos marcos e encerramento no prazo.
- **Boletim:** palavras × números, prévia por dificuldade.
- **Célula Branca:** cada tipo de intervenção, as recusas e o registro.

## Ganchos para as próximas fases

- **SM-6:** `config.fatores` e `config.forcaInicial` alimentam a OOB estendida; os escalões de prontidão entram ao lado.
- **SM-7:** o boletim ganha VP, apoio público e custo político.
- **SM-8:** o runner faz o laço do turno:
  1. `avancarCrises`;
  2. `consumirInjetados`;
  3. `constab.avancarTurno`;
  4. decisões das estações;
  5. `escalation.avancarTurno`;
  6. `gerarBoletim`.

  As notas dos marcos de crise viram colunas do dataset, se o Desenho as pedir.
