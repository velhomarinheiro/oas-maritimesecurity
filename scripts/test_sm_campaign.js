'use strict';
/**
 * test_sm_campaign.js — Testes da Fase SM-5 (configurador, dificuldade,
 * crises, boletim e Célula Branca).
 *
 * Critérios de aceitação cobertos (Conceito v1.6 §13):
 *   - setup reproduzível: mesma configuração ⇒ mesma campanha;
 *   - a dificuldade altera a névoa (ritmo de evidência, intenção visível,
 *     ocultação, adaptação), não a física (probabilidades, incidências);
 *   - as crises disparam nos marcos (início, Detecção, Resposta).
 *
 * Uso: node scripts/test_sm_campaign.js
 */

const assert = require('assert');
const { mulberry32 } = require('../shared/rng');
const { PARAMS: P } = require('../shared/sm/params');
const CA = require('../shared/sm/campaign');
const CO = require('../shared/sm/constab');
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
const DIST = Object.fromEntries(P.ESTACOES.map((e, i) => [e.id, `humano:${i + 1}`]));

// ─── Configurador ────────────────────────────────────────────────────────────
{
  const c = CA.configurarCampanha({ seed: 1 });
  ok(c.areasAtivas.length === 4 && c.trilhas.defesa && c.trilhas.constabular && c.dificuldade === 'intermediario' &&
     c.modalidade === 'unico' && c.duracaoDias === P.DURACAO_DIAS.padrao && c.apoioExterno === 1 &&
     P.FATORES_SM.every(f => c.fatores[f] === 1) && c.areasAtivas.includes(c.areaAlvoHibrida),
     'padrões: tudo ativo, intermediário, jogador único, 45 dias, área-alvo sorteada entre as ativas');
  const s = CA.configurarCampanha({ seed: 1, trilhas: { defesa: false } });
  ok(s.vetoresHibridos.length === 0 && s.intensidadeHibrida === 0 && s.areaAlvoHibrida === null, 'trilha de defesa desligada ⇒ sem híbrido');
  for (const [nome, cfg] of [
    ['sem semente', {}], ['área inexistente', { seed: 1, areasAtivas: ['3DN'] }], ['nenhuma trilha', { seed: 1, trilhas: { defesa: false, constabular: false } }],
    ['nível 4', { seed: 1, nivelInicial: 4 }], ['fator inexistente', { seed: 1, fatores: { F_X: 1 } }], ['fator 0', { seed: 1, fatores: { A_MPA: 0 } }],
    ['dificuldade inexistente', { seed: 1, dificuldade: 'heroico' }], ['Célula Branca no jogador único', { seed: 1, celulaBranca: true }],
    ['20 dias', { seed: 1, duracaoDias: 20 }], ['61 dias', { seed: 1, duracaoDias: 61 }], ['força 0', { seed: 1, forcaInicial: { portos: 0 } }],
    ['alvo inativo', { seed: 1, areasAtivas: ['1DN'], areaAlvoHibrida: '5DN' }], ['1×1 sem jogadores', { seed: 1, modalidade: '1x1' }],
  ]) ok(lanca(() => CA.configurarCampanha(cfg)), `configuração recusada: ${nome}`);
}
{
  const cfg = { seed: 2026, areasAtivas: ['1DN', '8DN'], nivelInicial: 1, dificuldade: 'avancado', duracaoDias: 30,
                fatores: { C_Fusao: -1 }, forcaInicial: { plataformas: 0.75 } };
  eq(CA.iniciarCampanha(cfg), CA.iniciarCampanha(cfg), 'setup reproduzível: mesma configuração ⇒ mesma campanha');
  const e = CA.iniciarCampanha(cfg);
  ok(e.escalada.nivel === 1 && e.constab.areasAtivas.join() === '1DN,8DN' && e.config.fatores.C_Fusao === -1 &&
     e.config.forcaInicial.plataformas === 0.75, 'a campanha herda postura, áreas e fatores do configurador');
  ok(CA.iniciarCampanha({ seed: 1, trilhas: { constabular: false } }).constab === null, 'trilha constabular desligada ⇒ sem gerador de ocorrências');
  ok(CA.iniciarCampanha({ seed: 1, fatores: { A_MPA: -1 } }).apoio.mpaOrganica === false, 'sem o fator A_MPA não há MPA a ativar');
  ok(CA.iniciarCampanha({ seed: 1, apoioExterno: 0 }).apoio.apoioExterno === 0, 'apoio externo chega ao despacho do COMPAAz');
}

