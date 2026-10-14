'use strict';
/**
 * e2e_sm_ui.js — Verificação funcional da interface OAS-SM no navegador
 * (Playwright + Chromium), nas três modalidades. Sobe o servidor numa porta
 * livre, joga alguns turnos e grava capturas de tela em --saida (padrão:
 * diretório temporário). Não faz parte do npm test (exige navegador).
 *
 * Uso: node scripts/e2e_sm_ui.js [--saida dir]
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync, spawn } = require('child_process');
const { chromium } = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));

const args = process.argv.slice(2);
const SAIDA = args.includes('--saida') ? path.resolve(args[args.indexOf('--saida') + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'sm-e2e-'));
const PORTA = 3200 + Math.floor(Math.random() * 500);
const URL = `http://localhost:${PORTA}/sm`;
let falhas = 0;
const ok = (c, m) => { console.log(`${c ? '✅' : '❌'} ${m}`); if (!c) falhas++; };

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORTA) }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const nav = await chromium.launch();
  const erros = [];
  const pagina = async () => {
    const ctx = await nav.newContext({ viewport: { width: 1500, height: 920 } });
    const p = await ctx.newPage();
    p.on('pageerror', e => erros.push(e.message));
    p.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
    await p.goto(URL);
    return p;
  };
  const criar = async (p, modalidade, assento, extra = async () => {}) => {
    await p.check(`input[name=modalidade][value="${modalidade}"]`);
    await extra();
    await p.selectOption('#criar-assento', assento);
    await p.click('#form-criar button[type=submit]');
    await p.waitForSelector('#espera:not(.hidden)');
    return (await p.textContent('#espera-codigo')).trim();
  };
  const entrar = async (p, codigo, rotulo) => {
    await p.fill('#form-entrar [name=codigo]', codigo);
    await p.click('#btn-consultar');
    await p.click(`#entrar-assentos button:has-text("${rotulo}")`);
    await p.waitForSelector('#espera:not(.hidden)');
  };
  const turno = async p => Number((await p.textContent('#sm-turno')).match(/Dia (\d+)/)[1]);
  const temBotao = (p, texto) => p.evaluate(t => [...document.querySelectorAll('button')].some(b => b.offsetParent && b.textContent.includes(t)), texto);
  // Joga a vez do Azul: autoriza a escalada se houver proposta; senão envia as ordens. Espera o dia mudar.
  const vezAzul = async p => {
    const t0 = await turno(p);
    for (let k = 0; k < 3 && await turno(p) === t0; k++) {
      if (await temBotao(p, 'Autorizar')) await p.click('button:has-text("Autorizar")');
      else if (await temBotao(p, 'Enviar ordens')) await p.click('button:has-text("Enviar ordens")');
      // Espera a resposta: o dia muda, surge uma proposta de escalada ou a vez passa a outro.
      await p.waitForFunction(t => {
        const b = [...document.querySelectorAll('button')].filter(x => x.offsetParent);
        return Number(document.querySelector('#sm-turno').textContent.match(/Dia (\d+)/)[1]) > t ||
               b.some(x => x.textContent.includes('Autorizar')) || !b.some(x => x.textContent.includes('Enviar ordens'));
      }, t0, { timeout: 10000 }).catch(() => {});
      if (!(await temBotao(p, 'Enviar ordens')) && !(await temBotao(p, 'Autorizar'))) break;
    }
  };

  try {
    // ── Jogador único ──
    const a = await pagina();
    await criar(a, 'unico', 'azul');
    await a.click('#btn-iniciar');
    await a.waitForSelector('#jogo:not(.hidden)');
    ok(await turno(a) === 1, 'único: partida iniciada no dia 1');
    await a.selectOption('#aba-ordens select', 'Com1ºDN').catch(() => {});
    await a.click('button:has-text("Acionar SAR + FPE")');
    const contato = await a.$('.sm-item.oc, .sm-item.hib');
    if (contato) {
      await contato.click();
      const meioPronto = await a.$('.sm-item:not(.off):not(.oc):not(.hib)');
      if (meioPronto) await meioPronto.click();
    }
    const nDesig = await a.$$eval('.sm-plano div', d => d.filter(x => x.textContent.includes('→')).length);
    ok(nDesig >= 0, `único: plano montado (${nDesig} designações)`);
    await a.screenshot({ path: path.join(SAIDA, 'sm_unico_ordens.png') });
    for (let k = 0; k < 3; k++) await vezAzul(a);
    ok(await turno(a) >= 3, `único: turnos avançam (dia ${await turno(a)})`);
    await a.click('.sm-abas button[data-aba=boletim]');
    ok((await a.textContent('#aba-boletim')).includes('Turno'), 'único: boletim de situação exibido');
    await a.check('#tg-numeros');
    await a.screenshot({ path: path.join(SAIDA, 'sm_unico_boletim.png') });

    // ── Confronto 1×1 ──
    const az = await pagina(), vm = await pagina();
    const cod = await criar(az, '1x1', 'azul');
    await entrar(vm, cod, 'Força Vermelha');
    await az.click('#btn-iniciar');
    await vm.waitForSelector('#jogo:not(.hidden)');
    await vm.waitForSelector('button:has-text("Enviar lance")');
    ok(true, '1×1: o Vermelho recebe a vez');
    await vm.click('button:has-text("Adicionar")');
    await vm.screenshot({ path: path.join(SAIDA, 'sm_1x1_vermelho.png') });
    await vm.click('button:has-text("Enviar lance")');
    await az.waitForSelector('button:has-text("Enviar ordens")');
    ok(true, '1×1: depois do lance Vermelho, o Azul recebe a vez');
    await vezAzul(az);
    await vm.waitForSelector('button:has-text("Enviar lance")');
    ok(/Dia 2/.test(await vm.textContent('#sm-turno')), '1×1: turno resolvido; o dia 2 começa no lance Vermelho');
    await az.screenshot({ path: path.join(SAIDA, 'sm_1x1_azul.png') });

    // ── Estações distribuídas com Célula Branca ──
    const cp = await pagina(), dn = await pagina(), cb = await pagina();
    const cod2 = await criar(cp, 'distribuido', 'COMPAAz', async () => { await cp.check('input[name=celulaBranca]'); });
    await entrar(dn, cod2, 'Com1ºDN');
    await entrar(cb, cod2, 'Célula Branca');
    const lista = await cp.textContent('#espera-assentos');
    ok(/agente/.test(lista), 'distribuído: assentos vazios serão conduzidos pelo agente');
    await cp.click('#btn-iniciar');
    await cb.waitForSelector('button:has-text("Vermelho pelo motor")');
    await cb.selectOption('.sm-sec.cb select', 'injetar_evento');
    await cb.fill('.sm-sec.cb input[placeholder^=Justificativa]', 'exercitar a decisão de escalada');
    await cb.click('button:has-text("Registrar intervenção")');
    await cb.waitForSelector('.sm-msg.celula');
    ok(true, 'distribuído: a Célula Branca registra intervenção com justificativa');
    await cb.screenshot({ path: path.join(SAIDA, 'sm_distribuido_celula.png') });
    await cb.click('button:has-text("Vermelho pelo motor")');
    await dn.waitForSelector('button:has-text("Enviar ordens")');
    await dn.click('button:has-text("Enviar ordens")');
    await cp.waitForSelector('button:has-text("Enviar ordens")');
    await cp.screenshot({ path: path.join(SAIDA, 'sm_distribuido_compaaz.png') });
    await vezAzul(cp);
    await cb.waitForSelector('button:has-text("Vermelho pelo motor")');
    await cb.waitForFunction(() => /Dia 2/.test(document.querySelector('#sm-turno').textContent));
    ok(true, 'distribuído: turno resolvido com COMPAAz e 1º DN humanos e demais estações pelo agente');
    await dn.screenshot({ path: path.join(SAIDA, 'sm_distribuido_dn.png') });
  } catch (e) {
    ok(false, `fluxo interrompido: ${e.message.split('\n')[0]}`);
  } finally {
    ok(erros.length === 0, `sem erros de página${erros.length ? ': ' + erros.slice(0, 3).join(' | ') : ''}`);
    await nav.close(); srv.kill();
    console.log(`capturas em ${SAIDA}`);
    process.exit(falhas ? 1 : 0);
  }
})();
