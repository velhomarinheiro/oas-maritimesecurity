# SM-6 — OOB estendida, interruptores de fator e prontidão

**Estado:** concluída · **Especificação:** Conceito v1.6 §10 (Tabelas 10.1–10.4) e §10.6; Desenho Experimental v1.3 §2 e §8.

## O que foi feito

| Arquivo | Conteúdo |
|---|---|
| `shared/sm/params.js` | Tipos de MarSec no motor de encontro (`inspecao_naval`, `mcm`, `usv`, `uav`, `rov`), `PRONTIDAO` (Tabela 10.4) e `FATOR_SEM_GVI`. Todos são placeholders `// TODO: validar com especialista`. |
| `shared/sm/oob_sm.js` | Dados: `MEIOS_AZUIS`, `PROXIES_VERMELHOS`, `INFRA`, `BASES`. Funções: `montarOOB`, `aplicarFatores`, `alocarNPaOc`, `cFusaoAtiva`, `unidadeParaEncontro`, `designarProntidao`, `criarEstadoProntidao`, `acionar`, `podeMover`, `podeMoverAPartirDe`. |
| `scripts/test_sm_oob.js` | 52 verificações, incluídas no `npm test`. |

A OOB do jogo base (`shared/order_of_battle.js`) não foi alterada: ela continua sendo a do wargame e a da escalada terminal N3.

## Regras implementadas

### Meios Azuis (Tabelas 10.1 e 10.2)

Classes em serviço na MB, abstraídas:

- **Esquadra (ComemCh):**
  - Fragatas Niterói e Tamandaré, Corveta Barroso;
  - Submarinos Tikuna e Riachuelo;
  - NAM Atlântico e NDM Bahia;
  - NT Gastão Motta e rebocador Triunfo.
- **Cada Distrito Naval:**
  - NPa (Grajaú, Macaé ou Bracuí) e um aviso de inspeção naval;
  - o 1º DN tem ainda MCM: 2 Varredores Aratu e o Caça-Minas Amorim do Valle.
- **NPaOc Classe Amazonas (P120–P122):** ficam no conjunto do COMPAAz. `alocarNPaOc` os distribui às áreas ativas pela ordem de prioridade, e o NPaOc passa a responder ao DN e a partir da base dele. Com o padrão, o 5º DN fica sem NPaOc, o que corresponde à "alocação sazonal" da tabela. Excedentes ficam com o COMPAAz.

Quantitativos e cascos são de projeto (§10.1).

### Fatores (Tabela 10.3)

Cada meio tem no máximo um fator, e desligar o fator retira exatamente os meios marcados com ele.

| Fator | Meios marcados |
|---|---|
| A_MPA | P-3AM ×2, ativados via FAB pelo COMPAAz |
| B_NPaOc | NPaOc e NPa |
| C_Fusão | o centro de fusão SisGAAz; com ele, `cFusaoAtiva` liga o `cFusao` do barramento (SM-4) |
| D_USV | USV, UAV e ROV |
| E_GVI | um grupamento de Fuzileiros embarcado por estação; sem ele, a capacidade de abordagem dos navios da estação no encontro cai a `FATOR_SEM_GVI` (0,5) |

Esquadra, inspeção naval e MCM não têm fator.

### Vermelho (§10.6)

- **Proxies negáveis:** frota-sombra, milícia, sabotagem, USV/UAV, GNSS, ciber e minagem, um conjunto por vetor ativo no configurador.
- **Reserva estratégica:** é a força Vermelha do jogo base, com o KCV Aurelius Magnus e os submarinos, referenciada pelos IDs e empregável só em N3.

### Infraestrutura crítica

- As cinco FPSOs (PLT-01 a 05) e os portos principais nos hexágonos da carta.
- Cabos e dutos como traçados abstratos.
- A força inicial do configurador escala o SP das plataformas e dos portos.

### Prontidão (Tabela 10.4)

- **Designação por estação:** um Navio SAR (o primeiro apto, por prioridade) e a FPE (2 por DN, 3 na Esquadra). O resto fica em "demais".
- **Prazos após o acionamento**, em turnos de 24 h: SAR move no mesmo turno, FPE no seguinte (≤ 24 h), demais dois turnos depois (48 h).
- **Fora dos escalões:** aeronaves (a MPA segue o prazo da FAB, SM-4), sistemas não tripulados, GptFN e o centro de fusão.
- **Redesignação:** a designação é derivada da OOB. Desligar um fator não muda os meios restantes, só redistribui os escalões entre eles. Os avisos de inspeção também são aptos a SAR, para que um DN sem B_NPaOc ainda tenha Navio SAR.

## Como validar

```bash
node scripts/test_sm_oob.js   # só a SM-6
npm test                      # tudo
```

O teste verifica:

- **Composição:** IDs únicos, estações válidas, cada fator com meios, navios em hexágono navegável.
- **Fatores:** para cada um, desligá-lo retira só os meios dele, e os demais ficam idênticos. Também o efeito de C_Fusão, E_GVI e A_MPA.
- **NPaOc:** alocação e prioridade.
- **Vermelho e infraestrutura:** reserva estratégica = força Vermelha base, proxies por vetor, infraestrutura e força inicial.
- **Prontidão:** 1 SAR por estação, FPE 2/DN e 3/Esquadra, prazos 0/1/2 turnos e acionamento único.

## Ganchos para as próximas fases

- **SM-7:** dano à infraestrutura (cabos, dutos, FPSOs) entra no apoio público e no VP.
- **SM-8:** o runner usa `montarOOB(config)` por condição experimental, `unidadeParaEncontro` nos encontros e `podeMover` antes de mover cada meio. Também calcula `n_capacidades` e `custo_total` (EAC 70/100/55/35/40) a partir de `config.fatores`. Na escalada a N3, ativa a reserva estratégica com o motor de salva.
- **Economia de ações e surto (§8.6):** a penalidade de prontidão do surto fica para a SM-8, junto com o orçamento de ações por estação.