// ─── Dificuldade: névoa, não física ──────────────────────────────────────────
{
  const por = d => CA.iniciarCampanha({ seed: 77, dificuldade: d });
  const [b, i, a] = ['basico', 'intermediario', 'avancado'].map(por);
  const semNevoa = e => { const { config: { dificuldade: _d, ...c }, ...r } = e; return { ...r, config: c }; };
  eq(semNevoa(a), semNevoa(b), 'a dificuldade não muda o setup (estados, crises, ocorrências)');
  ok(CA.ritmoDeEvidencia(b, null) > CA.ritmoDeEvidencia(i, null) && CA.ritmoDeEvidencia(i, null) > CA.ritmoDeEvidencia(a, null),
     'evidência mais rápida no básico, mais lenta no avançado');
  let geraIgual = true, probIgual = true, atribDifere = false;
  for (let s = 1; s <= 150; s++) {
    const res = [b, i, a].map(e => EN.resolverEncontro({ unidade: { type: 'patrulha_oc' }, contato: { negabilidade: 'alta' },
      fusao: 0.7, etapaAlvo: 'apresamento', ritmo: CA.ritmoDeEvidencia(e, null), rng: mulberry32(s) }));
    const fisica = r => JSON.stringify(r.etapas);
    if (fisica(res[0]) !== fisica(res[1]) || fisica(res[1]) !== fisica(res[2])) probIgual = false;
    if (res[0].atribuicao.depois !== res[2].atribuicao.depois) atribDifere = true;
  }
  ok(probIgual, 'mesmas probabilidades, sorteios e etapas do encontro em toda dificuldade (física intacta)');
  ok(atribDifere, '…muda só a atribuição resultante');
  let co = [b, i, a].map(e => e.constab);
  for (let t = 0; t < 30; t++) {
    co = co.map(c => CO.avancarTurno(c, { intensidade: 0.5, areaAlvo: '1DN' }).estado);
    if (JSON.stringify(co[0].ativas) !== JSON.stringify(co[2].ativas)) geraIgual = false;
  }
  ok(geraIgual, 'mesmas ocorrências em toda dificuldade');
}
{
  const contatos = [{ id: 'H1', atribuicao: 50, intencao: 'hostil' }, { id: 'H2', atribuicao: 80, intencao: 'hostil' }];
  const vis = d => CA.vistaHibrida(CA.iniciarCampanha({ seed: 1, dificuldade: d }), contatos);
  eq(vis('basico').map(c => c.intencao), ['hostil', 'hostil'], 'básico: intenção do híbrido visível');
  eq(vis('intermediario').map(c => c.intencao), ['hostil', 'hostil'], 'intermediário: intenção aparece com atribuição parcial (≥ 40)');
  eq(vis('avancado'), [], 'avançado: meios do híbrido ocultos até o contato');
  const rev = CA.revelarContato(CA.revelarContato(CA.iniciarCampanha({ seed: 1, dificuldade: 'avancado' }), 'H1'), 'H2');
  eq(CA.vistaHibrida(rev, contatos).map(c => c.intencao), ['desconhecida', 'hostil'], 'avançado: revelado o contato, intenção só com atribuição robusta');
  ok(CA.revelarContato(rev, 'H1') === rev, 'revelar de novo não muda o estado');
}
{
  let e = CA.iniciarCampanha({ seed: 1, dificuldade: 'avancado' });
  const d = P.DIFICULDADES.avancado;
  const ritmos = [];
  for (let k = 0; k < 12; k++) { ritmos.push(CA.ritmoDeEvidencia(e, 'abordagem@1DN')); e = CA.registrarPadrao(e, 'abordagem@1DN'); }
  ok(ritmos.every((r, k) => k === 0 || r <= ritmos[k - 1]) && ritmos[1] < ritmos[0], 'avançado: resposta repetida rende menos evidência');
  ok(Math.abs(ritmos[11] - d.ritmo * d.adaptacao.piso) < 1e-12, 'a adaptação tem piso');
  ok(CA.ritmoDeEvidencia(e, 'inspecao@8DN') === d.ritmo, 'variar a resposta não é penalizado');
  let f = CA.iniciarCampanha({ seed: 1, dificuldade: 'intermediario' });
  for (let k = 0; k < 5; k++) f = CA.registrarPadrao(f, 'x');
  ok(CA.ritmoDeEvidencia(f, 'x') === P.DIFICULDADES.intermediario.ritmo, 'sem adaptação fora do avançado');
}

