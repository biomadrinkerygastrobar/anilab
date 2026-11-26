/* ANILAB — regras de negócio puras (validade das bolsas e triagem). Sem DOM: testável em Node. */
(function (root) {
  'use strict';
  const DENS = 1.05; // g/mL — densidade aproximada do sangue, para converter volume em gramas → mL

  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parse = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }; // sempre meia-noite LOCAL (sem UTC)
  const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate() + n); return ymd(d); };

  // Produtos e prazos (Anvisa/MS). h = validade em horas se sistema aberto/rompido.
  const PRODUTOS = [
    { k: 'ce-sag',  label: 'Concentrado de Hemácias - SAG-Manitol (42 dias)', comp: 'Concentrado de hemácias', sol: 'SAG-Manitol', dias: 42, h: 24 },
    { k: 'ce-cpda', label: 'Concentrado de Hemácias - CPDA-1 (35 dias)',      comp: 'Concentrado de hemácias', sol: 'CPDA-1',      dias: 35, h: 24 },
    { k: 'ce-cpd',  label: 'Concentrado de Hemácias - CPD (21 dias)',         comp: 'Concentrado de hemácias', sol: 'CPD',         dias: 21, h: 24 },
    { k: 'st-cpda', label: 'Sangue Total - CPDA-1 (35 dias)',                 comp: 'Sangue total',            sol: 'CPDA-1',      dias: 35, h: 24 },
    { k: 'st-cpd',  label: 'Sangue Total - CPD (21 dias)',                    comp: 'Sangue total',            sol: 'CPD',         dias: 21, h: 24 },
    { k: 'plq',     label: 'Concentrado de Plaquetas (5 dias)',               comp: 'Plaquetas',               sol: null,          dias: 5,  h: 4 },
    { k: 'plasma',  label: 'Plasma congelado (365 dias)',                     comp: 'Plasma',                  sol: null,          dias: 365, h: 24 },
  ];

  // coleta = 'YYYY-MM-DD'; hora = 'HH:MM' (usada só em sistema aberto)
  function calcValidade(coleta, prod, aberto, hora) {
    if (!coleta || !prod) return null;
    if (aberto) {
      const [y, m, d] = coleta.split('-').map(Number); const [hh, mm] = (hora || '00:00').split(':').map(Number);
      const exp = new Date(new Date(y, m - 1, d, hh || 0, mm || 0).getTime() + prod.h * 36e5);
      return { date: ymd(exp), em: exp.toISOString(), exp };
    }
    return { date: addDays(coleta, prod.dias), em: null, exp: null };
  }

  // Verde > 7 dias · Amarelo ≤ 7 dias (inclui hoje) · Vermelho vencida
  function statusVal(validade, em, now) {
    now = now || new Date();
    if (em) {
      const ms = new Date(em).getTime() - now.getTime();
      if (ms <= 0) return { cls: 'bad', txt: 'Vencida', dias: -1 };
      const h = Math.floor(ms / 36e5), mi = Math.floor((ms % 36e5) / 6e4);
      return { cls: 'warn', txt: `Restam ${h}h ${String(mi).padStart(2, '0')}min`, dias: 0 };
    }
    if (!validade) return null;
    const tod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dias = Math.round((parse(validade).getTime() - tod.getTime()) / 864e5);
    if (dias < 0) return { cls: 'bad', txt: `Vencida há ${-dias} dia${-dias > 1 ? 's' : ''}`, dias };
    if (dias === 0) return { cls: 'warn', txt: 'Vence hoje', dias };
    if (dias <= 7) return { cls: 'warn', txt: `Vence em ${dias} dia${dias > 1 ? 's' : ''}`, dias };
    return { cls: 'ok', txt: `${dias} dias restantes`, dias };
  }

  // ---- tipagem / compatibilidade (veterinária: DEA-1 em cães; A, B, AB em gatos) ----
  function tipoNorm(esp, t) {
    t = String(t || '').trim().toLowerCase();
    if (!t || t === '—' || t.startsWith('não tipad') || t.startsWith('nao tipad')) return null;
    if (esp === 'Canino') return t.includes('neg') ? 'NEG' : t.includes('pos') ? 'POS' : null;
    const m = t.replace('tipo', '').trim();
    return m === 'ab' ? 'AB' : m === 'a' ? 'A' : m === 'b' ? 'B' : null;
  }
  function compatOk(esp, pac, bag) {
    if (esp === 'Canino') return pac === 'POS' ? true : bag === 'NEG'; // receptor DEA-1 pos recebe pos/neg; neg ou não tipado → só DEA-1 negativo
    if (pac === 'A') return bag === 'A';
    if (pac === 'B') return bag === 'B';
    if (pac === 'AB') return bag === 'AB' || bag === 'A';
    return false; // gato sem tipagem: não recomendar
  }

  // ---- volume ideal ----
  // Volume (mL) = [peso × volemia(mL/kg) × (Ht alvo − Ht atual)] / Ht da bolsa
  function calcVolume(kg, htAtual, htAlvo, volemia, htBolsa) {
    const ve = kg * volemia;
    return { ve, ideal: htAtual >= htAlvo ? 0 : (ve * (htAlvo - htAtual)) / htBolsa };
  }

  // Hematócrito alvo sugerido (editável pelo usuário). Cão: <20% → 25%, ≥20% → 30%. Gato: <15% → 20%, ≥15% → 25%.
  function htAlvoSugerido(esp, atual) {
    if (atual == null || !Number.isFinite(atual)) return null;
    if (esp === 'Felino') return atual < 15 ? 20 : 25;
    return atual < 20 ? 25 : 30;
  }
  const htAlvoPadrao = (esp) => (esp === 'Felino' ? 25 : 30);
  // Alerta de segurança: elevação > 12 pontos (cão) ou > 10 pontos (gato) exige grande volume (risco de TACO)
  const elevacaoAcentuada = (esp, atual, alvo) => alvo - atual > (esp === 'Felino' ? 10 : 12);

  const expMs = (b) => (b.validade_em ? Date.parse(b.validade_em) : parse(b.validade || '2999-12-31').getTime() + 864e5 - 1);

  function triar({ bolsas, esp, comp, pac, now }) {
    const pn = tipoNorm(esp, pac);
    const excl = { vencidas: 0, naoTipadas: 0, incompat: 0, semVolume: 0 };
    const ok = [];
    for (const b of bolsas) {
      if (b.especie !== esp || b.hemocomponente !== comp || b.status !== 'disponivel') continue;
      const st = statusVal(b.validade, b.validade_em, now);
      if (st && st.cls === 'bad') { excl.vencidas++; continue; }
      const bn = tipoNorm(esp, b.tipagem);
      if (bn === null) { excl.naoTipadas++; continue; }
      if (!compatOk(esp, pn, bn)) { excl.incompat++; continue; }
      const ml = b.volume_g ? Math.round(Number(b.volume_g) / DENS) : null;
      if (ml === null) excl.semVolume++;
      ok.push({ ...b, ml, st, exp: expMs(b) });
    }
    ok.sort((a, b) => a.exp - b.exp); // FEFO
    return { elegiveis: ok, excl };
  }

  // Melhor combinação (até 4 bolsas, entre as 16 que vencem primeiro): dentro de ±15% com menos bolsas; senão a mais próxima.
  function melhorCombinacao(elegiveis, ideal) {
    const pool = elegiveis.filter((b) => b.ml).slice(0, 16), n = pool.length;
    if (!n || !(ideal > 0)) return null;
    let best = null;
    for (let mask = 1; mask < (1 << n); mask++) {
      let sum = 0, cnt = 0, rank = 0;
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += pool[i].ml; cnt++; rank += i; }
      if (cnt > 4) continue;
      const diff = Math.abs(sum - ideal), within = diff <= ideal * 0.15;
      const c = { mask, sum, cnt, rank, diff, within };
      const better = !best || (c.within !== best.within ? c.within
        : c.within ? (c.cnt !== best.cnt ? c.cnt < best.cnt : c.diff !== best.diff ? c.diff < best.diff : c.rank < best.rank)
        : (c.diff !== best.diff ? c.diff < best.diff : c.cnt < best.cnt));
      if (better) best = c;
    }
    return { bolsas: pool.filter((_, i) => best.mask & (1 << i)), total: best.sum, diffPct: (best.sum - ideal) / ideal * 100, within: best.within };
  }

  // ---------- Pedidos ----------
  const COMPONENTES_PEDIDO = [
    { k: 'CH', rotulo: 'Concentrado de Hemácias (CH)', valor: 'Concentrado de hemácias' },
    { k: 'ST', rotulo: 'Sangue Total (ST)', valor: 'Sangue total' },
    { k: 'PFC', rotulo: 'Plasma Fresco Congelado (PFC)', valor: 'Plasma' },
    { k: 'CP', rotulo: 'Concentrado de Plaquetas (CP)', valor: 'Plaquetas' },
  ];
  // Faixas de referência (mL/kg) só para conferência do operador; o volume calculado usa o Ht da bolsa.
  const FAIXA_ML_KG = { 'Concentrado de hemácias': [6, 10], 'Sangue total': [10, 20], Plasma: [10, 20] };
  function faixaReferencia(comp, kg) {
    const f = FAIXA_ML_KG[comp]; if (!f || !(kg > 0)) return null;
    return { min: f[0], max: f[1], mlMin: Math.round(kg * f[0]), mlMax: Math.round(kg * f[1]) };
  }
  // Bolsas disponíveis para um pedido: exatas (componente + tipagem compatível) e alternativas autorizáveis.
  // Alternativas: outro componente da mesma espécie ou, só em cães, DEA-1 diferente do paciente. Nunca: vencida, sem tipagem,
  // nem tipo incompatível em gatos (risco de reação hemolítica aguda).
  function buscarBolsas({ bolsas, esp, comp, pac, now }) {
    const pn = tipoNorm(esp, pac);
    const excl = { vencidas: 0, semTipagem: 0, gatoIncompat: 0 };
    const exatas = [], alternativas = [];
    for (const b of bolsas) {
      if (b.especie !== esp || b.status !== 'disponivel') continue;
      const st = statusVal(b.validade, b.validade_em, now);
      if (st && st.cls === 'bad') { excl.vencidas++; continue; }
      const bn = tipoNorm(esp, b.tipagem);
      if (bn === null) { excl.semTipagem++; continue; }
      const mesmoComp = b.hemocomponente === comp, tipoOk = compatOk(esp, pn, bn);
      if (!mesmoComp || !tipoOk) {
        if (!tipoOk && esp === 'Felino') { excl.gatoIncompat++; continue; }
      }
      const ml = b.volume_g ? Math.round(Number(b.volume_g) / DENS) : null;
      const item = { ...b, ml, st, exp: expMs(b) };
      if (mesmoComp && tipoOk) exatas.push(item);
      else { item.motivos = [!mesmoComp && `componente diferente (${b.hemocomponente})`, !tipoOk && (pn === null ? 'paciente sem tipagem (bolsa DEA-1 positiva)' : 'tipagem diferente da do paciente')].filter(Boolean); alternativas.push(item); }
    }
    exatas.sort((a, b) => a.exp - b.exp); alternativas.sort((a, b) => a.exp - b.exp); // FEFO
    return { exatas, alternativas, excl };
  }

  // Temperatura de conservação por hemocomponente (usada na etiqueta oficial da bolsa)
  function tempConservacao(comp) {
    if (comp === 'Plaquetas') return 'CONSERVAR ENTRE 20°C E 24°C SOB AGITAÇÃO';
    if (comp === 'Plasma') return 'CONSERVAR A -18°C OU MENOS';
    return 'CONSERVAR ENTRE 2°C E 6°C';
  }
  const mlDaBolsa = (b) => (b && b.volume_g ? Math.round(Number(b.volume_g) / DENS) : null);

  root.HemoLogic = { tempConservacao, mlDaBolsa, COMPONENTES_PEDIDO, faixaReferencia, buscarBolsas, PRODUTOS, DENS, ymd, parse, addDays, calcValidade, statusVal, tipoNorm, compatOk, calcVolume, htAlvoSugerido, htAlvoPadrao, elevacaoAcentuada, triar, melhorCombinacao };
})(typeof window !== 'undefined' ? window : globalThis);
