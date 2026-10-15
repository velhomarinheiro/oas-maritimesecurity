# Pacote OAS-SM — Variante de Segurança Marítima

Conjunto de arquivos para iniciar a adaptação do jogo **Operação Atlântico Sul (OAS)** à variante de
**Segurança Marítima (OAS-SM)** no Claude Code, conectado ao repositório do projeto.

## Conteúdo

| Arquivo | O que é |
|---|---|
| `PROMPT_INICIAL_OAS-SM.md` | **Prompt de partida.** Cole como a primeira mensagem na sessão do Code conectada ao repositório. Anexe os dois `.docx` junto. |
| `OAS-SM_Conceito_e_Regras_v1.6.docx` | Documento de Conceito Operacional e Regras (especificação do jogo). |
| `OAS-SM_Desenho_Experimental_v1.3.docx` | Desenho Experimental e Esquema de Dados (fatores, métricas, desenhos, dataset). |
| `figuras/c2_arquitetura.png` | Diagrama da arquitetura de Comando e Controle (Força Azul). |
| `figuras/carta_oas_sm.png` | Carta OAS-MAP-001, Ed. 2.0 — teatro de operações. |

## Como usar

1. Abra uma sessão do Claude Code **conectada ao repositório** do projeto OAS.
2. Cole o conteúdo de `PROMPT_INICIAL_OAS-SM.md` como primeira mensagem e **anexe** os dois `.docx`.
3. O Code deve: ler as convenções do repo, rodar o baseline de testes, apresentar o mapa
   reuso × extensão × novos módulos e o **plano da Fase SM-1** para sua aprovação — antes de implementar.
4. Avance **uma fase por vez** (SM-1 … SM-10), cada uma com testes verdes antes da seguinte.

## Resumo da variante (referência rápida)

- **Trilhas:** defesa (ator híbrido) + constabular (criminalidade difusa) + dimensão informacional/cognitiva (transversal).
- **C2:** seis estações — COMPAAz (ápice), ComemCh, 1º/2º/5º/8º DN — com barramento de fusão.
- **Modos:** jogador único (padrão de pesquisa), confronto 1×1 (Azul × Vermelho), estações distribuídas (EM).
- **Mecânica central:** detecção → atribuição → resposta graduada; escada N0–N3; salva reusada em N3.
- **Dados:** fatores 2⁵ (A_MPA, B_NPaOc, C_Fusão, D_USV, E_GVI); 1.040 partidas (940 principais + 100 do contraste de apoio).

> Parâmetros numéricos nos documentos são *placeholders* de projeto, a validar por especialistas.

**Versões:** Conceito v1.6 · Desenho Experimental v1.3 · Pacote gerado em 2026-10-14.