// ─── Crises ──────────────────────────────────────────────────────────────────
{
  let bom = true, distintas = true, janelas = true, variedade = new Set();
  for (let s = 1; s <= 300; s++) {
    const e = CA.iniciarCampanha({ seed: s });
    const cr = e.crises;
    if (cr.length < P.N_CRISES.min || cr.length > P.N_CRISES.max) bom = false;
    if (new Set(cr.map(c => c.tipo)).size !== cr.length) distintas = false;
    if (cr.some((c, k) => k > 0 && c.inicio <= cr[k - 1].inicio) || cr.some(c => c.inicio < 4 || c.inicio > e.config.duracaoDias - 3)) janelas = false;
    cr.forEach(c => variedade.add(c.tipo));
  }
  ok(bom, '2 a 3 crises por campanha');
  ok(distintas, 'crises de tipos distintos');
  ok(janelas, 'crises espalhadas na campanha, em janelas sucessivas');
  eq([...variedade].sort(), Object.keys(P.CRISES).sort(), 'todo o repertório da Tabela 8.2 aparece');
  eq(CA.iniciarCampanha({ seed: 9 }).crises, CA.iniciarCampanha({ seed: 9 }).crises, 'tipo, local e momento das crises saem da semente');
  ok(CA.iniciarCampanha({ seed: 9, trilhas: { defesa: false } }).crises.every(c => P.CRISES[c.tipo].trilha === 'constabular') &&
     [...Array(100).keys()].every(s => !CA.iniciarCampanha({ seed: s, trilhas: { defesa: false } }).crises.some(c => c.tipo === 'sabotagem_ic')),
     'sem a trilha de defesa, sem sabotagem de infraestrutura');
  eq(CA.iniciarCampanha({ seed: 9, modalidade: 'distribuido', controladores: DIST, celulaBranca: true }).crises, [],
     'com Célula Branca nenhuma crise é sorteada (o facilitador as injeta)');
}
{
  let e = CA.iniciarCampanha({ seed: 5 });
  const c1 = e.crises[0];
  let disparos = [];
  for (let t = 1; t <= c1.inicio; t++) { const r = CA.avancarCrises(e, t); e = r.estado; disparos.push(...r.disparadas.map(d => [t, d.crise])); }
  eq(disparos, [[c1.inicio, c1.id]], 'a crise dispara no turno de início, e só nele');
  ok(e.crises[0].status === 'ativa', 'crise disparada fica ativa');
  const ef = CA.efeitosDaCrise(c1);
  ok(ef.area === c1.area && ef.turno === c1.inicio && JSON.stringify(Object.keys(ef).slice(4)) === JSON.stringify(Object.keys(P.CRISES[c1.tipo].efeito)),
     'o disparo traz o efeito do tipo, na área e no turno');
  const ideal = P.CRISES[c1.tipo].deteccao.ideal;
  e = CA.registrarDeteccaoCrise(e, c1.id, c1.inicio + ideal);
  eq(e.crises[0].deteccao, { turno: c1.inicio + ideal, nota: 1 }, 'Detecção no prazo ideal ⇒ nota 1');
  const e2 = CA.registrarDeteccaoCrise(e, c1.id, c1.inicio + 99);
  eq(e2.crises[0].deteccao.nota, 1, 'a Detecção conta uma vez');
  const R = P.CRISES[c1.tipo].resposta;
  const meio = c1.inicio + Math.ceil((R.ideal + R.max) / 2);
  const er = CA.registrarRespostaCrise(e, c1.id, meio, true);
  const esperado = CA.notaMarco(meio - c1.inicio, R);
  ok(er.crises[0].status === 'encerrada' && er.crises[0].resposta.nota === esperado && esperado > 0 && esperado < 1,
     'Resposta adequada entre o ideal e o máximo ⇒ nota parcial, e o episódio se encerra');
  eq(CA.registrarRespostaCrise(e, c1.id, c1.inicio, false).crises[0].resposta.nota, 0, 'Resposta inadequada ⇒ nota 0');
  ok(lanca(() => CA.registrarDeteccaoCrise(er, c1.id, meio)), 'crise encerrada não recebe marco');
  let f = e;
  for (let t = c1.inicio + 1; t <= c1.inicio + R.max; t++) f = CA.avancarCrises(f, t).estado;
  ok(f.crises[0].status === 'encerrada' && f.crises[0].resposta.nota === 0 && f.crises[0].deteccao.nota === 1,
     'sem resposta até o prazo máximo, a crise se encerra com Resposta 0');
  eq([CA.notaMarco(0, { ideal: 1, max: 3 }), CA.notaMarco(2, { ideal: 1, max: 3 }), CA.notaMarco(3, { ideal: 1, max: 3 })], [1, 0.5, 0], 'nota dos marcos');
}

