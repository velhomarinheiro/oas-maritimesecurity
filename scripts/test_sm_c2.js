'use strict';
/**
 * test_sm_c2.js — Testes da Fase SM-4 (C2: estações, barramento, modalidades
 * e despacho de apoios pelo COMPAAz).
 *
 * Critérios de aceitação cobertos (Conceito v1.6 §13; Desenho v1.3 §8):
 *   - troca de modalidade (único ↔ 1×1 ↔ distribuído) sem alterar as regras:
 *     a mesma campanha dá o mesmo resultado, só muda quem decide;
 *   - papéis isolados: nenhuma estação toma a decisão de outra;
 *   - o apoio externo respeita a atribuição do órgão e o prazo; com
 *     apoio_externo = 0 nenhum apoio é concedido.
 *
 * Uso: node scripts/test_sm_c2.js
 */

const assert = require('assert');
const { mulberry32 } = require('../shared/rng');
const { PARAMS: P } = require('../shared/sm/params');
const C2 = require('../shared/sm/c2');
const AP = require('../shared/sm/apoio');
const CO = require('../shared/sm/constab');
const ES = require('../shared/sm/escalation');
const EN = require('../shared/sm/encounter');

let pass = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('✅ ' + msg);
  pass++;
}
function eq(a, b, msg) {
  assert.deepStrictEqual(a, b, `${msg} — esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
  console.log('✅ ' + msg);
  pass++;
}
const lanca = fn => { try { fn(); return false; } catch { return true; } };

const IDS = P.ESTACOES.map(e => e.id);
const DIST = Object.fromEntries(IDS.map((id, i) => [id, `humano:${i + 1}`]));

// ─── Estações e papéis ───────────────────────────────────────────────────────
eq(IDS, ['COMPAAz', 'ComemCh', 'Com2ºDN', 'Com1ºDN', 'Com8ºDN', 'Com5ºDN'], 'as seis estações da Tabela 7.1');
eq(P.AREAS_DN.map(a => C2.estacaoDaArea(a.id)), ['Com2ºDN', 'Com1ºDN', 'Com8ºDN', 'Com5ºDN'],
   'cada área de DN tem a sua estação');
ok(P.AREAS_DN.every(a => C2.estacaoDaArea(a.id) === a.estacao), 'estação da área coincide com AREAS_DN');
{
  const papeisDe = id => new Set(C2.estacao(id).papeis);
  const exclusivos = (id, outros) => [...papeisDe(id)].every(p => outros.every(o => !papeisDe(o).has(p)));
  ok(exclusivos('COMPAAz', IDS.filter(i => i !== 'COMPAAz')), 'papéis do COMPAAz são só dele');
  ok(exclusivos('ComemCh', IDS.filter(i => i !== 'ComemCh')), 'papéis do ComemCh são só dele');
  ok(['autorizar_escalada', 'solicitar_mpa', 'solicitar_apoio'].every(p => C2.temPapel('COMPAAz', p)) &&
     C2.temPapel('ComemCh', 'propor_escalada') && !C2.temPapel('ComemCh', 'autorizar_escalada'),
     'COMPAAz autoriza a escalada e centraliza os apoios; ComemCh propõe');
}

// ─── Modalidades ─────────────────────────────────────────────────────────────
{
  const u = C2.criarC2({ modalidade: 'unico' });
  ok(IDS.every(id => u.controle[id] === 'agente:azul') && u.vermelho === 'motor',
     'único: um controlador para as seis estações; Vermelho pelo motor');
  const x = C2.criarC2({ modalidade: '1x1', controladores: { azul: 'humano:A', vermelho: 'humano:V' } });
  ok(C2.estacoesDe(x, 'humano:A').length === 6 && x.vermelho === 'humano:V', '1×1: um jogador Azul (seis estações) e um Vermelho');
  const d = C2.criarC2({ modalidade: 'distribuido', controladores: { ...DIST, vermelho: 'celula_branca' } });
  ok(IDS.every(id => C2.estacoesDe(d, d.controle[id]).length === 1) && d.vermelho === 'celula_branca',
     'distribuído: cada estação com um usuário; Vermelho pela Célula Branca');
  ok(lanca(() => C2.criarC2({ modalidade: '1x1', controladores: { azul: 'h', vermelho: 'h' } })), '1×1 com o mesmo jogador dos dois lados é recusado');
  ok(lanca(() => C2.criarC2({ modalidade: 'distribuido', controladores: { ...DIST, 'Com5ºDN': undefined } })), 'distribuído sem uma estação é recusado');
  ok(lanca(() => C2.criarC2({ modalidade: 'distribuido', controladores: { ...DIST, 'Com5ºDN': 'humano:1' } })), 'distribuído com usuário repetido é recusado');
  ok(lanca(() => C2.criarC2({ modalidade: 'distribuido', controladores: { ...DIST, vermelho: 'humano:9' } })), 'distribuído: Vermelho só motor ou Célula Branca');
  ok(lanca(() => C2.criarC2({ modalidade: 'em' })), 'modalidade desconhecida é recusada');
}

// ─── Papéis isolados ─────────────────────────────────────────────────────────
{
  const d = C2.criarC2({ modalidade: 'distribuido', controladores: DIST });
  const q = id => d.controle[id];
  eq(C2.autorizarDecisao(d, { quem: q('Com1ºDN'), estacao: 'Com1ºDN', papel: 'responder_ocorrencia' }), { ok: true },
     'o DN responde a ocorrências na própria estação');
  eq(C2.autorizarDecisao(d, { quem: q('Com1ºDN'), estacao: 'Com2ºDN', papel: 'responder_ocorrencia' }).motivo, 'nao_controla_a_estacao',
     'um DN não decide pelo outro');
  eq(C2.autorizarDecisao(d, { quem: q('ComemCh'), estacao: 'ComemCh', papel: 'autorizar_escalada' }).motivo, 'papel_de_outra_estacao',
     'o ComemCh não autoriza a escalada');
  eq(C2.autorizarDecisao(d, { quem: q('COMPAAz'), estacao: 'COMPAAz', papel: 'responder_ocorrencia' }).motivo, 'papel_de_outra_estacao',
     'o COMPAAz não responde a ocorrência no lugar do DN');
  const u = C2.criarC2({ modalidade: 'unico' });
  eq(C2.autorizarDecisao(u, { quem: 'agente:azul', estacao: 'ComemCh', papel: 'autorizar_escalada' }).motivo, 'papel_de_outra_estacao',
     'no jogador único o papel continua sendo da estação (mesma regra)');
}

// ─── Escalada decidida pelo COMPAAz ──────────────────────────────────────────
{
  const d = C2.criarC2({ modalidade: 'distribuido', controladores: DIST });
  let quemDecidiu = null;
  const nega = C2.decisorEscalada(d, (prop, quem) => { quemDecidiu = quem; return false; });
  const r = ES.avancarTurno(ES.criarEstadoEscalada(0), [{ tipo: 'ataque_armado', atribuicao: 90 }], nega);
  ok(r.estado.nivel === 0 && quemDecidiu === d.controle.COMPAAz, 'a proposta de escalada vai ao controlador do COMPAAz (que nega)');
  const r2 = ES.avancarTurno(ES.criarEstadoEscalada(0), [{ tipo: 'ataque_armado', atribuicao: 90 }], C2.decisorEscalada(d, () => true));
  ok(r2.estado.nivel === 3 && r2.transicao.autorizadaPor === 'COMPAAz', 'autorizada pelo COMPAAz, a escalada se aplica');
}

// ─── Fusão ───────────────────────────────────────────────────────────────────
{
  const todas = Object.keys(P.FONTES);
  ok(Math.abs(C2.qualidadeFusao({ fontesAtivas: todas, cFusao: true }) - 1) < 1e-9, 'todas as fontes com C_Fusão ⇒ fusão plena');
  ok(C2.qualidadeFusao({ fontesAtivas: todas, cFusao: false }) <= P.TETO_FUSAO_SEM_C + 1e-12, 'sem C_Fusão a fusão fica no teto');
  ok(C2.qualidadeFusao({ fontesAtivas: ['ais'] }) < C2.qualidadeFusao({ fontesAtivas: ['ais', 'satelite'] }), 'mais fontes ⇒ fusão melhor');
  ok(C2.qualidadeFusao({ fontesAtivas: [] }) === 0, 'sem fontes ⇒ fusão nula');
  ok(lanca(() => C2.qualidadeFusao({ fontesAtivas: ['sonar'] })), 'fonte desconhecida é recusada');
  const pobre = C2.qualidadeFusao({ fontesAtivas: ['ais'], cFusao: false });
  const rica  = C2.qualidadeFusao({ fontesAtivas: todas, cFusao: true });
  ok(EN.probabilidadeEtapa('deteccao', { type: 'patrulha_oc' }, {}, rica) > EN.probabilidadeEtapa('deteccao', { type: 'patrulha_oc' }, {}, pobre),
     'a qualidade da fusão do barramento melhora a detecção no encontro');
}
{
  let bus = C2.criarBarramento();
  bus = C2.publicar(bus, { turno: 1, estacao: 'Com1ºDN', fonte: 'radar',    contatoId: 'K1', col: 10, row: 8 });
  bus = C2.publicar(bus, { turno: 1, estacao: 'COMPAAz', fonte: 'satelite', contatoId: 'K1', col: 10, row: 8 });
  bus = C2.publicar(bus, { turno: 1, estacao: 'Com8ºDN', fonte: 'ais',      contatoId: 'K2', col: 7,  row: 10 });
  const t1 = C2.quadroComum(bus, 1), t2 = C2.quadroComum(bus, 2);
  ok(t1.find(c => c.contatoId === 'K1').fontes.join() === 'radar' && t2.find(c => c.contatoId === 'K1').fontes.join() === 'radar,satelite',
     'o reporte de satélite só entra no quadro depois da latência');
  const k1 = t2.find(c => c.contatoId === 'K1');
  ok(k1.redundante && k1.confianca > P.FONTES.radar.confiabilidade, 'duas fontes ⇒ contato redundante, com confiança maior');
  ok(!C2.quadroComum(bus, 2, { fontesAtivas: ['radar', 'satelite'] }).some(c => c.contatoId === 'K2'), 'fonte desligada não alimenta o quadro');
  const vistas = IDS.map(id => JSON.stringify(C2.vistaDaEstacao(bus, id, 2)));
  ok(vistas.every(v => v === vistas[0]), 'todas as estações veem o mesmo quadro operacional comum');
  ok(lanca(() => C2.publicar(bus, { turno: 1, estacao: 'Com3ºDN', fonte: 'ais', contatoId: 'K3', col: 1, row: 1 })), 'reporte de estação inexistente é recusado');
}

// ─── Apoio externo ───────────────────────────────────────────────────────────
const UNICO = C2.criarC2({ modalidade: 'unico' });
const pedir = (e, apoio, area, turno, c2 = UNICO, quem = 'agente:azul') => AP.solicitar(e, c2, { quem, apoio, area, turno });
{
  const d = C2.criarC2({ modalidade: 'distribuido', controladores: DIST });
  const e0 = AP.criarEstadoApoio({ seed: 1 });
  const r = pedir(e0, 'pf', '1DN', 1, d, d.controle['Com1ºDN']);
  ok(r.pedido === null && r.motivo === 'nao_controla_a_estacao' && r.estado === e0, 'só o COMPAAz pede apoio (DN recusado, sem sortear)');
  const r2 = pedir(e0, 'pf', '1DN', 1, d, d.controle.COMPAAz);
  ok(r2.pedido !== null, 'o controlador do COMPAAz pede apoio');
}
{
  let e = AP.criarEstadoApoio({ seed: 5, apoioExterno: 0 });
  const rngAntes = e.rng;
  for (let t = 1; t <= 20; t++) for (const a of Object.keys(P.APOIOS)) e = pedir(e, a, '8DN', t).estado;
  ok(e.contadores.n_apoios_concedidos === 0 && e.pedidos.length === 0 && e.rng === rngAntes, 'apoio_externo = 0 ⇒ nenhum apoio concedido');
  ok(e.contadores.mpa_solicitada === 20 && e.contadores.mpa_atendida === 0, 'pedidos de MPA são contados mesmo sem atendimento');
  const semMpa = pedir(AP.criarEstadoApoio({ seed: 5, mpaOrganica: false }), 'mpa', '8DN', 1);
  ok(semMpa.pedido === null && semMpa.motivo === 'sem_mpa_na_oob', 'sem aviação de patrulha na OOB (A_MPA) não há MPA a ativar');
}
{
  let e = AP.criarEstadoApoio({ seed: 77 });
  const N = 4000;
  for (let t = 0; t < N; t++) e = pedir(e, 'intl', '1DN', t).estado;
  const taxa = e.pedidos.filter(p => p.concedido).length / N;
  const disp = P.APOIOS.intl.disponibilidade;
  ok(Math.abs(taxa - disp) < 4 * Math.sqrt(disp * (1 - disp) / N), `taxa de atendimento ≈ disponibilidade (${taxa.toFixed(3)} vs ${disp})`);
}
{
  let e = AP.criarEstadoApoio({ seed: 3 });
  let pedido = null;
  for (let t = 10; !pedido?.concedido; t++) ({ estado: e, pedido } = pedir(e, 'ibama', '5DN', t));
  const { turnoPedido: t0, vigenteDe, vigenteAte } = pedido;
  eq([vigenteDe - t0, vigenteAte - vigenteDe + 1], [P.APOIOS.ibama.prazo, P.APOIOS.ibama.duracao], 'prazo e duração do pedido');
  ok(AP.vigentes(e, vigenteDe - 1, '5DN').length === 0, 'antes do prazo o apoio não atua');
  ok(AP.vigentes(e, vigenteDe, '5DN').length === 1 && AP.vigentes(e, vigenteAte, '5DN').length === 1, 'em vigor do prazo ao fim da duração');
  ok(AP.vigentes(e, vigenteAte + 1, '5DN').length === 0, 'depois da duração o apoio expira');
  ok(AP.vigentes(e, vigenteDe, '8DN').length === 0, 'o apoio vale só para a área pedida');
}
{
  // Pertinência: cada órgão só atua sobre a ação da sua atribuição.
  let e = AP.criarEstadoApoio({ seed: 1 });
  const concede = (apoio, area) => { for (let k = 0; k < 50; k++) { const r = pedir(e, apoio, area, 1); e = r.estado; if (r.pedido?.concedido) return; } throw new Error('não concedido'); };
  for (const a of ['pf', 'rf', 'ibama', 'intl']) concede(a, '1DN');
  // Pedidos no turno 1: no turno 4 os quatro estão em vigor (PF/RF 2–4, IBAMA 3–5, intl 4–8).
  const em = tipo => AP.modificadores(e, { turno: 4, area: '1DN', tipo }).apoios.sort();
  eq(em('narcotrafico'), ['pf'], 'PF só no narcotráfico');
  eq(em('contrabando'), ['rf'], 'Receita Federal só no contrabando');
  eq(em('pesca_iuu'), ['ibama'], 'IBAMA na pesca');
  eq(em('crime_ambiental'), ['ibama'], 'IBAMA no crime ambiental');
  eq(em('pirataria'), [], 'pirataria sem órgão pertinente na Tabela 7.2');
  eq(em('hibrido'), ['intl'], 'inteligência internacional só contra o híbrido');
  const unidade = { type: 'patrulha_oc' }, contato = { evasao: 0.2 };
  const com = AP.usarApoios(e, { turno: 4, area: '1DN', tipo: 'narcotrafico', unidade, contato, fusao: 0.6, etapa: 'apresamento' });
  ok(com.ganho > 0 && com.estado.contadores.apoio_pf === 1 && com.estado.contadores.efeito_apoio === com.ganho,
     'apoio pertinente aumenta a chance de apresar e é contado (apoio_pf, efeito_apoio)');
  const sem = AP.usarApoios(e, { turno: 4, area: '1DN', tipo: 'pirataria', unidade, contato, fusao: 0.6, etapa: 'apresamento' });
  ok(sem.ganho === 0 && sem.args.unidade === unidade && sem.estado === e, 'apoio não pertinente não muda nada');
  const hib = AP.usarApoios(e, { turno: 4, area: '1DN', tipo: 'hibrido', unidade, contato, fusao: 0.6, ritmo: 1 });
  ok(hib.args.ritmo === P.APOIOS.intl.fatorRitmo && hib.estado.contadores.apoio_intl === 1, 'inteligência acelera a atribuição contra o híbrido');
}
{
  const seq = seed => { let e = AP.criarEstadoApoio({ seed }); for (let t = 0; t < 40; t++) e = pedir(e, Object.keys(P.APOIOS)[t % 6], P.AREAS_DN[t % 4].id, t).estado; return e; };
  eq(seq(9), seq(9), 'mesma semente e mesmos pedidos ⇒ mesmos apoios concedidos');
  ok(JSON.stringify(seq(9).pedidos) !== JSON.stringify(seq(10).pedidos), 'sementes diferentes ⇒ concessões diferentes');
}

// ─── Mesma campanha em todas as modalidades ──────────────────────────────────
// Uma mini-campanha integrada (SM-1 a SM-4): ocorrências (constab), respostas
// dos DN pelo motor de encontro com apoios do COMPAAz, eventos de cobertura na
// escada autorizada pelo COMPAAz. As políticas de decisão são as mesmas; só o
// c2 (quem controla cada estação) muda.
function campanha(c2, seed, apoioExterno = 1, turnos = 25) {
  let co = CO.criarEstadoConstab({ seed });
  let ap = AP.criarEstadoApoio({ seed, apoioExterno });
  let es = ES.criarEstadoEscalada(0);
  const rngEnc = mulberry32(seed ^ 0x5bd1e995);
  const fusao = C2.qualidadeFusao({ cFusao: true });
  const decisoes = [];
  for (let t = 1; t <= turnos; t++) {
    co = CO.avancarTurno(co, { intensidade: 0.6, areaAlvo: '1DN' }).estado;
    // COMPAAz: pede PF para a área com mais narcotráfico aberto.
    const narco = P.AREAS_DN.map(a => [a.id, co.ativas.filter(o => o.area === a.id && o.tipo === 'narcotrafico').length])
                            .sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1))[0];
    if (narco[1] > 0) {
      const r = AP.solicitar(ap, c2, { quem: c2.controle.COMPAAz, apoio: 'pf', area: narco[0], turno: t });
      ap = r.estado;
      decisoes.push(['COMPAAz', 'solicitar_apoio', narco[0], r.pedido?.concedido ?? null]);
    }
    // Cada DN responde a até duas ocorrências da sua área.
    const eventos = [];
    for (const area of P.AREAS_DN.map(a => a.id)) {
      const est = C2.estacaoDaArea(area);
      const abertas = co.ativas.filter(o => o.area === area).slice(0, 2);
      for (const o of abertas) {
        C2.exigirDecisao(c2, { quem: c2.controle[est], estacao: est, papel: 'responder_ocorrencia' });
        const u = AP.usarApoios(ap, { turno: t, area, tipo: o.tipo, unidade: { type: 'patrulha_oc' },
                                      contato: o.contato, fusao, etapa: P.TIPOS_OCORRENCIA[o.tipo].etapaRepressao });
        ap = u.estado;
        const enc = EN.resolverEncontro({ ...u.args, contato: o.contato, etapaAlvo: P.TETO_CONSTABULAR,
                                          tetoRoe: P.TETO_CONSTABULAR, rng: rngEnc });
        const r = CO.registrarResposta(co, o.id, enc);
        co = r.estado;
        if (r.eventoHibrido) eventos.push(r.eventoHibrido);
        decisoes.push([est, 'responder_ocorrencia', o.id, r.reprimida]);
      }
    }
    es = ES.avancarTurno(es, eventos, C2.decisorEscalada(c2, p => p.direcao === 'subida' || p.direcao === 'descida')).estado;
  }
  return { metricas: CO.metricas(co), apoios: ap.contadores, escalada: es.historico, nivel: es.nivel, decisoes };
}
{
  const unico = campanha(C2.criarC2({ modalidade: 'unico' }), 2026);
  const x1    = campanha(C2.criarC2({ modalidade: '1x1', controladores: { azul: 'humano:A', vermelho: 'humano:V' } }), 2026);
  const dist  = campanha(C2.criarC2({ modalidade: 'distribuido', controladores: DIST }), 2026);
  ok(unico.decisoes.length > 20 && unico.metricas.ocorr_reprimidas > 0 && unico.apoios.n_apoios_concedidos > 0,
     'a mini-campanha exercita respostas, repressões e apoios');
  eq(x1, unico, 'campanha idêntica no confronto 1×1 e no jogador único');
  eq(dist, unico, 'campanha idêntica nas estações distribuídas e no jogador único');
  eq(campanha(C2.criarC2({ modalidade: 'unico' }), 2026), unico, 'a campanha integrada é reprodutível pela semente');
  const semApoio = campanha(C2.criarC2({ modalidade: 'unico' }), 2026, 0);
  ok(semApoio.apoios.n_apoios_concedidos === 0 && semApoio.apoios.efeito_apoio === 0, 'contraste apoio_externo = 0: nenhum apoio, nenhum efeito');
  ok(semApoio.metricas.n_ocorr_crim === unico.metricas.n_ocorr_crim,
     'o contraste de apoio não muda as ocorrências geradas (sementes espelhadas)');
}

console.log(`\nSM-4: ${pass} verificações — ALL PASS`);
