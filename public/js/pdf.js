/* Geração dos laudos em PDF (jsPDF) — paleta ANILAB */
(function () {
  const WINE = [24, 60, 96], WINE_DARK = [14, 36, 64], WINE_SOFT = [232, 240, 247];
  const GOLD = [30, 155, 215], INK = [20, 32, 46], MUTED = [97, 112, 128];
  const OK = [31, 122, 77], BAD = [179, 38, 30];
  let logoData = null;

  async function loadLogo() {
    if (logoData) return logoData;
    if (window.ANILAB_LOGO_DATA) return (logoData = window.ANILAB_LOGO_DATA);
    const blob = await (await fetch('img/anilab.png')).blob();
    logoData = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
    return logoData;
  }


  /* ---------- CAIXA ALTA nos PDFs (camada 3) ---------- */
  // Mantém e-mails e endereços web como estão; todo o resto sai em MAIÚSCULAS.
  const KEEP = /(https?:\/\/\S+|\S+@\S+\.\S+)/gi;
  function toUpperSafe(v) {
    if (v == null) return '';
    if (Array.isArray(v)) return v.map(toUpperSafe);
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object') return v; // células de tabela com opções: tratadas em upTable
    return String(v).split(KEEP).map((p, i) => (i % 2 ? p : p.toUpperCase())).join('');
  }
  const upCell = (c) => (c && typeof c === 'object' && !Array.isArray(c) && 'content' in c ? { ...c, content: toUpperSafe(c.content) } : toUpperSafe(c));
  const upRows = (rows) => (Array.isArray(rows) ? rows.map((r) => (Array.isArray(r) ? r.map(upCell) : r)) : rows);
  // Cria o jsPDF já com doc.text / splitTextToSize / getTextWidth / autoTable passando por toUpperSafe
  function newDoc(opts) {
    const { jsPDF } = window.jspdf; const doc = new jsPDF(opts);
    const wrap = (name, fix) => { const f = doc[name]; if (typeof f === 'function') doc[name] = function (...a) { return f.apply(doc, fix(a)); }; };
    wrap('text', (a) => { a[0] = toUpperSafe(a[0]); return a; });
    wrap('splitTextToSize', (a) => { a[0] = toUpperSafe(a[0]); return a; });
    wrap('getTextWidth', (a) => { a[0] = toUpperSafe(a[0]); return a; });
    wrap('autoTable', (a) => { if (a[0] && typeof a[0] === 'object') a[0] = { ...a[0], head: upRows(a[0].head), body: upRows(a[0].body), foot: upRows(a[0].foot) }; return a; });
    return doc;
  }

  const fmtDate = (d) => { if (!d) return '—'; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; };
  const fmtVal = (o) => (o.validade_em ? new Date(o.validade_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : fmtDate(o.validade));
  const pad = (n, l = 5) => String(n).padStart(l, '0');

  function frame(doc, S, titulo, numero, ano) {
    const W = 210;
    doc.setFillColor(...WINE); doc.rect(0, 0, W, 5, 'F');
    doc.setFillColor(...GOLD); doc.rect(0, 5, W, 1.2, 'F');
    doc.addImage(logoData, 'PNG', 90, 12, 30, 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...WINE);
    doc.text(titulo, W / 2, 48, { align: 'center' });
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.6); doc.line(75, 51, 135, 51);
    if (numero) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...MUTED);
      doc.text(`Laudo Nº ${pad(numero)}/${ano}`, 195, 48, { align: 'right' });
    }
    // rodapé
    doc.setDrawColor(...WINE); doc.setLineWidth(0.4); doc.line(15, 273, 195, 273);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`ANILAB LABORATÓRIO VETERINÁRIO • BANCO DE SANGUE — ${S.address}`, 105, 279, { align: 'center' });
    doc.text(`${S.phones}  •  ${S.email}`, 105, 283.5, { align: 'center' });
    doc.setFillColor(...GOLD); doc.rect(0, 292, W, 1.2, 'F');
    doc.setFillColor(...WINE); doc.rect(0, 293.2, W, 3.8, 'F');
  }

  function infoCard(doc, y, pairs) {
    const rows = Math.ceil(pairs.length / 2), h = 6 + rows * 10;
    doc.setFillColor(...WINE_SOFT); doc.setDrawColor(201, 217, 232); doc.setLineWidth(0.3);
    doc.roundedRect(15, y, 180, h, 3, 3, 'FD');
    pairs.forEach(([k, v], i) => {
      const x = 22 + (i % 2) * 88, yy = y + 7 + Math.floor(i / 2) * 10;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...WINE_DARK);
      doc.text(String(k).toUpperCase(), x, yy);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...INK);
      doc.text(String(v || '—'), x, yy + 4.8, { maxWidth: 82 });
    });
    return y + h;
  }

  function signature(doc, S, y) {
    if (S.signature) { try { doc.addImage(S.signature, 'PNG', 84, y, 41, 18); } catch (e) { /* assinatura inválida: ignora */ } }
    doc.setDrawColor(...INK); doc.setLineWidth(0.3); doc.line(65, y + 20, 145, y + 20);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK);
    doc.text(`Médico Veterinário responsável: ${S.vet_name}`, 105, y + 25.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`${S.crmv}  •  MAPA ${S.mapa}`, 105, y + 30.5, { align: 'center' });
    return y + 32;
  }

  /* ---------- Rodapé técnico padronizado (todos os laudos) ---------- */
  const TECH_GRAY = [75, 85, 99], TECH_LINE = [209, 213, 219];
  const TECH_REFS = [
    [{ t: 'YAGI, K.; HOLOWAYCHUK, M. K. ' }, { t: 'Manual of Veterinary Transfusion Medicine and Blood Banking', st: 'italic' }, { t: '. Ames: Wiley-Blackwell, 2016.' }],
    [{ t: 'ESCOLA DE VETERINÁRIA DA UFMG. ' }, { t: 'Terapia Transfusional em Medicina Veterinária', st: 'italic' }, { t: '. Cadernos Técnicos de Veterinária e Zootecnia, nº 98. Belo Horizonte: UFMG, 2021.' }],
  ];
  const TECH_NOTA = [{ t: 'Os testes de compatibilidade (prova cruzada ' }, { t: 'major', st: 'italic' }, { t: ' e ' }, { t: 'minor', st: 'italic' }, { t: ') avaliam a presença de anticorpos eritrocitários pré-formados ' }, { t: 'in vitro', st: 'italic' }, { t: '. Um resultado compatível não exclui totalmente a possibilidade de sensibilização futura ou reações transfusionais não hemolíticas/tardias.' }];

  // quebra de linha com estilos misturados (negrito / itálico) — retorna linhas de tokens
  function richLines(doc, segs, maxW, fs) {
    doc.setFontSize(fs);
    const toks = [];
    segs.forEach((sg) => sg.t.split(/(\s+)/).forEach((t) => { if (t !== '') toks.push({ t, st: sg.st || 'normal' }); }));
    const lines = [[]]; let w = 0;
    toks.forEach((tk) => {
      doc.setFont('helvetica', tk.st);
      const tw = doc.getTextWidth(tk.t), space = /^\s+$/.test(tk.t), cur = lines[lines.length - 1];
      if (space && !cur.length) return;
      if (!space && w + tw > maxW && cur.length) { lines.push([]); w = 0; }
      lines[lines.length - 1].push({ ...tk, w: tw }); w += tw;
    });
    return lines;
  }

  const TECH = { X: 15, W: 180, FS: 7.5, LH: 3.05, LIMIT: 272, SIG_H: 32, GAPS: [0, 0.3, 0.3, 1.2, 0] }; // 7,5 pt ≈ 10 px
  function techLayout(doc) {
    const paras = [[{ t: 'Referências Bibliográficas:', st: 'bold' }], TECH_REFS[0], TECH_REFS[1], [{ t: 'Nota Técnica:', st: 'bold' }], TECH_NOTA];
    const laid = paras.map((p) => richLines(doc, p, TECH.W, TECH.FS));
    return { laid, h: 3 + laid.reduce((n, ls, i) => n + ls.length * TECH.LH + TECH.GAPS[i], 0) };
  }
  function techDraw(doc, y, laid) {
    doc.setDrawColor(...TECH_LINE); doc.setLineWidth(0.2); doc.line(TECH.X, y, TECH.X + TECH.W, y); // divisória sutil
    let cy = y + 3.4;
    laid.forEach((ls, i) => {
      cy += TECH.GAPS[i];
      ls.forEach((line) => {
        let x = TECH.X; doc.setFontSize(TECH.FS); doc.setTextColor(...TECH_GRAY);
        line.forEach((tk) => { doc.setFont('helvetica', tk.st); doc.text(tk.t, x, cy); x += tk.w; });
        cy += TECH.LH;
      });
    });
  }
  // Fecha o laudo: o bloco técnico fica ancorado no pé da página, com a assinatura logo acima.
  // Se o conteúdo não deixar espaço, assinatura + bloco vão JUNTOS para a página seguinte (o bloco nunca é cortado).
  function closeLaudo(doc, S, y, redraw) {
    const { laid, h } = techLayout(doc);
    let sigY = TECH.LIMIT - h - 3 - TECH.SIG_H;
    if (y + 5 > sigY) { doc.addPage(); redraw(); sigY = 62; }
    const sigEnd = signature(doc, S, sigY);
    techDraw(doc, sigEnd + 3, laid);
  }

  function notes(doc, y, text) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...WINE_DARK);
    doc.text('OBSERVAÇÕES', 15, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(text || 'Sem observações.', 180);
    doc.text(lines, 15, y + 5.5);
    return y + 5.5 + lines.length * 4.6;
  }

  function badge(doc, y, label, value, good) {
    const c = good === null ? WINE : good ? OK : BAD;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...WINE_DARK);
    doc.text(label.toUpperCase(), 15, y);
    doc.setFillColor(...c); doc.roundedRect(15, y + 3, 180, 15, 3, 3, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(15);
    doc.text(value, 105, y + 13, { align: 'center' });
    return y + 18;
  }

  /* ---------- LAUDO DE TIPAGEM ---------- */
  async function laudoTipagem(l, S) {
    await loadLogo();
    const doc = newDoc({ unit: 'mm', format: 'a4' });
    const d = l.dados || {}; const ano = new Date(l.created_at || Date.now()).getFullYear();
    const draw = () => frame(doc, S, 'LAUDO DE TIPAGEM SANGUÍNEA', l.numero, ano); draw();
    let y = infoCard(doc, 57, [['Animal', l.animal], ['Espécie', l.especie], ['Raça', l.raca], ['Idade', d.idade], ['Peso', d.peso ? d.peso + ' kg' : ''], ['Hematócrito', d.hematocrito ? d.hematocrito + ' %' : ''], ['Responsável', l.responsavel], ['Data do exame', fmtDate(l.data_exame)]]) + 10;
    y = badge(doc, y, 'Resultado', d.resultado || '—', null) + 8;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...WINE_DARK); doc.text('TESTE REALIZADO', 15, y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...INK);
    doc.text(`${d.teste || '—'}${d.lote ? '  (LOTE: ' + d.lote + ')' : ''}`, 15, y + 5.5);
    y += 16;
    y = notes(doc, y, l.observacoes) + 8;
    if (d.orientacao) {
      doc.setFillColor(...WINE_SOFT); doc.roundedRect(15, y, 180, 20, 3, 3, 'F');
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...WINE_DARK);
      doc.text(doc.splitTextToSize(d.orientacao, 168), 21, y + 7);
      y += 20;
    }
    closeLaudo(doc, S, y, draw);
    return doc;
  }

  /* ---------- LAUDO DE COMPATIBILIDADE ---------- */
  async function laudoCompat(l, S) {
    await loadLogo();
    const doc = newDoc({ unit: 'mm', format: 'a4' });
    const d = l.dados || {}; const ano = new Date(l.created_at || Date.now()).getFullYear();
    const draw = () => frame(doc, S, 'LAUDO DE COMPATIBILIDADE SANGUÍNEA', l.numero, ano); draw();
    let y = infoCard(doc, 57, [['Doador', d.doador], ['Animal receptor', l.animal], ['Espécie / Raça', [l.especie, l.raca].filter(Boolean).join(' • ')], ['Idade / Peso', [d.idade, d.peso ? d.peso + ' kg' : ''].filter(Boolean).join(' • ')], ['Hematócrito', d.hematocrito ? d.hematocrito + ' %' : ''], ['ID da bolsa', d.bolsa_id], ['Responsável', l.responsavel], ['Data do exame', fmtDate(l.data_exame)]]) + 8;
    doc.autoTable({
      startY: y, margin: { left: 15, right: 15 }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 10, cellPadding: 3, textColor: INK, lineColor: [201, 217, 232] },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: WINE_SOFT, textColor: WINE_DARK, cellWidth: 60 } },
      body: [['Hemocomponente', d.hemocomponente], ['Autoaglutinação', d.autoaglutinacao], ['Prova maior', d.prova_maior], ['Prova menor', d.prova_menor]],
    });
    y = doc.lastAutoTable.finalY + 8;
    y = badge(doc, y, 'Conclusão', d.compatibilidade || '—', d.compatibilidade === 'COMPATÍVEL' ? true : d.compatibilidade === 'INCOMPATÍVEL' ? false : null) + 6;
    y = notes(doc, y, l.observacoes);
    closeLaudo(doc, S, y, draw);
    return doc;
  }

  /* ---------- RELATÓRIOS (paisagem) ---------- */
  async function relatorio(titulo, periodo, head, body, S, widths) {
    await loadLogo();
    const doc = newDoc({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const W = 297;
    const draw = () => {
      doc.setFillColor(...WINE); doc.rect(0, 0, W, 4, 'F'); doc.setFillColor(...GOLD); doc.rect(0, 4, W, 1, 'F');
      doc.addImage(logoData, 'PNG', 12, 9, 22, 22);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(...WINE); doc.text(titulo, W - 12, 17, { align: 'right' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED);
      doc.text(periodo, W - 12, 23, { align: 'right' });
      doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')}`, W - 12, 28, { align: 'right' });
    };
    doc.autoTable({
      head: [head], body, startY: 36, margin: { left: 8, right: 8, top: 36, bottom: 16 }, theme: 'grid',
      styles: { fontSize: 7.2, cellPadding: 1.8, textColor: INK, lineColor: [201, 217, 232], overflow: 'linebreak' },
      headStyles: { fillColor: WINE, textColor: 255, fontSize: 7, halign: 'left' },
      alternateRowStyles: { fillColor: [247, 250, 253] },
      columnStyles: widths || {},
      didDrawPage: () => {
        draw();
        const n = doc.internal.getNumberOfPages();
        doc.setFontSize(7.5); doc.setTextColor(...MUTED);
        doc.text(`${S.address} • ${S.phones} • ${S.email}`, 8, 205);
        doc.text(`Página ${n}`, W - 8, 205, { align: 'right' });
      },
    });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...WINE);
    doc.text(`Total de registros: ${body.length}`, 8, Math.min(doc.lastAutoTable.finalY + 7, 200));
    return doc;
  }

  // QR de rastreio: quadrado de `w` mm (com zona de silêncio) + legenda; falha silenciosa se o QR não puder ser gerado
  function qrRastreio(doc, url, x, y, w) {
    try {
      window.HemoQR.drawPDF(doc, url, x, y, w);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(5.5); doc.setTextColor(...WINE_DARK);
      doc.text('ESCANEIE PARA RASTREAR', x + w / 2, y + w + 2.6, { align: 'center' });
      return true;
    } catch (e) { console.error(e); return false; }
  }
  const trunc = (doc, txt, w) => { let t = String(txt); while (t.length > 1 && doc.getTextWidth(t) > w) t = t.slice(0, -2) + '…'; return t; };

  /* ---------- ETIQUETA OFICIAL DA BOLSA — 4 quadrantes (ISBT 128 / RDC 34 adaptada à veterinária) ----------
     Canino → 100 x 100 mm · Felino → 50 x 70 mm (retrato). Um por página. */
  const fmtDH = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)}/${d.getFullYear()} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`; };
  function tipagemLinhas(b) {
    const t = String(b.tipagem || '').trim();
    if (!t || t === '—' || /^n[aã]o tipad/i.test(t)) return { linhas: ['SEM', 'TIPAGEM'], grande: false };
    if (b.especie === 'Felino') { const m = t.match(/(AB|A|B)\s*$/i); return m ? { linhas: ['TIPO', m[1].toUpperCase()], grande: true } : { linhas: [t.toUpperCase()], grande: false }; }
    const m = t.match(/DEA[-\s]?(\d(?:\.\d)?)\s*(positivo|negativo|pos|neg)?/i);
    if (m) return { linhas: [`DEA ${m[1]}:`, (/^pos/i.test(m[2] || '') ? 'POSITIVO' : /^neg/i.test(m[2] || '') ? 'NEGATIVO' : '')].filter(Boolean), grande: false };
    return { linhas: [t.toUpperCase()], grande: false };
  }
  function bolsaQuatro(doc, b, S, W, H) {
    const gato = W < 100, f = gato ? 0.72 : 1, m = gato ? 0.8 : 1.2, cx = W / 2, cy = H / 2;
    const fz = (n) => Math.max(4, n * f);
    const fit = (txt, w, size, min) => { size = fz(size); doc.setFontSize(size); while (size > (min || 4) && doc.getTextWidth(txt) > w) { size -= 0.3; doc.setFontSize(size); } return size; };
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.35); doc.rect(m, m, W - 2 * m, H - 2 * m);
    doc.setLineWidth(0.5); doc.line(cx, m, cx, H - m); doc.line(m, cy, W - m, cy);
    const pd = gato ? 1 : 2, cw = cx - m - 2 * pd;
    // --- Q1: identificação e rastreabilidade
    let x = m + pd, y = m + pd;
    try { doc.addImage(logoData, 'PNG', x, y, 7 * f, 7 * f); } catch (e) { /* logo opcional */ }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(0, 0, 0); doc.setFontSize(fz(10)); doc.text('ANILAB', x + 8 * f, y + 3.4 * f);
    doc.setFont('helvetica', 'normal'); fit(String(S.crmv || ''), cw - 8 * f, 5, 3.5); doc.text(String(S.crmv || ''), x + 8 * f, y + 6.6 * f);
    y += 8.6 * f;
    const bh = (gato ? 8 : 12), id = String(b.bolsa_id || '');
    window.HemoBarcode.draw(doc, id, x - 1, y, cw + 2, bh);
    y += bh + 2.6 * f;
    doc.setFont('helvetica', 'bold'); fit(id, cw, 9, 5); doc.text(id, x + cw / 2, y, { align: 'center' });
    y += 3.6 * f + (gato ? 0.6 : 1);
    doc.setFont('helvetica', 'bold'); fit(`DOADOR: ${b.doador || '—'}`, cw, 6.5, 4); doc.text(trunc(doc, `DOADOR: ${b.doador || '—'}`, cw), x, y);
    y += 3.2 * f + 0.6; doc.setFont('helvetica', 'normal'); fit(`ESPÉCIE: ${b.especie || '—'}`, cw, 6, 4); doc.text(`ESPÉCIE: ${b.especie || '—'}`, x, y);
    // --- Q2: tipagem sanguínea (máximo destaque)
    const tx = cx + pd, tw = W - m - pd - tx, th = (cy - m - 2 * pd) * (gato ? 0.5 : 0.58), ty = m + pd;
    doc.setFillColor(0, 0, 0); doc.rect(tx, ty, tw, th, 'F');
    const tp = tipagemLinhas(b); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
    if (tp.grande) {
      doc.setFontSize(fz(9)); doc.text(tp.linhas[0], tx + tw / 2, ty + th * 0.26, { align: 'center' });
      doc.setFontSize(fz(34)); doc.text(tp.linhas[1], tx + tw / 2, ty + th * 0.82, { align: 'center' });
    } else {
      const n = tp.linhas.length; tp.linhas.forEach((ln, i) => { fit(ln, tw - 3, i === 0 && n > 1 ? 12 : 15, 6); doc.text(ln, tx + tw / 2, ty + th * (n > 1 ? (i ? 0.78 : 0.4) : 0.58), { align: 'center' }); });
    }
    doc.setTextColor(0, 0, 0);
    const qy = ty + th + 1.2, qs = Math.min(tw - 2, cy - m - pd - qy - 3 * f);
    if (b.qr_url && qs > 8) {
      try { window.HemoQR.drawPDF(doc, b.qr_url, tx + (tw - qs) / 2, qy, qs); doc.setFont('helvetica', 'bold'); doc.setFontSize(fz(4.5)); doc.text('RASTREIO', tx + tw / 2, qy + qs + 2.2 * f, { align: 'center' }); } catch (e) { console.error(e); }
    }
    // --- Q3: especificações do hemocomponente
    x = m + pd; y = cy + pd + 2.6 * f;
    doc.setFont('helvetica', 'bold'); const nome = String(b.hemocomponente || '').toUpperCase();
    fz(8); doc.setFontSize(fz(9)); const ln = doc.splitTextToSize(nome, cw).slice(0, 2); ln.forEach((l, i) => doc.text(l, x, y + i * 3.6 * f)); y += ln.length * 3.6 * f + 1.2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fz(6.5)); doc.text(`SOLUÇÃO: ${b.solucao || (b.hemocomponente === 'Plasma' || b.hemocomponente === 'Plaquetas' ? 'N/A' : '—')}`, x, y); y += 3.4 * f + 0.4;
    const ml = window.HemoLogic.mlDaBolsa(b);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fz(7.5)); doc.text(ml ? `VOLUME: ${ml} ML` : 'VOLUME: ____ ML', x, y); y += 3.8 * f + 0.6;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fz(5.6)); doc.splitTextToSize(window.HemoLogic.tempConservacao(b.hemocomponente), cw).slice(0, 3).forEach((l, i) => doc.text(l, x, y + i * 2.5 * f));
    // --- Q4: datas, triagem e controle
    x = cx + pd; y = cy + pd + 2.6 * f; const w4 = W - m - pd - x;
    const campo = (rot, val, big) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(fz(5)); doc.text(rot, x, y); y += 2.9 * f;
      doc.setFont('helvetica', 'bold'); const sz = fit(val, w4, big ? 8.5 : 7, 4.5); doc.text(val, x, y); y += (big ? 4.4 : 3.6) * f + (gato ? 0.5 : 1);
    };
    const hasHora = b.sistema_aberto && b.validade_em;
    const horaCol = hasHora ? fmtDH(new Date(new Date(b.validade_em).getTime() - (window.HemoLogic.PRODUTOS.find((p) => p.comp === b.hemocomponente) || { h: 24 }).h * 36e5).toISOString()) : '';
    campo('COLETA:', horaCol || fmtDate(b.data_coleta), false);
    campo('VALIDADE:', b.validade_em ? fmtDH(b.validade_em) : fmtDate(b.validade), true);
    campo('TRIAGEM:', b.triagem ? String(b.triagem) : '________', false);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(fz(5)); doc.text('PROVA CRUZADA:', x, y); y += 2.9 * f;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(fz(7)); doc.text(b.prova_cruzada ? String(b.prova_cruzada) : '________', x, y);
  }
  async function etiquetas(list, S) {
    await loadLogo();
    const dims = (b) => (b.especie === 'Felino' ? [50, 70] : [100, 100]);
    const first = dims(list[0]);
    const doc = newDoc({ unit: 'mm', format: first, orientation: 'portrait' });
    list.forEach((b, i) => { const d = dims(b); if (i) doc.addPage(d, 'portrait'); bolsaQuatro(doc, b, S, d[0], d[1]); });
    return doc;
  }

  /* ---------- ETIQUETA DO TUBO EDTA — 50 x 25 mm (paisagem), 1 por página ---------- */
  async function etiquetasTubo(list, S) {
    const doc = newDoc({ unit: 'mm', format: [50, 25], orientation: 'landscape' });
    const fit = (txt, w, size, min) => { doc.setFontSize(size); while (size > (min || 4) && doc.getTextWidth(txt) > w) { size -= 0.25; doc.setFontSize(size); } };
    list.forEach((t, i) => {
      if (i) doc.addPage([50, 25], 'landscape');
      doc.setFillColor(0, 0, 0); doc.rect(0, 0, 50, 5.2, 'F');
      doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
      const topo = `${t.papel} • ${t.especie === 'Felino' ? 'FELINO' : 'CANINO'} • TUBO EDTA`; fit(topo.toUpperCase(), 47, 7, 4.5); doc.text(topo, 25, 3.8, { align: 'center' });
      doc.setTextColor(0, 0, 0);
      const cod = String(t.codigo || ''); window.HemoBarcode.draw(doc, cod, 2, 6.2, 46, 8.2);
      doc.setFont('helvetica', 'bold'); fit(cod, 46, 6.5, 4.5); doc.text(cod, 25, 17.4, { align: 'center' });
      const nome = `${t.animal || '—'}${t.tutor ? ` (${t.tutor})` : ''}${t.prontuario ? `  ID ${t.prontuario}` : ''}`;
      doc.setFont('helvetica', 'bold'); fit(nome, 47, 7, 4.2); doc.text(trunc(doc, nome, 47), 1.5, 20.7);
      const d = t.quando ? new Date(t.quando) : new Date();
      const exame = `${t.exame} • ${pad(d.getDate(), 2)}/${pad(d.getMonth() + 1, 2)} ${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}`;
      doc.setFont('helvetica', 'normal'); fit(exame, 47, 6, 4); doc.text(trunc(doc, exame, 47), 1.5, 23.8);
    });
    return doc;
  }

  /* ---------- ETIQUETA DE SAÍDA (identifica a bolsa enviada ao paciente) — 150 x 100 mm ---------- */
  async function etiquetaSaida(list, S) {
    await loadLogo();
    const doc = newDoc({ unit: 'mm', format: [150, 100], orientation: 'landscape' });
    const fit = (txt, w, size, min) => { doc.setFontSize(size); while (size > (min || 7) && doc.getTextWidth(txt) > w) { size -= 0.5; doc.setFontSize(size); } };
    const field = (label, value, x, y, w, color) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...WINE_DARK); doc.text(label.toUpperCase(), x, y);
      let v = String(value || '—'); doc.setFont('helvetica', 'bold'); fit(v, w, 13); v = trunc(doc, v, w); doc.setTextColor(...(color || INK)); doc.text(v, x, y + 5.6);
    };
    const heart = (cx, cy) => { doc.setFillColor(...GOLD); doc.circle(cx - 1.4, cy - 1, 2, 'F'); doc.circle(cx + 1.4, cy - 1, 2, 'F'); doc.triangle(cx - 3.3, cy - 0.4, cx + 3.3, cy - 0.4, cx, cy + 3.8, 'F'); };
    list.forEach((r, i) => {
      if (i) doc.addPage([150, 100], 'landscape');
      doc.setFillColor(...WINE); doc.rect(0, 0, 150, 3.5, 'F');
      doc.addImage(logoData, 'PNG', 6, 7, 17, 17);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...MUTED);
      doc.text('IDENTIFICAÇÃO DA BOLSA', 144, 11, { align: 'right' });
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...WINE); fit(String(r.bolsa_id), 75, 22, 10);
      doc.text(String(r.bolsa_id), 144, 21, { align: 'right' });
      doc.setDrawColor(...GOLD); doc.setLineWidth(0.7); doc.line(6, 27, 144, 27);
      const comQr = !!r.qr_url && qrRastreio(doc, r.qr_url, 116, 29.5, 28);
      const L = 6, R = 78, W = 66, WR = comQr ? 35 : 66, P = 9.6, y0 = 31.5;
      field('Nome do paciente', r.receptor, L, y0, W);            field('Espécie', r.especie, R, y0, WR);
      field('Sexo', r.sexo, L, y0 + P, W);                        field('Raça', r.raca, R, y0 + P, WR);
      field('Veterinário responsável', r.veterinario, L, y0 + 2 * P, W); field('Clínica ou hospital', r.clinica, R, y0 + 2 * P, WR);
      field('Hemocomponente', r.hemocomponente, L, y0 + 3 * P, W);       field('Tipagem sanguínea', r.tipagem_bolsa, R, y0 + 3 * P, WR);
      field('Data da coleta', fmtDate(r.data_origem), L, y0 + 4 * P, W); field('Validade', fmtVal(r), R, y0 + 4 * P, WR, WINE);
      if (r.endereco) {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...WINE_DARK); doc.text('ENDEREÇO:', 6, 79.4);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...INK);
        doc.text(trunc(doc, [r.endereco, r.cidade].filter(Boolean).join(' — '), 108), 22, 79.4);
      }
      doc.setFillColor(...WINE_SOFT); doc.setDrawColor(201, 217, 232); doc.setLineWidth(0.4); doc.roundedRect(6, 82, 138, 14, 3, 3, 'FD');
      heart(16, 88); heart(134, 88);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...WINE_DARK);
      doc.text('Desejamos uma ótima recuperação', 75, 87.3, { align: 'center' });
      const nome = (r.nome_etiqueta || r.receptor || '') + '!';
      fit(nome, 90, 15, 8); doc.setTextColor(...WINE); doc.text(nome, 75, 93.4, { align: 'center' });
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED);
      if (r.liberacao_em) {
        const quando = new Date(r.liberacao_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        doc.setFont('helvetica', 'bold'); doc.setTextColor(...WINE_DARK);
        doc.text(`LIBERAÇÃO: ${quando}  •  APÓS ABERTA: USAR EM ATÉ ${r.apos_aberta_h || 24} H  •  ${S.phones}`, 75, 98.8, { align: 'center' });
      } else doc.text(`${S.phones}  •  ${S.address}`, 75, 98.8, { align: 'center' });
    });
    return doc;
  }

  // Compartilhar no WhatsApp: celular abre o seletor com o PDF anexado;
  // no computador baixa o PDF e abre a conversa já com a mensagem.
  /* ---------- ETIQUETA DE TRANSPORTE (lado de fora da caixa de isopor) — 150 x 100 mm ---------- */
  async function etiquetaCaixa(r, S) {
    await loadLogo();
    const doc = newDoc({ unit: 'mm', format: [150, 100], orientation: 'landscape' });
    const lab = (t, x, y) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...WINE_DARK); doc.text(t.toUpperCase(), x, y); };
    const fit = (txt, w, size, min) => { doc.setFontSize(size); while (size > (min || 7) && doc.getTextWidth(txt) > w) { size -= 0.5; doc.setFontSize(size); } };
    doc.setFillColor(...WINE); doc.rect(0, 0, 150, 3.5, 'F');
    doc.addImage(logoData, 'PNG', 6, 7, 17, 17);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...WINE); doc.text('TRANSPORTE DE HEMOCOMPONENTE', 27, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...MUTED); doc.text('ANILAB Laboratório Veterinário • Banco de Sangue', 27, 19);
    doc.setDrawColor(...GOLD); doc.setLineWidth(0.7); doc.line(6, 27, 144, 27);
    const W = 82;
    lab('Destino (hospital / clínica)', 6, 33);
    doc.setFont('helvetica', 'bold'); const dest = String(r.clinica || '—'); fit(dest, W, 15, 9); doc.setTextColor(...INK); doc.text(trunc(doc, dest, W), 6, 40);
    lab('Endereço', 6, 47);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...INK);
    const end = [r.endereco, r.cidade].filter(Boolean).join(' — ') || '—';
    doc.splitTextToSize(end, W).slice(0, 3).forEach((ln, i) => doc.text(ln, 6, 52 + i * 4.4));
    lab('Paciente', 6, 68); doc.setFont('helvetica', 'bold'); fit(String(r.nome_etiqueta || r.receptor || '—'), 38, 12, 8); doc.setTextColor(...INK); doc.text(trunc(doc, String(r.nome_etiqueta || r.receptor || '—'), 38), 6, 73.5);
    lab('Bolsa / componente', 46, 68); doc.setFont('helvetica', 'bold'); const bc = `${r.bolsa_id} • ${r.hemocomponente || ''}`; fit(bc, 44, 9, 6.5); doc.setTextColor(...INK); doc.text(trunc(doc, bc, 44), 46, 73.5);
    lab('Data da saída', 6, 80); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(fmtDate(r.data_saida), 6, 85.5);
    lab('Validade', 46, 80); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...INK); doc.text(fmtVal(r), 46, 85.5);
    doc.setFillColor(...WINE); doc.roundedRect(94, 29, 50, 56, 3, 3, 'F');
    let qrOk = false;
    if (r.qr_url) { try { doc.setFillColor(255, 255, 255); doc.roundedRect(97, 32, 44, 44, 2, 2, 'F'); window.HemoQR.drawPDF(doc, r.qr_url, 97.5, 32.5, 43); qrOk = true; } catch (e) { console.error(e); } }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
    doc.text(qrOk ? 'MOTOBOY: retirada  •  CLÍNICA: recebimento' : 'QR INDISPONÍVEL', 119, 80, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.text('Escaneie com a câmera do celular', 119, 83.6, { align: 'center' });
    doc.setFillColor(...GOLD); doc.rect(0, 89, 150, 0.8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...WINE); doc.text('MANTER ENTRE 2 E 6 °C  •  NÃO CONGELAR  •  FRÁGIL', 75, 94, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6); doc.setTextColor(...MUTED); doc.text(`${S.phones}  •  ${S.address}`, 75, 97.6, { align: 'center' });
    return doc;
  }

  async function enviarWhatsApp(doc, filename, texto, telefone) {
    const blob = doc.output('blob');
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text: texto, title: filename }); return 'share'; }
      catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
    }
    doc.save(filename);
    let tel = String(telefone || '').replace(/\D/g, '');
    if (tel && tel.length <= 11) tel = '55' + tel;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
    return 'fallback';
  }

  window.HemoPDF = { toUpperSafe, etiquetasTubo, _richLines: richLines, _techLayout: techLayout, _closeLaudo: closeLaudo, laudoTipagem, laudoCompat, relatorio, etiquetas, etiquetaSaida, etiquetaCaixa, enviarWhatsApp, fmtDate, pad };
})();