// ─── Boletim ─────────────────────────────────────────────────────────────────
{
  let e = CA.iniciarCampanha({ seed: 3, dificuldade: 'basico' });
  const r = EN.resolverEncontro({ unidade: { type: 'patrulha_oc' }, contato: {}, fusao: 0.8, etapaAlvo: 'inspecao', rng: mulberry32(4) });
  const dados = { encontros: [{ unidade: 'PAOC1', contato: 'K7', resultado: r }], atribuicoes: [{ contato: 'K7', antes: 10, depois: 35 }] };
  const sem = CA.gerarBoletim(e, dados), com = CA.gerarBoletim(e, { ...dados, mostrarNumeros: true });
  ok(sem.acoes[0].etapas.every(x => !/\d/.test(x.chance)) && com.acoes[0].etapas.every(x => /\(\d+%\)/.test(x.chance)),
     'probabilidade em palavras; com o interruptor, também em número');
  ok(['quase certo', 'provável', 'arriscado', 'remoto'].some(w => sem.acoes[0].etapas[0].chance === w), 'rótulos de probabilidade do §8.4');
  ok(sem.postura.sigla === 'N0' && sem.atribuicoes[0].variacao === 25 && sem.constabular && sem.linhas.length >= 4,
     'boletim traz postura, variação de atribuição, ordem marítima e linhas de texto');
  ok(sem.proximoEvento && sem.proximoEvento.turno === e.crises[0].inicio, 'básico: prévia do próximo evento com tipo, área e turno');
  const avc = CA.gerarBoletim(CA.iniciarCampanha({ seed: 3, dificuldade: 'avancado' }), {});
  eq(avc.proximoEvento, { rotulo: 'indefinido' }, 'avançado: a prévia não revela a próxima crise');
}

