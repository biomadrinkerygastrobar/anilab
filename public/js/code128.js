/* Código de barras Code 128 (subconjunto B) — gerador próprio, vetorial (sem CDN, nítido em qualquer impressora).
   window.HemoBarcode.modules(texto) -> array de larguras alternadas barra/espaço (em módulos)
   window.HemoBarcode.draw(doc, texto, x, y, w, h) -> desenha em um jsPDF e devolve a largura usada */
(function () {
  const P = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
    '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 ' +
    '112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 ' +
    '111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 ' +
    '411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112').split(' ');
  const START_B = 104, STOP = 106;
  const limpa = (t) => String(t == null ? '' : t).replace(/[^\x20-\x7e]/g, '').slice(0, 40) || '0';
  function codes(texto) {
    const t = limpa(texto), c = [START_B];
    for (const ch of t) c.push(ch.charCodeAt(0) - 32);
    let sum = START_B; for (let i = 1; i < c.length; i++) sum += c[i] * i;
    c.push(sum % 103, STOP);
    return c;
  }
  function modules(texto) { return codes(texto).map((k) => P[k]).join('').split('').map(Number); }
  function draw(doc, texto, x, y, w, h) {
    const m = modules(texto), total = m.reduce((a, b) => a + b, 0) + 20; // 10 módulos de zona de silêncio em cada lado
    const u = w / total; let cx = x + 10 * u, bar = true;
    doc.setFillColor(0, 0, 0);
    m.forEach((n) => { if (bar) doc.rect(cx, y, n * u, h, 'F'); cx += n * u; bar = !bar; });
    return { modulo: u, texto: limpa(texto) };
  }
  window.HemoBarcode = { codes, modules, draw, limpa, _table: P };
})();
