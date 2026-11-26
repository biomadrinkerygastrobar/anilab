/* Diagnóstico de inicialização: se o app não aparecer em 4 s, mostra o motivo em vez de uma tela em branco. */
(function () {
  var errs = [];
  window.addEventListener('error', function (e) {
    if (e.target && (e.target.src || e.target.href) && e.target !== window) errs.push('não carregou: ' + (e.target.src || e.target.href));
    else errs.push((e.message || 'erro') + (e.filename ? ' (' + String(e.filename).split('/').pop() + ':' + e.lineno + ')' : ''));
  }, true);
  window.addEventListener('load', function () {
    setTimeout(function () {
      var visivel = ['login', 'app', 'trace'].some(function (i) { var el = document.getElementById(i); return el && !el.classList.contains('hidden'); });
      if (visivel || !document.getElementById('app')) return;
      var c = window.ANILAB_CONFIG || window.HEMOVITA_CONFIG, linhas = [];
      if (location.protocol === 'file:') linhas.push('Você abriu o arquivo direto do computador. Abra pelo endereço do site na Vercel (https://…vercel.app).');
      if (!c || !c.SUPABASE_URL) linhas.push('Falta a configuração do Supabase (variáveis SUPABASE_URL e SUPABASE_ANON_KEY na Vercel) — faça um novo deploy.');
      if (!window.supabase) linhas.push('A biblioteca do Supabase não carregou (internet bloqueada, antivírus ou rede da empresa).');
      if (!window.jspdf) linhas.push('A biblioteca de PDF não carregou (internet bloqueada ou rede da empresa).');
      errs.slice(0, 4).forEach(function (m) { linhas.push('Erro técnico: ' + m); });
      if (!linhas.length) linhas.push('Atualize a página (Ctrl+F5). Se continuar em branco, envie uma foto desta tela.');
      var d = document.createElement('div');
      d.setAttribute('style', 'font-family:sans-serif;max-width:560px;margin:40px auto;padding:20px;border:2px solid #183C60;border-radius:12px;background:#fff;color:#14202E');
      var h = document.createElement('h2'); h.textContent = 'O ANILAB não conseguiu iniciar'; h.setAttribute('style', 'margin:0 0 10px;color:#183C60');
      d.appendChild(h);
      linhas.forEach(function (t) { var p = document.createElement('p'); p.textContent = '• ' + t; p.setAttribute('style', 'margin:8px 0'); d.appendChild(p); });
      document.body.appendChild(d);
    }, 4000);
  });
})();