// ─── Célula Branca ───────────────────────────────────────────────────────────
{
  const base = CA.iniciarCampanha({ seed: 8, modalidade: 'distribuido', controladores: DIST, celulaBranca: true });
  const cb = (e, tipo, payload, j = 'objetivo de instrução') => CA.intervir(e, { ator: 'celula_branca', tipo, payload, justificativa: j, turno: 3 });
  ok(lanca(() => CA.intervir(base, { ator: 'motor', tipo: 'anular_lance', payload: { lanceId: 'L1' }, justificativa: 'x' })),
     'com Célula Branca configurada, o motor não intervém');
  ok(lanca(() => cb(base, 'anular_lance', { lanceId: 'L1' }, '  ')), 'intervenção sem justificativa é recusada');
  let e = cb(base, 'injetar_crise', { tipo: 'sar', area: '5DN', inicio: 6 });
  ok(e.crises.length === 1 && e.crises[0].origem === 'celula_branca' && e.crises[0].inicio === 6, 'a Célula Branca injeta uma crise no momento e local que escolhe');
  let disparou = false; let f = e;
  for (let t = 4; t <= 6; t++) { const r = CA.avancarCrises(f, t); f = r.estado; if (r.disparadas.some(d => d.tipo === 'sar' && t === 6)) disparou = true; }
  ok(disparou, 'a crise injetada dispara no turno escolhido');
  ok(lanca(() => cb(base, 'injetar_crise', { tipo: 'sar', area: '5DN', inicio: 1 })), 'crise no passado é recusada');
  e = cb(e, 'injetar_evento', { evento: { tipo: 'dano_infra', atribuicao: 30 } });
  e = cb(e, 'injetar_ocorrencia', { tipo: 'pirataria', area: '8DN' });
  const { estado: e2, injetados } = CA.consumirInjetados(e, 3);
  ok(injetados.length === 2 && e2.injetados.length === 0, 'eventos e ocorrências injetados são entregues ao turno');
  e = cb(e2, 'ajustar_parametro', { chave: 'intensidadeHibrida', valor: 0.9 });
  ok(e.config.intensidadeHibrida === 0.9, 'a Célula Branca ajusta parâmetros do cenário');
  ok(lanca(() => cb(e, 'ajustar_parametro', { chave: 'seed', valor: 2 })), 'parâmetro fora da lista não é ajustável');
  ok(lanca(() => cb(e, 'ajustar_parametro', { chave: 'intensidadeHibrida', valor: 2 })), 'ajuste inválido é recusado (revalidação)');
  e = cb(e, 'transferir_area', { area: '8DN', para: 'Com1ºDN' });
  ok(e.responsavelPorArea['8DN'] === 'Com1ºDN', 'a Célula Branca transfere o controle de uma área');
  ok(lanca(() => cb(e, 'transferir_area', { area: '8DN', para: 'ComemCh' })), 'área só passa a outro Distrito Naval');
  e = cb(e, 'anular_lance', { lanceId: 'L-42' });
  ok(e.anulados.includes('L-42'), 'a Célula Branca anula um lance');
  eq(e.registroCelula.map(r => r.tipo), ['injetar_crise', 'injetar_evento', 'injetar_ocorrencia', 'ajustar_parametro', 'transferir_area', 'anular_lance'],
     'toda intervenção fica registrada');
  ok(e.registroCelula.every(r => r.justificativa === 'objetivo de instrução' && r.turno === 3 && r.ator === 'celula_branca'),
     'o registro guarda turno, ator e justificativa');
  const u = CA.intervir(CA.iniciarCampanha({ seed: 8 }), { ator: 'motor', tipo: 'injetar_evento', payload: { evento: { tipo: 'incidente_hibrido' } }, justificativa: 'roteiro' });
  ok(u.registroCelula.length === 1, 'no jogador único as funções da Célula Branca são exercidas pelo motor');
}

console.log(`\nSM-5: ${pass} verificações — ALL PASS`);
