'use strict';

/**
 * sm_server.js — Transporte Socket.IO das salas da OAS-SM (namespace /sm).
 *
 * Toda a regra está em shared/sm/sala.js (e, abaixo dela, no motor de
 * turno). Aqui só se criam salas, se ligam sockets a assentos, se repassam
 * mensagens e se envia a cada socket a visão do seu assento.
 *
 * Mensagens (cliente → servidor):
 *   sm:criar   { cfg, assento, nome }        cria a sala e ocupa o assento
 *   sm:consultar { codigo }                   modalidade e assentos livres (antes de entrar)
 *   sm:entrar  { codigo, assento, nome, token? }  ocupa um assento (ou reconecta com o token)
 *   sm:iniciar {}                             inicia a partida
 *   sm:enviar  { tipo, payload }              vermelho | ordens | autorizar | celula
 * Servidor → cliente:
 *   sm:sessao  { codigo, assento, token }     credencial do assento
 *   sm:sala    { codigo, modalidade, fase, assentos, config }
 *   sm:estado  { meta, situacao }             visão do assento
 *   sm:erro    texto
 */

const crypto = require('crypto');
const { criarSala } = require('./shared/sm/sala');

const SALAS = new Map();                 // código → { sala, tokens: Map(token → {assento, id}) }
const LIMITE_SALAS = 200;

function novoCodigo() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) {
    const c = Array.from({ length: 5 }, () => A[crypto.randomInt(A.length)]).join('');
    if (!SALAS.has(c)) return c;
  }
}

function attach(nsp) {
  const difundir = codigo => {
    const reg = SALAS.get(codigo);
    if (!reg) return;
    for (const s of nsp.sockets.values()) {
      if (s.data?.codigo !== codigo || !s.data.assento) continue;
      try { s.emit('sm:estado', reg.sala.vista(s.data.assento)); }
      catch (e) { s.emit('sm:erro', e.message); }
    }
  };

  nsp.on('connection', socket => {
    const falha = e => socket.emit('sm:erro', e.message || String(e));
    const entrarNoAssento = (codigo, assento, nome, token) => {
      const reg = SALAS.get(codigo);
      if (!reg) throw new Error('Sala não encontrada.');
      const credencial = token && reg.tokens.get(token);
      if (credencial) {
        reg.sala.reconectar(credencial.assento, credencial.id);
        assento = credencial.assento;
      } else {
        token = crypto.randomBytes(12).toString('hex');
        const id = token;
        reg.sala.ocupar(assento, { id, nome: String(nome || 'Jogador').slice(0, 40) });
        reg.tokens.set(token, { assento, id });
      }
      socket.data = { codigo, assento, token };
      socket.join(codigo);
      socket.emit('sm:sessao', { codigo, assento, token });
      difundir(codigo);
    };

    socket.on('sm:criar', ({ cfg, assento, nome } = {}) => {
      try {
        if (SALAS.size >= LIMITE_SALAS) throw new Error('Limite de salas atingido.');
        const codigo = novoCodigo();
        const seed = Number.isInteger(cfg?.seed) ? cfg.seed : crypto.randomInt(1, 2 ** 31 - 1);
        SALAS.set(codigo, { sala: criarSala({ codigo, cfg: { ...cfg, seed } }), tokens: new Map() });
        entrarNoAssento(codigo, assento, nome);
      } catch (e) { falha(e); }
    });

    socket.on('sm:entrar', ({ codigo, assento, nome, token } = {}) => {
      try { entrarNoAssento(String(codigo || '').toUpperCase(), assento, nome, token); } catch (e) { falha(e); }
    });

    socket.on('sm:consultar', ({ codigo } = {}) => {
      const reg = SALAS.get(String(codigo || '').toUpperCase());
      if (!reg) return falha(new Error('Sala não encontrada.'));
      const { meta } = reg.sala.vista(null);
      socket.emit('sm:sala', { codigo: meta.codigo, modalidade: meta.modalidade, fase: meta.fase, assentos: meta.assentos, config: meta.config });
    });

    socket.on('sm:iniciar', () => {
      try {
        const reg = SALAS.get(socket.data?.codigo);
        if (!reg) throw new Error('Sem sala.');
        reg.sala.iniciar();
        difundir(socket.data.codigo);
      } catch (e) { falha(e); }
    });

    socket.on('sm:enviar', ({ tipo, payload } = {}) => {
      try {
        const reg = SALAS.get(socket.data?.codigo);
        if (!reg) throw new Error('Sem sala.');
        reg.sala.enviar(socket.data.assento, tipo, payload);
        difundir(socket.data.codigo);
      } catch (e) { falha(e); difundir(socket.data?.codigo); }
    });

    socket.on('disconnect', () => {
      const reg = SALAS.get(socket.data?.codigo);
      if (!reg) return;
      reg.sala.liberar(socket.data.assento);
      if (reg.sala.fase === 'lobby') for (const [tk, c] of reg.tokens) if (c.assento === socket.data.assento) reg.tokens.delete(tk);
      difundir(socket.data.codigo);
    });
  });
}

module.exports = { attach, SALAS };
