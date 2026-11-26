/* ANILAB Banco de Sangue — aplicação (sem inline scripts, compatível com a CSP) */
(function () {
  'use strict';
  const CFG = window.ANILAB_CONFIG || window.HEMOVITA_CONFIG || {};
  const $ = (s, r = document) => r.querySelector(s);
  const viewEl = $('#view');

  // ---------- utilidades ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"'`]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' }[c])); // item 15
  const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  const monthStart = () => today().slice(0, 8) + '01';
  const fmt = HemoPDF.fmtDate;
  // Caixa alta em tempo real (preserva o cursor). Ignora senha, e-mail, URL, números, datas, arquivos e campos data-keep.
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    if (t.tagName === 'INPUT' && !['text', 'search', 'tel', ''].includes((t.getAttribute('type') || '').toLowerCase())) return;
    if (t.hasAttribute('data-keep') || t.id === 'lEmail' || t.id === 'lPass' || t.getAttribute('inputmode') === 'url') return;
    const v = t.value, u = v.toUpperCase();
    if (v === u) return;
    let a = null, b = null; try { a = t.selectionStart; b = t.selectionEnd; } catch (_) {}
    t.value = u;
    if (a !== null) try { t.setSelectionRange(a, b); } catch (_) {}
  }, true);
  const up = (v, max = 100) => clean(v, max).toUpperCase(); // regra global: texto livre sempre em CAIXA ALTA
  const clean = (v, max = 100) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max); // item 14
  const badNums = (d) => ['peso', 'hematocrito'].some((k) => d[k] && !/^\d{1,3}([.,]\d{1,2})?$/.test(d[k]));
  const toNum = (v) => { v = String(v || '').trim().replace(',', '.'); return v === '' ? null : Number(v); };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const digits = (v) => String(v || '').replace(/\D/g, '');

  let toastT;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 3600);
  }
  const fail = (e) => { console.error(e); toast('Erro: ' + (e && e.message ? e.message : 'tente novamente'), true); };

  const configError = (msg) => {
    document.body.innerHTML = '<div style="font-family:sans-serif;max-width:560px;margin:40px auto;padding:20px;border:2px solid #183C60;border-radius:12px;background:#fff;color:#14202E"><h2 style="margin:0 0 10px;color:#183C60">O ANILAB não conseguiu iniciar</h2><p style="margin:8px 0">' + esc(msg) + '</p></div>';
  };
  const supabaseUrl = String(CFG.SUPABASE_URL || '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  const supabaseKey = String(CFG.SUPABASE_ANON_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!supabaseUrl || !supabaseKey) {
    configError('Configuração ausente. Defina SUPABASE_URL e SUPABASE_ANON_KEY na Vercel e faça um novo deploy.');
    return;
  }
  if (!/^https?:\/\/[^\s/]+$/i.test(supabaseUrl)) {
    configError('A variável SUPABASE_URL na Vercel está inválida. Ela deve ser o endereço do projeto, no formato https://xxxx.supabase.co. Corrija e faça um novo deploy.');
    return;
  }
  if (!window.supabase || !window.supabase.createClient) {
    configError('A biblioteca do Supabase não carregou (internet bloqueada, antivírus ou rede da empresa). Atualize a página.');
    return;
  }
  let sb;
  try {
    sb = window.supabase.createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
  } catch (e) {
    console.error(e);
    configError('Não foi possível conectar ao Supabase: ' + ((e && e.message) || 'configuração inválida') + '. Confira SUPABASE_URL e SUPABASE_ANON_KEY na Vercel.');
    return;
  }

  let S = { vet_name: 'Emanuel Araújo', crmv: 'CRMV-MG 14396', mapa: '38575/2017', address: 'R. Padre Rolim, 815 - Santa Efigênia, Belo Horizonte - MG, 30130-090', phones: '(31) 3395-3633', email: 'contato@laboratorioanilab.com.br', signature: null, site_url: '' };
  const COMPONENTES = ['Concentrado de hemácias', 'Sangue total', 'Plasma', 'Plaquetas'];
  const L = window.HemoLogic;
  let editBolsa = null, editLaudo = null, editSaida = null; // registro em edição (preenche o formulário)
  const PRODUTOS = L.PRODUTOS;
  const BOLSA_COLS = 'id,bolsa_id,hemocomponente,solucao,tipagem,especie,hematocrito,volume_g,validade,validade_em,status';
  const fmtDT = (iso) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const valChip = (b) => { const st = L.statusVal(b.validade, b.validade_em); return st ? `<span class="chip ${st.cls === 'ok' ? 'ok' : st.cls === 'warn' ? 'gold' : 'bad'}">${esc(st.txt)}</span>` : ''; };
  const alertBox = (kind, text) => `<div class="alert ${kind}" role="alert">${esc(text)}</div>`;
  const SAIDA_COLS = 'id,data_saida,receptor,sexo,raca,veterinario,tutor,clinica,bolsa_id,hemocomponente,tipagem_bolsa,especie,data_origem,validade,validade_em,nome_etiqueta,origem,cidade,tipagem_receptor,observacoes,teste_tipagem,compatibilidade,responsavel,entregue_em,recebido_por,temp_chegada,endereco,motorista,retirada_em,recebimento_status,recebimento_obs';
  const NAO_TIPADA = 'Não tipada';
  const TIPOS = { Canino: ['DEA-1 Positivo', 'DEA-1 Negativo'], Felino: ['Tipo A', 'Tipo B', 'Tipo AB'] };
  const tipOpts = (esp, cur) => [NAO_TIPADA, ...(TIPOS[esp] || []), ...(cur && cur !== NAO_TIPADA && !(TIPOS[esp] || []).includes(cur) && cur !== '—' ? [cur] : [])]
    .map((o) => `<option ${o === (cur === '—' ? NAO_TIPADA : cur) ? 'selected' : ''}>${esc(o)}</option>`).join('');
  const opts = (arr, sel) => arr.map((o) => `<option ${o === sel ? 'selected' : ''}>${esc(o)}</option>`).join('');
  const val = (id) => { const e = $('#' + id); return e ? e.value : ''; };

  // ---------- histórico de alterações ----------
  const CAMPOS = { bolsa_id: 'ID da bolsa', hemocomponente: 'Hemocomponente', solucao: 'Solução', sistema_aberto: 'Sistema aberto', especie: 'Espécie', tipagem: 'Tipagem', data_coleta: 'Data da coleta', validade: 'Validade', validade_em: 'Validade (data/hora)', origem: 'Origem', doador: 'Doador', tutor: 'Tutor', hematocrito: 'Hematócrito', volume_g: 'Volume (g)', status: 'Status', observacoes: 'Observações', animal: 'Animal', raca: 'Raça', responsavel: 'Responsável', telefone: 'WhatsApp', data_exame: 'Data do exame', tipo: 'Tipo', receptor: 'Receptor', sexo: 'Sexo', veterinario: 'Veterinário (clínica)', clinica: 'Clínica / hospital', cidade: 'Cidade', data_saida: 'Data da saída', tipagem_bolsa: 'Tipagem da bolsa', tipagem_receptor: 'Tipagem do receptor', data_origem: 'Data da coleta', nome_etiqueta: 'Nome na mensagem', teste_tipagem: 'Teste de tipagem feito', endereco: 'Endereço do hospital / clínica', entregue_em: 'Chegada ao hospital', recebido_por: 'Recebido por', temp_chegada: 'Temperatura na chegada (°C)', motorista: 'Motorista', retirada_em: 'Retirada pelo motorista', recebimento_status: 'Status do recebimento', recebimento_obs: 'Obs. do recebimento', compatibilidade: 'Compatibilidade feita',
    'dados.idade': 'Idade', 'dados.peso': 'Peso (kg)', 'dados.hematocrito': 'Hematócrito', 'dados.resultado': 'Resultado', 'dados.teste': 'Teste', 'dados.lote': 'Lote', 'dados.doador': 'Doador', 'dados.bolsa_id': 'ID da bolsa', 'dados.hemocomponente': 'Hemocomponente', 'dados.autoaglutinacao': 'Autoaglutinação', 'dados.prova_maior': 'Prova maior', 'dados.prova_menor': 'Prova menor', 'dados.compatibilidade': 'Conclusão', 'dados.orientacao': 'Orientação' };
  const IGNORAR = new Set(['id', 'created_at', 'created_by', 'numero', 'updated_at']);
  const achatar = (o, pre = '') => { const out = {}; Object.entries(o || {}).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, achatar(v, pre + k + '.')); else out[pre + k] = v; }); return out; };
  const fv = (v) => (v == null || v === '' ? '—' : v === true ? 'Sim' : v === false ? 'Não' : String(v).length > 80 ? String(v).slice(0, 80) + '…' : String(v));
  const diffRegistro = (a, d) => { const A = achatar(a), D = achatar(d); return [...new Set([...Object.keys(A), ...Object.keys(D)])].filter((k) => !IGNORAR.has(k) && JSON.stringify(A[k]) !== JSON.stringify(D[k])).map((k) => `<li><b>${esc(CAMPOS[k] || k)}</b>: ${esc(fv(A[k]))} → ${esc(fv(D[k]))}</li>`).join(''); };
  async function mostrarHistorico(tabela, id, titulo) {
    const { data, error } = await sb.rpc('fn_historico', { p_tabela: tabela, p_registro: id });
    if (error) return fail(error);
    const ACAO = { INSERT: 'Criado', UPDATE: 'Alterado', DELETE: 'Excluído' };
    $('#hmTitle').textContent = titulo;
    $('#hmBody').innerHTML = !(data || []).length ? empty('Nenhuma alteração registrada para este item (o histórico começa a valer após a atualização do banco).')
      : data.map((h) => `<div class="hist"><div><b>${esc(ACAO[h.acao] || h.acao)}</b> <span class="muted">${esc(fmtDT(h.at))} • ${esc(h.usuario)}</span></div>${h.acao === 'UPDATE' ? `<ul>${diffRegistro(h.antes, h.depois) || '<li class="muted">Sem diferença nos campos exibidos.</li>'}</ul>` : ''}</div>`).join('');
    $('#hm').classList.remove('hidden');
  }
  const closeHist = () => $('#hm').classList.add('hidden');
  $('#hmClose').addEventListener('click', closeHist);
  $('#hm').addEventListener('click', (e) => { if (e.target.id === 'hm') closeHist(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeHist(); });

  // ---------- pré-visualização de PDF (etiquetas) ----------
  let pvUrl = null, pvDoc = null, pvName = '';
  function closePreview() { $('#pv').classList.add('hidden'); $('#pvFrame').src = 'about:blank'; if (pvUrl) URL.revokeObjectURL(pvUrl); pvUrl = null; pvDoc = null; }
  function preview(doc, name, title) {
    closePreview(); pvDoc = doc; pvName = name;
    pvUrl = URL.createObjectURL(doc.output('blob'));
    const inline = navigator.pdfViewerEnabled !== false && !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
    $('#pvFrame').classList.toggle('hidden', !inline); $('#pvNo').classList.toggle('hidden', inline);
    $('#pvFrame').src = inline ? pvUrl + '#toolbar=0&navpanes=0&view=Fit' : 'about:blank';
    try { const f = new File([doc.output('blob')], pvName, { type: 'application/pdf' }); $('#pvShare').classList.toggle('hidden', !(navigator.canShare && navigator.canShare({ files: [f] }))); } catch (e) { $('#pvShare').classList.add('hidden'); }
    $('#pvTitle').textContent = title || 'Pré-visualização'; $('#pv').classList.remove('hidden'); $('#pvPrint').focus();
  }
  $('#pvClose').addEventListener('click', closePreview);
  $('#pv').addEventListener('click', (e) => { if (e.target.id === 'pv') closePreview(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#pv').classList.contains('hidden')) closePreview(); });
  $('#pvSave').addEventListener('click', () => { if (pvDoc) pvDoc.save(pvName); });
  $('#pvShare').addEventListener('click', async () => { if (!pvDoc) return; try { await navigator.share({ files: [new File([pvDoc.output('blob')], pvName, { type: 'application/pdf' })], title: pvName }); } catch (e) { if (!e || e.name !== 'AbortError') toast('Não foi possível compartilhar. Use Baixar PDF.', true); } });
  $('#pvOpen').addEventListener('click', () => { if (pvUrl) window.open(pvUrl, '_blank'); });
  $('#pvPrint').addEventListener('click', () => {
    try { const f = $('#pvFrame').contentWindow; f.focus(); f.print(); } catch (err) { if (pvUrl) window.open(pvUrl, '_blank'); toast('Imprima pela nova aba (Ctrl+P).'); }
  });

  // ---------- login (itens 6, 10, 11, 12) ----------
  const LOCK_KEY = 'hv_lock';
  function lockState() { try { return JSON.parse(localStorage.getItem(LOCK_KEY)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } }
  $('#loginForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const msg = $('#loginMsg'); msg.textContent = '';
    if ($('#lWebsite').value) return; // bot
    const st = lockState();
    if (st.until > Date.now()) { msg.textContent = `Muitas tentativas. Aguarde ${Math.ceil((st.until - Date.now()) / 60000)} min.`; return; }
    const email = clean($('#lEmail').value, 120), pass = $('#lPass').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || pass.length < 8) { msg.textContent = 'Informe e-mail e senha válidos.'; return; }
    const btn = ev.submitter; btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email, password: pass });
    btn.disabled = false;
    if (error) {
      st.n += 1; if (st.n >= 5) { st.until = Date.now() + 5 * 60000; st.n = 0; }
      localStorage.setItem(LOCK_KEY, JSON.stringify(st));
      msg.textContent = 'E-mail ou senha incorretos.';
    } else { localStorage.removeItem(LOCK_KEY); $('#lPass').value = ''; }
  });

  async function publicTrace(token) {
    $('#login').classList.add('hidden'); $('#app').classList.add('hidden');
    const root = $('#trace'); root.classList.remove('hidden'); document.title = 'Rastreio da bolsa — ANILAB';
    const logo = `<img src="${esc(window.ANILAB_LOGO_DATA || 'img/anilab.png')}" alt="ANILAB" class="trace-logo">`;
    root.innerHTML = `<div class="trace-wrap"><div class="trace-head">${logo}</div><p class="muted center">Consultando…</p></div>`;
    let data = null, err = null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) { const r = await sb.rpc('fn_rastreio', { p_token: token }); data = r.data; err = r.error; }
    if (!data) { root.innerHTML = `<div class="trace-wrap"><div class="trace-head">${logo}</div><div class="card"><h2>Código não reconhecido</h2><p class="muted" style="margin-top:8px">${err ? 'Não foi possível consultar agora. Tente novamente em instantes.' : 'Esta etiqueta não corresponde a nenhuma bolsa do ANILAB. Confira se o QR code está íntegro.'}</p></div></div>`; return; }
    const b = data.bolsa, dt = (iso) => (iso ? fmtDT(iso) : '—'), dd = (d) => (d ? fmt(d) : '—');
    const st = L.statusVal(b.validade, b.validade_em), stat = ({ disponivel: ['Disponível', 'ok'], enviada: ['Enviada', 'wine'], retornou: ['Retornou', 'gold'], reservada: ['Reservada', 'wine'], suspensa: ['Suspensa', 'bad'], descartada: ['Descartada', 'bad'] })[b.status] || [b.status, 'wine'];
    const tip = !b.tipagem || b.tipagem === '—' || b.tipagem === NAO_TIPADA ? null : b.tipagem;
    const step = (state, titulo, quando, linhas) => `<li class="tl ${state}"><span class="dot"></span><div class="tl-body"><div class="tl-t"><b>${esc(titulo)}</b>${quando ? `<span class="tl-when">${esc(quando)}</span>` : ''}</div>${(linhas || []).filter(Boolean).map((x) => `<div class="tl-l">${x}</div>`).join('')}</div></li>`;
    const kv = (k, v) => (v == null || v === '' ? '' : `<span class="muted">${esc(k)}:</span> ${esc(v)}`);
    const pre = [
      step('done', 'Coleta', dd(b.data_coleta), [kv('Origem', b.origem), kv('Solução', b.solucao), b.sistema_aberto ? '<span class="chip bad">Sistema aberto</span>' : '']),
      step('done', 'Entrada no banco de sangue', dt(b.entrada_em), [kv('Volume', b.volume_g != null ? b.volume_g + ' g' : ''), kv('Hematócrito', b.hematocrito != null ? b.hematocrito + ' %' : ''), kv('Validade calculada', b.validade_em ? fmtDT(b.validade_em) : dd(b.validade))]),
    ].join('');
    const comp = (data.compat || []).map((c) => { const ok = c.resultado === 'COMPATÍVEL', ruim = c.resultado === 'INCOMPATÍVEL'; return step(ok ? 'done' : ruim ? 'bad' : 'warn', `Prova de compatibilidade${c.numero ? ' (laudo nº ' + HemoPDF.pad(c.numero) + ')' : ''}`, dd(c.data), [`<b>${esc(c.resultado || '—')}</b>`, kv('Autoaglutinação', String(c.autoaglutinacao || '').replace('AUTOAGLUTINAÇÃO ', ''))]); }).join('');
    const ana = [
      tip ? step('done', 'Tipagem sanguínea', dt(data.tipagem_em), [`<b>${esc(tip)}</b>`]) : step('pend', 'Tipagem sanguínea', '', ['Pendente — bolsa ainda não tipada']),
      comp || step('pend', 'Prova de compatibilidade', '', ['Nenhuma prova registrada para esta bolsa']),
    ].join('');
    const sds = data.saidas || [];
    const tempTxt = (t) => String(t).replace('.', ',') + ' °C';
    const pos = sds.length ? sds.map((s, k) => {
      const ult = k === sds.length - 1, prob = s.recebimento_status === 'PROBLEMA';
      return [
        step('done', 'Saída do banco de sangue', dd(s.data), [kv('Paciente', s.paciente), kv('Hospital / clínica', s.clinica), s.endereco ? `<span class="muted">Endereço:</span> ${esc(s.endereco)}${s.cidade ? ' — ' + esc(s.cidade) : ''} <a class="trace-map" target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.endereco + (s.cidade ? ', ' + s.cidade : ''))}">Ver no mapa</a>` : '']),
        s.retirada_em ? step('done', 'Retirada pelo motorista', dt(s.retirada_em), [kv('Motorista', s.motorista)]) : step(ult && !s.entregue_em ? 'now' : 'pend', 'Retirada pelo motorista', '', ['Aguardando retirada']),
        s.entregue_em ? step(prob ? 'bad' : 'done', 'Recebimento na clínica', dt(s.entregue_em), [prob ? '<span class="chip bad">Problema relatado</span>' : '<span class="chip ok">Recebido — OK</span>', kv('Recebido por', s.recebido_por), s.temp_chegada != null ? kv('Temperatura na chegada', tempTxt(s.temp_chegada)) : '', kv('Observação', s.recebimento_obs)]) : step('pend', 'Recebimento na clínica', '', ['Aguardando confirmação da clínica']),
      ].join('');
    }).join('') : step('pend', 'Saída do banco de sangue', '', ['Bolsa ainda em estoque — sem saída registrada']);
    let logado = false; try { const gs = await sb.auth.getSession(); logado = !!(gs && gs.data && gs.data.session); } catch (e) { /* visitante */ }
    const bidq = encodeURIComponent(b.bolsa_id), pode = ['disponivel', 'reservada'].includes(b.status);
    const equipe = !logado ? '' : `<section class="card fase"><h2>Equipe ANILAB</h2><p class="muted">Você está logado. Ações rápidas para esta bolsa:</p><div class="actions">${pode ? `<a class="btn primary" href="?go=saida&b=${bidq}">Registrar saída desta bolsa</a>` : ''}${sds.length ? `<a class="btn ghost" href="?go=caixa&b=${bidq}">Etiqueta da caixa</a>` : ''}<a class="btn ghost" href="${esc(location.pathname)}">Abrir o sistema</a></div></section>`;
    const lembra = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const ultS = sds[sds.length - 1];
    const cardRet = `<section class="card fase" id="acRet"><h2>Sou o motorista</h2><p class="muted">Registre que você retirou esta bolsa no banco de sangue.</p><div class="grid"><label class="full">Seu nome<input id="acMot" maxlength="80" autocomplete="name" value="${esc(lembra('hv_motoboy'))}"></label></div><div class="actions"><button class="btn primary" id="acRetBtn" type="button">Registrar retirada</button></div></section>`;
    const cardRec = `<section class="card fase" id="acRec"><h2>Recebimento na clínica</h2><p class="muted">Confira a bolsa e confirme o recebimento. Esta confirmação só pode ser feita uma vez.</p><div class="grid"><label class="full">Seu nome<input id="acNome" maxlength="80" autocomplete="name" value="${esc(lembra('hv_recebedor'))}"></label><label>Temperatura na chegada (°C) — opcional<input id="acTemp" inputmode="decimal" maxlength="5" placeholder="ex.: 4"></label><label class="full" id="acObsL">Observação (obrigatória se houver problema)<textarea id="acObs" maxlength="300"></textarea></label></div><p class="muted" id="acAv" style="color:var(--bad)" hidden></p><div class="actions"><button class="btn ok-btn" id="acOk" type="button">OK — recebi a bolsa</button><button class="btn bad-btn" id="acBad" type="button">Há problema</button></div></section>`;
    const acao = !ultS || ultS.entregue_em ? '' : !ultS.retirada_em ? cardRet + cardRec : cardRec;
    const fase = (n, titulo, sub, corpo) => `<section class="card fase"><div class="fase-h"><span class="fase-n">${n}</span><div><h2>${esc(titulo)}</h2><span class="muted">${esc(sub)}</span></div></div><ol class="tl-list">${corpo}</ol></section>`;
    root.innerHTML = `<div class="trace-wrap">
      <div class="trace-head">${logo}<span class="muted">Rastreabilidade da bolsa</span></div>
      <section class="card trace-sum">
        <div class="trace-id">${esc(b.bolsa_id)}</div>
        <div class="trace-chips"><span class="chip ${stat[1]}">${esc(stat[0])}</span>${st ? `<span class="chip ${st.cls === 'ok' ? 'ok' : st.cls === 'warn' ? 'gold' : 'bad'}">${esc(st.txt)}</span>` : ''}</div>
        <dl class="trace-dl"><div><dt>Hemocomponente</dt><dd>${esc(b.hemocomponente)}</dd></div><div><dt>Espécie</dt><dd>${esc(b.especie)}</dd></div><div><dt>Tipagem</dt><dd>${esc(tip || 'Não tipada')}</dd></div><div><dt>Validade</dt><dd>${esc(b.validade_em ? fmtDT(b.validade_em) : dd(b.validade))}</dd></div></dl>
      </section>
      ${fase(1, 'Fase pré-analítica', 'Coleta e recebimento da bolsa', pre)}
      ${fase(2, 'Fase analítica', 'Tipagem e provas de compatibilidade', ana)}
      ${fase(3, 'Fase pós-analítica', 'Saída, transporte e recebimento na clínica', pos)}
      ${acao}
      ${equipe}
      <p class="muted trace-foot">Consulta pública: não exibe nomes de doadores, tutores ou veterinários. Não substitui os laudos oficiais.</p>
    </div>`;
    const rec = async (fn, args, msg) => {
      const r = await sb.rpc(fn, args);
      if (r.error || !r.data || !r.data.ok) { alert((r.data && r.data.erro) || 'Não foi possível registrar agora. Tente novamente.'); return; }
      alert(msg); publicTrace(token);
    };
    const bRet = document.getElementById('acRetBtn');
    if (bRet) bRet.addEventListener('click', () => { const n = document.getElementById('acMot').value.trim(); if (n.length < 2) return alert('Informe seu nome.'); try { localStorage.setItem('hv_motoboy', n); } catch (e) { /* ignora */ } bRet.disabled = true; rec('fn_registrar_retirada', { p_token: token, p_motorista: n }, 'Retirada registrada.').then(() => { bRet.disabled = false; }); });
    const bOk = document.getElementById('acOk'), bBad = document.getElementById('acBad');
    if (bOk) {
      const dados = (status) => {
        const n = document.getElementById('acNome').value.trim(), t = document.getElementById('acTemp').value.trim().replace(',', '.'), o = document.getElementById('acObs').value.trim();
        if (n.length < 2) { alert('Informe seu nome.'); return null; }
        try { localStorage.setItem('hv_recebedor', n); } catch (e) { /* ignora */ }
        const tn = t === '' ? null : Number(t);
        if (tn !== null && (Number.isNaN(tn) || tn < -30 || tn > 50)) { alert('Temperatura inválida (use graus, ex.: 4 ou 4,5).'); return null; }
        if (status === 'PROBLEMA' && !o) { document.getElementById('acObsL').hidden = false; alert('Descreva o problema encontrado.'); return null; }
        return { p_token: token, p_nome: n, p_status: status, p_temp: tn, p_obs: o || null };
      };
      const aviso = () => { const t = Number(document.getElementById('acTemp').value.trim().replace(',', '.')), av = document.getElementById('acAv'); const fora = document.getElementById('acTemp').value.trim() !== '' && !Number.isNaN(t) && (t < 2 || t > 6); av.hidden = !fora; av.textContent = fora ? 'Temperatura fora da faixa de 2 a 6 °C. Se confirmar OK, descreva no campo de observação ou use "Há problema".' : ''; };
      document.getElementById('acTemp').addEventListener('input', aviso);
      bOk.addEventListener('click', () => { const d = dados('OK'); if (!d) return; bOk.disabled = true; rec('fn_confirmar_recebimento', d, 'Recebimento confirmado. Obrigado!').then(() => { bOk.disabled = false; }); });
      bBad.addEventListener('click', () => { const d = dados('PROBLEMA'); if (!d) return; bBad.disabled = true; rec('fn_confirmar_recebimento', d, 'Problema registrado. O banco de sangue será avisado.').then(() => { bBad.disabled = false; }); });
    }
  }
  async function logout() { await sb.auth.signOut(); }
  // segurança: encerra a sessão após 30 min sem uso (computador compartilhado na clínica/laboratório)
  let idleT; const IDLE_MS = 30 * 60 * 1000;
  const armIdle = () => { clearTimeout(idleT); idleT = setTimeout(async () => { if (!window.__sessaoAtiva) return; await logout(); const m = $('#loginMsg'); if (m) m.textContent = 'Sessão encerrada por inatividade.'; }, IDLE_MS); };
  ['click', 'keydown', 'touchstart', 'mousemove'].forEach((ev) => document.addEventListener(ev, armIdle, { passive: true }));
  window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); toast('Algo deu errado. Tente novamente.', true); });
  window.addEventListener('offline', () => toast('Sem conexão com a internet. Aguarde antes de salvar.', true));
  window.addEventListener('online', () => toast('Conexão restabelecida.'));
  $('#logout').addEventListener('click', logout);

  // ---------- RASTREIO PÚBLICO (QR da etiqueta) ----------
  const baseUrl = () => { const u = String(S.site_url || '').trim().replace(/\/+$/, ''); return /^https:\/\//.test(u) ? u + '/' : location.href.split(/[?#]/)[0]; };
  const traceUrl = (token) => (token ? `${baseUrl()}?r=${token}` : '');
  const avisoQr = () => { if (!/^https:/.test(baseUrl())) toast('Atenção: este QR aponta para um endereço local e NÃO abre em outro celular. Use o site publicado ou preencha o endereço em Ajustes.', true); };
  const RT = new URLSearchParams(location.search).get('r');
  if (RT) { publicTrace(RT); return; }

  let started = false;
  sb.auth.onAuthStateChange((_ev, session) => {
    if (!session) { started = false; window.__sessaoAtiva = false; return showLogin(); }
    if (started) return; started = true; window.__sessaoAtiva = true; armIdle();           // ignora renovações de token (não apaga formulários)
    setTimeout(start, 0);                           // evita chamar o Supabase dentro do callback
  });
  function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }
  async function start() {
    $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
    let { data, error } = await sb.from('settings').select('vet_name,crmv,mapa,address,phones,email,signature,site_url').eq('id', 1).maybeSingle();
    if (error) ({ data } = await sb.from('settings').select('vet_name,crmv,mapa,address,phones,email,signature').eq('id', 1).maybeSingle()); // banco ainda sem a coluna nova
    if (data) S = { ...S, ...data };
    const q = new URLSearchParams(location.search), dl = q.get('go'), bid = q.get('b');   // links do QR para a equipe logada
    if (dl && bid) {
      history.replaceState(null, '', location.pathname);
      if (dl === 'saida') { prefillSaida = bid; return go('saidas'); }
      if (dl === 'caixa') {
        go('saidas');
        const { data: sx } = await sb.from('saidas').select(SAIDA_COLS).eq('bolsa_id', bid).order('data_saida', { ascending: false }).order('created_at', { ascending: false }).limit(1);
        return sx && sx[0] ? etiquetaCaixa(sx[0]) : toast('Esta bolsa ainda não tem saída registrada.', true);
      }
    }
    go(current);
  }

  // ---------- navegação ----------
  let current = 'painel';
  $('#nav').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) go(b.dataset.view); });
  function go(v) {
    current = v;
    document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
    viewEl.innerHTML = '<p class="muted" id="carregando" style="padding:20px">Carregando…</p>';
    const falhou = (e) => { if (e) console.error(e); if (!$('#carregando')) return; viewEl.innerHTML = `<div class="card"><h2>Não foi possível carregar esta tela</h2><p class="muted" style="margin:8px 0">${esc((e && e.message) || 'O banco de dados não respondeu como esperado.')}</p><p class="muted">Se você acabou de atualizar o sistema, rode de novo o arquivo <b>supabase/schema.sql</b> no SQL Editor do Supabase e atualize a página. Se continuar, confira a internet e entre de novo.</p><div class="actions"><button class="btn primary" id="recarregar" type="button">Atualizar a página</button></div></div>`; $('#recarregar').addEventListener('click', () => location.reload()); };
    Promise.resolve().then(({ painel, tipagem, compat, pedidos, entradas, saidas, cadastros, historico, config }[v] || painel)).then(() => setTimeout(() => falhou(null), 0), falhou);
    window.scrollTo(0, 0);
  }
  // ---------- CADASTROS (hospitais/clínicas e veterinários) ----------
  let CAD = { cli: [], vet: [] }, editCli = null, editVet = null, prefillSaida = null, ultimaSaida = null;
  async function loadCad() {
    const [a1, b1] = await Promise.all([sb.from('clinicas').select('id,nome,endereco,cidade,telefone').order('nome'), sb.from('veterinarios').select('id,nome,crmv,telefone,clinica_id').order('nome')]);
    CAD = { cli: a1.error ? [] : a1.data || [], vet: b1.error ? [] : b1.data || [] };   // sem a tabela nova (schema antigo): listas vazias, o app segue funcionando
  }
  const norm = (v) => String(v || '').trim().toLowerCase();
  const cadClinica = (nome) => CAD.cli.find((c) => norm(c.nome) === norm(nome));
  const cadVet = (nome) => CAD.vet.find((v) => norm(v.nome) === norm(nome));
  const dlCad = () => `<datalist id="dlCli">${CAD.cli.map((c) => `<option value="${esc(c.nome)}">`).join('')}</datalist><datalist id="dlVet">${CAD.vet.map((v) => `<option value="${esc(v.nome)}">`).join('')}</datalist>`;
  // ao escolher uma clínica/veterinário cadastrados, preenche o restante
  function ligarCadastros(ids) {
    const f = (k) => $('#' + ids[k]);
    f('cli').addEventListener('change', () => { const c = cadClinica(f('cli').value); if (!c) return; f('cli').value = c.nome; if (f('end')) f('end').value = c.endereco; if (f('cid')) f('cid').value = c.cidade || ''; });
    f('vet').addEventListener('change', () => {
      const v = cadVet(f('vet').value); if (!v) return; f('vet').value = v.nome;
      if (f('tel') && !f('tel').value && v.telefone) f('tel').value = v.telefone;
      const c = CAD.cli.find((x) => x.id === v.clinica_id);
      if (c && !f('cli').value.trim()) { f('cli').value = c.nome; f('cli').dispatchEvent(new Event('change')); }
    });
  }
  async function cadastros() {
    const ec = editCli, ev = editVet; editCli = null; editVet = null;
    await loadCad();
    viewEl.innerHTML = head('Cadastros', 'Hospitais, clínicas e médicos veterinários — escolha na hora de registrar pedidos e saídas') + `
    <form id="fc" class="card" novalidate><h2>${ec ? 'Editar hospital / clínica' : 'Novo hospital / clínica'}</h2><div class="grid" style="margin-top:12px">
      <label>Nome do hospital ou clínica<input id="cn" maxlength="100" required></label>
      <label>Telefone<input id="ct" inputmode="tel" maxlength="30" placeholder="(31) 0000-0000"></label>
      <label>Cidade<input id="cc" maxlength="60"></label>
      <label class="full">Endereço completo<input id="ce" maxlength="200" required placeholder="rua, número, bairro"></label>
    </div><div class="actions"><button class="btn primary" id="cs" type="submit">${ec ? 'Salvar alterações' : 'Cadastrar clínica'}</button>${ec ? '<button class="btn ghost" id="cx" type="button">Cancelar</button>' : ''}</div></form>
    <div class="card"><h2>Hospitais e clínicas (${CAD.cli.length})</h2><div id="lc" style="margin-top:10px"></div></div>
    <form id="fv" class="card" novalidate><h2>${ev ? 'Editar médico veterinário' : 'Novo médico veterinário'}</h2><div class="grid" style="margin-top:12px">
      <label>Nome<input id="vn" maxlength="80" required></label>
      <label>CRMV<input id="vc" maxlength="30" placeholder="CRMV-MG 00000"></label>
      <label>WhatsApp (DDD + número)<input id="vt" inputmode="tel" maxlength="20"></label>
      <label>Hospital / clínica<select id="vk"><option value="">— nenhum —</option>${CAD.cli.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}</select></label>
    </div><div class="actions"><button class="btn primary" id="vs" type="submit">${ev ? 'Salvar alterações' : 'Cadastrar veterinário'}</button>${ev ? '<button class="btn ghost" id="vx" type="button">Cancelar</button>' : ''}</div></form>
    <div class="card"><h2>Médicos veterinários (${CAD.vet.length})</h2><div id="lv" style="margin-top:10px"></div></div>`;
    const set = (id, v) => { $('#' + id).value = v ?? ''; };
    if (ec) { set('cn', ec.nome); set('ct', ec.telefone); set('cc', ec.cidade); set('ce', ec.endereco); $('#cx').addEventListener('click', () => cadastros()); }
    if (ev) { set('vn', ev.nome); set('vc', ev.crmv); set('vt', ev.telefone); set('vk', ev.clinica_id); $('#vx').addEventListener('click', () => cadastros()); }
    $('#lc').innerHTML = !CAD.cli.length ? empty('Nenhum hospital ou clínica cadastrado ainda.') : `<div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>Endereço</th><th>Cidade</th><th>Telefone</th><th></th></tr></thead><tbody>${CAD.cli.map((c) => `<tr><td><b>${esc(c.nome)}</b></td><td>${esc(c.endereco)}</td><td>${esc(c.cidade || '—')}</td><td>${esc(c.telefone || '—')}</td><td><div class="row-actions"><button class="btn ghost small" data-ec="${esc(c.id)}">Editar</button><button class="btn ghost small bad-btn" data-dc="${esc(c.id)}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>`;
    $('#lv').innerHTML = !CAD.vet.length ? empty('Nenhum médico veterinário cadastrado ainda.') : `<div class="tbl-wrap"><table><thead><tr><th>Nome</th><th>CRMV</th><th>WhatsApp</th><th>Hospital / clínica</th><th></th></tr></thead><tbody>${CAD.vet.map((v) => { const c = CAD.cli.find((x) => x.id === v.clinica_id); return `<tr><td><b>${esc(v.nome)}</b></td><td>${esc(v.crmv || '—')}</td><td>${esc(v.telefone || '—')}</td><td>${esc(c ? c.nome : '—')}</td><td><div class="row-actions"><button class="btn ghost small" data-ev="${esc(v.id)}">Editar</button><button class="btn ghost small bad-btn" data-dv="${esc(v.id)}">Excluir</button></div></td></tr>`; }).join('')}</tbody></table></div>`;
    $('#fc').addEventListener('submit', async (e) => {
      e.preventDefault();
      const row = { nome: up(val('cn'), 100), endereco: up(val('ce'), 200), cidade: up(val('cc'), 60) || null, telefone: up(val('ct'), 30) || null };
      if (!row.nome || !row.endereco) return toast('Informe o nome e o endereço da clínica.', true);
      const btn = $('#cs'); btn.disabled = true;
      const { error } = await (ec ? sb.from('clinicas').update(row).eq('id', ec.id) : sb.from('clinicas').insert(row));
      btn.disabled = false;
      if (error) return error.code === '23505' ? toast('Já existe uma clínica com esse nome.', true) : fail(error);
      toast(ec ? 'Clínica atualizada.' : 'Clínica cadastrada.'); cadastros();
    });
    $('#fv').addEventListener('submit', async (e) => {
      e.preventDefault();
      const row = { nome: up(val('vn'), 80), crmv: up(val('vc'), 30) || null, telefone: digits(val('vt')) || null, clinica_id: val('vk') || null };
      if (!row.nome) return toast('Informe o nome do veterinário.', true);
      if (row.telefone && !/^[0-9]{10,13}$/.test(row.telefone)) return toast('WhatsApp inválido: use DDD + número.', true);
      const btn = $('#vs'); btn.disabled = true;
      const { error } = await (ev ? sb.from('veterinarios').update(row).eq('id', ev.id) : sb.from('veterinarios').insert(row));
      btn.disabled = false; if (error) return fail(error);
      toast(ev ? 'Veterinário atualizado.' : 'Veterinário cadastrado.'); cadastros();
    });
    const acao = async (e) => {
      const b = e.target.closest('button[data-ec],button[data-dc],button[data-ev],button[data-dv]'); if (!b) return;
      if (b.dataset.ec) { editCli = CAD.cli.find((x) => x.id === b.dataset.ec); window.scrollTo(0, 0); return cadastros(); }
      if (b.dataset.ev) { editVet = CAD.vet.find((x) => x.id === b.dataset.ev); window.scrollTo(0, 0); return cadastros(); }
      const tab = b.dataset.dc ? 'clinicas' : 'veterinarios', id = b.dataset.dc || b.dataset.dv;
      if (!confirm('Excluir este cadastro? Pedidos e saídas já registrados não são alterados.')) return;
      const { error } = await sb.from(tab).delete().eq('id', id); error ? fail(error) : (toast('Cadastro excluído.'), cadastros());
    };
    $('#lc').addEventListener('click', acao); $('#lv').addEventListener('click', acao);
  }

  const head = (t, sub, extra = '') => `<div class="head"><div><h1>${esc(t)}</h1><p class="muted">${esc(sub)}</p></div>${extra}</div>`;
  const chip = (t, c) => `<span class="chip ${c}">${esc(t)}</span>`;
  const empty = (t) => `<div class="empty">${esc(t)}</div>`;

  // ---------- PAINEL ----------
  async function painel() {
    viewEl.innerHTML = head('Painel', 'Visão geral do dia') + '<p class="muted">Carregando…</p>';
    const [b, s2, l] = await Promise.all([
      sb.from('bolsas').select('id,bolsa_id,hemocomponente,solucao,status,especie,tipagem,validade,validade_em').limit(1000),
      sb.from('saidas').select('id,data_saida').gte('data_saida', monthStart()),
      sb.from('laudos').select('id,numero,tipo,animal,responsavel,data_exame,created_at').order('created_at', { ascending: false }).limit(6),
    ]);
    const expOf = (x) => (x.validade_em ? Date.parse(x.validade_em) : x.validade ? L.parse(x.validade).getTime() + 864e5 - 1 : Infinity);
    const ativas = (b.data || []).filter((x) => x.status === 'disponivel' || x.status === 'reservada').map((x) => ({ ...x, st: L.statusVal(x.validade, x.validade_em), exp: expOf(x) }));
    const disp = ativas.filter((x) => x.status === 'disponivel');
    const vencidas = ativas.filter((x) => x.st && x.st.cls === 'bad');
    const vencendo = ativas.filter((x) => x.st && x.st.cls === 'warn').sort((x, y) => x.exp - y.exp);
    const semTip = ativas.filter((x) => !x.tipagem || x.tipagem === NAO_TIPADA || x.tipagem === '—');
    const hoje = (s2.data || []).filter((x) => x.data_saida === today()).length;
    const lista = (arr) => arr.slice(0, 6).map((x) => `<b>${esc(x.bolsa_id)}</b>${x.st ? ' (' + esc(x.st.txt.toLowerCase()) + ')' : ''}`).join(', ') + (arr.length > 6 ? ` e mais ${arr.length - 6}` : '');
    const aviso = (kind, titulo, arr) => arr.length ? `<div class="alert ${kind}"><div><b>${esc(titulo)}</b><br><span style="font-weight:400">${lista(arr)}</span></div><button class="btn ghost small" data-go="entradas">Ver estoque</button></div>` : '';
    // estoque por espécie e tipagem (só bolsas disponíveis e não vencidas)
    const grupos = {};
    ativas.filter((x) => !(x.st && x.st.cls === 'bad')).forEach((x) => {
      const t = !x.tipagem || x.tipagem === '—' ? NAO_TIPADA : x.tipagem, k = `${x.especie}|${t}`;
      const g = (grupos[k] = grupos[k] || { esp: x.especie, tip: t, disp: 0, res: 0, prox: Infinity });
      if (x.status === 'disponivel') g.disp++; else g.res++;
      if (x.exp < g.prox) g.prox = x.exp;
    });
    const linhas = Object.values(grupos).sort((x, y) => (x.esp + x.tip).localeCompare(y.esp + y.tip));
    viewEl.innerHTML = head('Painel', 'Visão geral do dia') + `
      ${aviso('warn', `${vencidas.length} bolsa(s) vencida(s) ainda no estoque — ajuste o status (ex.: descartada)`, vencidas)}
      ${aviso('info', `${vencendo.length} bolsa(s) vencem em até 7 dias`, vencendo)}
      ${aviso('info', `${semTip.length} bolsa(s) ainda sem tipagem`, semTip)}
      <div class="stats">
        <div class="stat"><b>${disp.length}</b><span>Bolsas disponíveis</span></div>
        <div class="stat gold"><b>${vencendo.length}</b><span>Vencem em até 7 dias</span></div>
        <div class="stat"><b>${hoje}</b><span>Saídas hoje</span></div>
        <div class="stat gold"><b>${(s2.data || []).length}</b><span>Saídas no mês</span></div>
      </div>
      <div class="card"><h2>Estoque por tipagem</h2><div style="margin-top:12px">${!linhas.length ? empty('Nenhuma bolsa em estoque.') : `<div class="tbl-wrap"><table><thead><tr><th>Espécie</th><th>Tipagem</th><th>Disponíveis</th><th>Reservadas</th><th>Próximo vencimento</th></tr></thead><tbody>${linhas.map((g) => `<tr><td>${esc(g.esp)}</td><td>${esc(g.tip)}</td><td><b>${g.disp}</b></td><td>${g.res}</td><td>${g.prox === Infinity ? '—' : esc(fmt(new Date(g.prox).toISOString().slice(0, 10)))}</td></tr>`).join('')}</tbody></table></div>`}</div></div>
      <div class="card"><h2>Últimos laudos</h2><div style="margin-top:12px">${laudosTable(l.data || [], false)}</div></div>`;
    viewEl.querySelectorAll('[data-go]').forEach((el) => el.addEventListener('click', () => go(el.dataset.go)));
  }

  // ---------- TIPAGEM ----------
  const TIPAGEM = {
    Canino: { res: ['DEA-1 POSITIVO', 'DEA-1 NEGATIVO'], teste: 'BT (Alvedia Lab Test BT DEA 1)', testes: ['BT (Alvedia Lab Test BT DEA 1)', 'RapidVet Canine'],
      orient: { 'DEA-1 POSITIVO': 'Animal DEA-1 positivo: deve receber sangue DEA-1 positivo ou negativo; como doador, só deve doar para receptor DEA-1 positivo.', 'DEA-1 NEGATIVO': 'Animal DEA-1 negativo: deve receber apenas sangue DEA-1 negativo; como doador, pode doar para receptores DEA-1 positivos ou negativos.' } },
    Felino: { res: ['TIPO A', 'TIPO B', 'TIPO AB'], teste: 'Vet Fast', testes: ['Vet Fast', 'RapidVet Felino'],
      orient: { 'TIPO A': 'Gato tipo A deve receber sangue tipo A.', 'TIPO B': 'Gato tipo B deve receber sangue tipo B (risco de reação grave com sangue tipo A).', 'TIPO AB': 'Gato tipo AB deve receber preferencialmente sangue tipo AB; na ausência, tipo A.' } },
  };
  function tipagem() {
    const el = editLaudo; editLaudo = null;
    viewEl.innerHTML = head(el ? `Editar laudo nº ${HemoPDF.pad(el.numero)}` : 'Laudo de tipagem', el ? 'As alterações ficam registradas no histórico' : 'Preencha os dados e gere o PDF') + `
    <form id="f" class="card" novalidate>
      <div class="grid">
        <label>Animal<input id="animal" maxlength="80" required></label>
        <label>Espécie<select id="especie"><option>Canino</option><option>Felino</option></select></label>
        <label>Raça<input id="raca" maxlength="80"></label>
        <label>Papel do animal (etiqueta do tubo)<select id="papel"><option>RECEPTOR</option><option>DOADOR</option></select></label>
        <label>Idade<input id="idade" maxlength="20" placeholder="ex.: 3 anos"></label>
        <label>Peso (kg)<input id="peso" inputmode="decimal" maxlength="6" placeholder="ex.: 12,5"></label>
        <label>Hematócrito (%)<input id="ht" inputmode="decimal" maxlength="5" placeholder="ex.: 38"></label>
        <label>Responsável (tutor)<input id="resp" maxlength="80" required></label>
        <label>WhatsApp do responsável<input id="tel" inputmode="tel" placeholder="(31) 99999-9999" maxlength="20"></label>
        <label>Data do exame<input id="data" type="date" value="${today()}" required></label>
        <label>Resultado<select id="resultado"></select></label>
        <label>Teste realizado<select id="teste"></select></label>
        <label id="testeOutroL" hidden>Qual teste?<input id="testeOutro" maxlength="80" placeholder="nome do teste"></label>
        <label>Lote do teste<input id="lote" maxlength="40" placeholder="ex.: ALV-C-233"></label>
        <label class="full">Observações<textarea id="obs" maxlength="500"></textarea></label>
      </div>
      <div class="actions"><button class="btn primary" data-a="save">${el ? 'Salvar alterações e gerar PDF' : 'Salvar e gerar PDF'}</button><button class="btn wa" data-a="wa">Salvar e enviar no WhatsApp</button>${el ? '<button class="btn ghost" data-a="cancel">Cancelar</button>' : ''}</div>
    </form>`;
    const OUTRO = 'OUTRO (digitar)';
    const showOutro = () => { $('#testeOutroL').hidden = val('teste') !== OUTRO; };
    const setTeste = (nome) => { const sel = $('#teste'), lista = TIPAGEM[val('especie')].testes; if (nome && !lista.includes(nome)) { sel.value = OUTRO; $('#testeOutro').value = nome; } else sel.value = nome || lista[0]; showOutro(); };
    const fillEsp = () => { const t = TIPAGEM[val('especie')]; $('#resultado').innerHTML = opts(t.res); $('#teste').innerHTML = opts([...t.testes, OUTRO]); $('#testeOutro').value = ''; setTeste(t.teste); };
    $('#teste').addEventListener('change', showOutro);
    $('#especie').addEventListener('change', fillEsp); fillEsp();
    if (el) {
      const d = el.dados || {};
      $('#animal').value = el.animal; $('#especie').value = el.especie; fillEsp(); $('#raca').value = el.raca || ''; $('#idade').value = d.idade || ''; $('#peso').value = d.peso || ''; $('#ht').value = d.hematocrito || '';
      $('#resp').value = el.responsavel; $('#tel').value = el.telefone || ''; $('#data').value = el.data_exame; if (d.papel) $('#papel').value = d.papel; if (d.resultado) $('#resultado').value = d.resultado; if (d.teste) setTeste(d.teste); $('#lote').value = d.lote || ''; $('#obs').value = el.observacoes || '';
    }
    $('#f').addEventListener('click', (e) => { const a = e.target.closest('button[data-a]'); if (!a) return; e.preventDefault(); if (a.dataset.a === 'cancel') return go('historico'); salvarTipagem(a.dataset.a === 'wa', a, el); });
  }
  async function salvarTipagem(wa, btn, el) {
    const row = {
      tipo: 'tipagem', animal: up(val('animal'), 80), especie: val('especie'), raca: up(val('raca'), 80) || null,
      responsavel: up(val('resp'), 80), telefone: digits(val('tel')) || null, data_exame: val('data'), observacoes: up(val('obs'), 500) || null,
      dados: { papel: val('papel') === 'DOADOR' ? 'DOADOR' : 'RECEPTOR', idade: clean(val('idade'), 20), peso: clean(val('peso'), 6), hematocrito: clean(val('ht'), 5), resultado: val('resultado'), teste: val('teste') === 'OUTRO (digitar)' ? (up(val('testeOutro'), 80) || 'NÃO INFORMADO') : val('teste'), lote: up(val('lote'), 40), orientacao: TIPAGEM[val('especie')].orient[val('resultado')] },
    };
    if (!row.animal || !row.responsavel || !row.data_exame) return toast('Preencha animal, responsável e data.', true);
    if (row.telefone && !/^\d{10,13}$/.test(row.telefone)) return toast('WhatsApp inválido (use DDD + número).', true);
    if (badNums(row.dados)) return toast('Peso e hematócrito devem ser números (ex.: 12,5).', true);
    await persistirLaudo(row, wa, btn, el);
  }

  // ---------- COMPATIBILIDADE ----------
  const COMP_COMPAT = ['Concentrado de hemácias', 'Sangue total', 'Plasma fresco', 'Plasma congelado', 'Concentrado de plaquetas'];
  const compDe = (h) => { const u = String(h || '').toUpperCase(); return COMP_COMPAT.find((c) => c.toUpperCase() === u) || (u === 'PLASMA' ? 'Plasma congelado' : u === 'PLAQUETAS' ? 'Concentrado de plaquetas' : COMP_COMPAT[0]); };
  const AUTOS = ['NEGATIVA', 'POSITIVA 1+', 'POSITIVA 2+', 'POSITIVA 3+'];
  const CONCLUSOES = ['COMPATÍVEL', 'INCOMPATÍVEL', 'INCONCLUSIVO'];
  async function compat() {
    const el = editLaudo; editLaudo = null;
    const { data } = await sb.from('bolsas').select('bolsa_id,hemocomponente,especie').in('status', ['disponivel', 'reservada']).order('bolsa_id');
    viewEl.innerHTML = head(el ? `Editar laudo nº ${HemoPDF.pad(el.numero)}` : 'Teste de compatibilidade', el ? 'As alterações ficam registradas no histórico' : 'A conclusão é calculada a partir das provas') + `
    <form id="f" class="card" novalidate>
      <div class="grid">
        <label>Doador / ID da bolsa<input id="bolsa" list="dl" maxlength="40" required placeholder="ex.: 3-ROSA-C"></label>
        <datalist id="dl">${(data || []).map((b) => `<option value="${esc(b.bolsa_id)}">`).join('')}</datalist>
        <label>Hemocomponente<select id="hemo">${opts(COMP_COMPAT)}</select></label>
        <label>Animal receptor<input id="animal" maxlength="80" required></label>
        <label>Espécie<select id="especie"><option>Canino</option><option>Felino</option></select></label>
        <label>Raça<input id="raca" maxlength="80"></label>
        <label>Idade<input id="idade" maxlength="20" placeholder="ex.: 3 anos"></label>
        <label>Peso (kg)<input id="peso" inputmode="decimal" maxlength="6" placeholder="ex.: 12,5"></label>
        <label>Hematócrito (%)<input id="ht" inputmode="decimal" maxlength="5" placeholder="ex.: 38"></label>
        <label>Responsável (tutor)<input id="resp" maxlength="80" required></label>
        <label>WhatsApp do responsável<input id="tel" inputmode="tel" placeholder="(31) 99999-9999" maxlength="20"></label>
        <label>Data do exame<input id="data" type="date" value="${today()}" required></label>
        <label>Autoaglutinação<select id="auto">${opts(AUTOS)}</select></label>
        <label>Prova maior<select id="maior"><option>NEGATIVA</option><option>POSITIVA</option></select></label>
        <label>Prova menor<select id="menor"><option>NEGATIVA</option><option>POSITIVA</option></select></label>
        <label>Conclusão<select id="concl">${opts(CONCLUSOES)}</select></label>
        <div class="full"><div id="aglutAviso" class="alert info" hidden>Autoaglutinação positiva <b>nem sempre</b> significa incompatibilidade: a conclusão não é mais automática. Avalie as provas (maior/menor), a gradação e, se necessário, repita com hemácias lavadas — e escolha a conclusão.</div><div id="conclBox" class="result-box ok">COMPATÍVEL</div></div>
        <label class="full">Observações<textarea id="obs" maxlength="500"></textarea></label>
      </div>
      <div class="actions"><button class="btn primary" data-a="save">${el ? 'Salvar alterações e gerar PDF' : 'Salvar e gerar PDF'}</button><button class="btn gold" data-a="tubos" type="button">Imprimir etiquetas dos tubos (receptor e doador)</button><button class="btn wa" data-a="wa">Salvar e enviar no WhatsApp</button>${el ? '<button class="btn ghost" data-a="cancel">Cancelar</button>' : ''}</div>
    </form>`;
    let manual = false;
    const sugerida = () => { if (val('maior') !== 'NEGATIVA' || val('menor') !== 'NEGATIVA') return 'INCOMPATÍVEL'; return val('auto') === 'NEGATIVA' ? 'COMPATÍVEL' : 'INCONCLUSIVO'; };
    const pinta = () => { const v = val('concl'), c = $('#conclBox'); c.textContent = v; c.className = 'result-box ' + (v === 'COMPATÍVEL' ? 'ok' : v === 'INCOMPATÍVEL' ? 'bad' : 'warn'); $('#aglutAviso').hidden = val('auto') === 'NEGATIVA'; };
    const calc = () => { if (!manual) $('#concl').value = sugerida(); pinta(); return val('concl'); };
    ['auto', 'maior', 'menor'].forEach((i) => $('#' + i).addEventListener('change', () => { manual = false; calc(); }));
    $('#concl').addEventListener('change', () => { manual = true; pinta(); });
    $('#bolsa').addEventListener('change', () => { const b = (data || []).find((x) => String(x.bolsa_id).toUpperCase() === val('bolsa').toUpperCase()); if (b) { $('#hemo').value = compDe(b.hemocomponente); $('#especie').value = b.especie; } });
    if (el) {
      const d = el.dados || {}, pre0 = 'AUTOAGLUTINAÇÃO ';
      $('#bolsa').value = d.bolsa_id || ''; $('#hemo').value = compDe(d.hemocomponente);
      $('#animal').value = el.animal; $('#especie').value = el.especie; $('#raca').value = el.raca || ''; $('#idade').value = d.idade || ''; $('#peso').value = d.peso || ''; $('#ht').value = d.hematocrito || '';
      $('#resp').value = el.responsavel; $('#tel').value = el.telefone || ''; $('#data').value = el.data_exame; $('#obs').value = el.observacoes || '';
      const rd = (id, v) => { const s = String(v || '').replace(pre0, '') || 'NEGATIVA'; if (![...$('#' + id).options].some((o) => o.value === s)) $('#' + id).add(new Option(s, s)); $('#' + id).value = s; };
      rd('auto', d.autoaglutinacao); rd('maior', d.prova_maior); rd('menor', d.prova_menor);
      manual = true; $('#concl').value = CONCLUSOES.includes(d.compatibilidade) ? d.compatibilidade : sugerida(); pinta();
    }
    $('#f').addEventListener('click', (e) => {
      const a = e.target.closest('button[data-a]'); if (!a) return; e.preventDefault();
      if (a.dataset.a === 'cancel') return go('historico');
      if (a.dataset.a === 'tubos') { // imprime os tubos antes de salvar, para identificar as amostras durante a prova
        if (!up(val('bolsa'), 40) || !up(val('animal'), 80)) return toast('Informe a bolsa/doador e o animal receptor.', true);
        return tubosLaudo({ tipo: 'compatibilidade', numero: null, animal: up(val('animal'), 80), especie: val('especie'), responsavel: up(val('resp'), 80), data_exame: val('data'), created_at: new Date().toISOString(), dados: { bolsa_id: up(val('bolsa'), 40) } }, false);
      }
      const ok = calc(), pre = 'AUTOAGLUTINAÇÃO ';
      const row = {
        tipo: 'compatibilidade', animal: up(val('animal'), 80), especie: val('especie'), raca: up(val('raca'), 80) || null,
        responsavel: up(val('resp'), 80), telefone: digits(val('tel')) || null, data_exame: val('data'), observacoes: up(val('obs'), 500) || null,
        dados: { idade: clean(val('idade'), 20), peso: clean(val('peso'), 6), hematocrito: clean(val('ht'), 5), doador: up(val('bolsa'), 40), bolsa_id: up(val('bolsa'), 40), hemocomponente: val('hemo').toUpperCase(), autoaglutinacao: pre + val('auto'), prova_maior: val('maior'), prova_menor: val('menor'), compatibilidade: ok },
      };
      if (!row.animal || !row.responsavel || !row.dados.bolsa_id) return toast('Preencha bolsa, animal e responsável.', true);
      if (row.telefone && !/^\d{10,13}$/.test(row.telefone)) return toast('WhatsApp inválido (use DDD + número).', true);
    if (badNums(row.dados)) return toast('Peso e hematócrito devem ser números (ex.: 12,5).', true);
      persistirLaudo(row, a.dataset.a === 'wa', a, el);
    });
  }

  const LAUDO_COLS = 'id,numero,tipo,animal,especie,raca,responsavel,telefone,data_exame,dados,observacoes,created_at';
  async function persistirLaudo(row, wa, btn, el) {
    btn.disabled = true;
    try {
      let res;
      if (el) { const { tipo, ...rest } = row; res = await sb.from('laudos').update(rest).eq('id', el.id).select(LAUDO_COLS).single(); }
      else res = await sb.from('laudos').insert(row).select(LAUDO_COLS).single();
      if (res.error) throw res.error;
      toast(el ? 'Laudo atualizado.' : 'Laudo salvo.');
      await emitir(res.data, wa);
      go('historico');
      if (!el) await tubosLaudo(res.data, true); // etiquetas dos tubos EDTA abrem automaticamente
    } catch (e) { fail(e); } finally { btn.disabled = false; }
  }
  // ---------- ETIQUETAS DOS TUBOS EDTA (50 x 25 mm) ----------
  async function tubosDoLaudo(l) {
    const d = l.dados || {}, pront = l.numero != null ? HemoPDF.pad(l.numero) : '', cod = l.numero != null ? 'T' + HemoPDF.pad(l.numero, 6) : 'T' + new Date().toISOString().replace(/\D/g, '').slice(2, 12), quando = l.created_at || new Date().toISOString(), esp = l.especie;
    if (l.tipo === 'tipagem') return [{ papel: d.papel === 'DOADOR' ? 'DOADOR' : 'RECEPTOR', especie: esp, animal: l.animal, tutor: l.responsavel, prontuario: pront, exame: 'TIPAGEM SANGUÍNEA', quando, codigo: cod }];
    // compatibilidade: 1 tubo do RECEPTOR + 1 tubo por DOADOR/BOLSA do teste
    const ids = [...new Set([d.bolsa_id].concat(Array.isArray(d.bolsas) ? d.bolsas : []).filter(Boolean))];
    const tubos = [{ papel: 'RECEPTOR', especie: esp, animal: l.animal, tutor: l.responsavel, prontuario: pront, exame: 'PROVA MAIOR/MENOR', quando, codigo: cod + '-R' }];
    for (let i = 0; i < ids.length; i++) {
      let b = null; try { const r = await sb.from('bolsas').select('doador,tutor,especie').eq('bolsa_id', ids[i]).maybeSingle(); b = r.data; } catch (e) { /* segue só com o ID da bolsa */ }
      tubos.push({ papel: 'DOADOR', especie: (b && b.especie) || esp, animal: (b && b.doador) || ids[i], tutor: (b && b.tutor) || '', prontuario: ids[i], exame: 'PROVA MAIOR/MENOR', quando, codigo: cod + '-D' + (i + 1) });
    }
    return tubos;
  }
  async function tubosLaudo(l, auto) {
    try {
      const tubos = await tubosDoLaudo(l); const doc = await HemoPDF.etiquetasTubo(tubos, S);
      preview(doc, `TUBOS_${l.animal}_${l.data_exame}.pdf`.replace(/[^\w.\-]+/g, '_'), `${auto ? 'Laudo salvo — ' : ''}${tubos.length} etiqueta(s) de tubo EDTA (50 × 25 mm)`);
    } catch (e) { fail(e); }
  }
  async function emitir(l, wa) {
    const doc = l.tipo === 'tipagem' ? await HemoPDF.laudoTipagem(l, S) : await HemoPDF.laudoCompat(l, S);
    const nome = `${l.tipo === 'tipagem' ? 'TIPAGEM' : 'COMPATIBILIDADE'}_${l.animal}_${l.data_exame}.pdf`.replace(/[^\w.\-]+/g, '_');
    if (wa) {
      const txt = `Olá, ${l.responsavel}! Segue o laudo de ${l.tipo === 'tipagem' ? 'tipagem sanguínea' : 'compatibilidade sanguínea'} de ${l.animal}. — ANILAB Banco de Sangue Veterinário`;
      await HemoPDF.enviarWhatsApp(doc, nome, txt, l.telefone);
    } else doc.save(nome);
  }

  // ---------- HISTÓRICO ----------
  function laudosTable(rows, actions = true) {
    if (!rows.length) return empty('Nenhum laudo ainda.');
    return `<div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Tipo</th><th>Animal</th><th>Responsável</th>${actions ? '<th>Idade / Peso / HT</th>' : ''}<th>Data</th>${actions ? '<th></th>' : ''}</tr></thead><tbody>${rows.map((r) => `
      <tr><td>${HemoPDF.pad(r.numero)}</td><td>${chip(r.tipo === 'tipagem' ? 'Tipagem' : 'Compat.', r.tipo === 'tipagem' ? 'wine' : 'gold')}</td><td>${esc(r.animal)}</td><td>${esc(r.responsavel)}</td>${actions ? `<td>${esc([(r.dados || {}).idade, (r.dados || {}).peso ? r.dados.peso + ' kg' : '', (r.dados || {}).hematocrito ? 'Ht ' + r.dados.hematocrito + '%' : ''].filter(Boolean).join(' • ') || '—')}</td>` : ''}<td>${fmt(r.data_exame)}</td>
      ${actions ? `<td><div class="row-actions"><button class="btn ghost small" data-pdf="${esc(r.id)}">PDF</button><button class="btn wa small" data-wa="${esc(r.id)}">WhatsApp</button><button class="btn ghost small" data-tub="${esc(r.id)}">REIMPRIMIR ETIQUETA</button><button class="btn ghost small" data-edt="${esc(r.id)}">Editar</button><button class="btn ghost small" data-his="${esc(r.id)}">Histórico</button><button class="btn danger small" data-del="${esc(r.id)}">Excluir</button></div></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  }
  async function historico() {
    viewEl.innerHTML = head('Laudos emitidos', 'Reabra o PDF, edite, reenvie ou exclua') + `<div class="filters"><label>Buscar<input id="q" maxlength="60" placeholder="animal ou responsável"></label></div><div id="list"><p class="muted">Carregando…</p></div>`;
    const { data, error } = await sb.from('laudos').select('id,numero,tipo,animal,especie,raca,responsavel,telefone,data_exame,dados,observacoes,created_at').order('created_at', { ascending: false }).limit(300);
    if (error) return fail(error);
    const draw = () => {
      const q = clean(val('q'), 60).toLowerCase();
      const rows = (data || []).filter((r) => !q || (r.animal + ' ' + r.responsavel).toLowerCase().includes(q));
      $('#list').innerHTML = laudosTable(rows);
    };
    $('#q').addEventListener('input', draw); draw();
    $('#list').addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const id = b.dataset.pdf || b.dataset.wa || b.dataset.tub || b.dataset.del || b.dataset.edt || b.dataset.his; const l = data.find((x) => x.id === id); if (!l) return;
      if (b.dataset.tub) return tubosLaudo(l, false);
      if (b.dataset.edt) { editLaudo = l; window.scrollTo(0, 0); return go(l.tipo === 'tipagem' ? 'tipagem' : 'compat'); }
      if (b.dataset.his) return mostrarHistorico('laudos', l.id, `Histórico do laudo nº ${HemoPDF.pad(l.numero)} — ${l.animal}`);
      if (b.dataset.del) {
        if (!confirm(`Excluir o laudo ${HemoPDF.pad(l.numero)} de ${l.animal}?`)) return;
        const { error: er } = await sb.from('laudos').delete().eq('id', id);
        if (er) return fail(er); toast('Laudo excluído.'); return historico();
      }
      b.disabled = true; try { await emitir(l, !!b.dataset.wa); } catch (er) { fail(er); } b.disabled = false;
    });
  }

  // ---------- ENTRADAS ----------
  const ORIGENS = ['CDLV', 'Hemopet', 'Próprio'];
  const STATUS = { disponivel: ['Disponível', 'ok'], enviada: ['Enviada', 'wine'], retornou: ['Retornou', 'gold'], reservada: ['Reservada', 'wine'], suspensa: ['Suspensa', 'bad'], descartada: ['Descartada', 'bad'] };
  async function entradas() {
    const eb = editBolsa; editBolsa = null;
    viewEl.innerHTML = head(eb ? 'Editar bolsa' : 'Entrada de bolsas', eb ? `Alterando ${eb.bolsa_id} — as alterações ficam registradas no histórico` : 'Cadastre as bolsas recebidas ou coletadas — o vencimento é calculado sozinho') + `
    <form id="f" class="card" novalidate><div class="grid">
      <label>ID da bolsa<input id="bid" maxlength="40" required placeholder="ex.: 10-ROSA-C"></label>
      <label class="span2">Tipo de hemocomponente e solução conservante<select id="prod">${PRODUTOS.map((p) => `<option value="${p.k}">${esc(p.label)}</option>`).join('')}</select></label>
      <label>Espécie<select id="esp"><option>Canino</option><option>Felino</option></select></label>
      <label>Tipagem da bolsa<select id="tip"></select></label>
      <label>Data da coleta<input id="dcol" type="date" value="${today()}" required></label>
      <label class="chk"><input type="checkbox" id="aberto"> <span>Sistema aberto / rompido?</span></label>
      <label id="hrWrap" class="hidden">Hora da coleta / abertura<input id="hcol" type="time"></label>
      <label>Origem<input id="org" list="dlo" maxlength="60" required value="CDLV"></label><datalist id="dlo">${ORIGENS.map((o) => `<option value="${o}">`).join('')}</datalist>
      <label>Doador (nome do animal)<input id="doa" maxlength="80"></label>
      <label>Tutor do doador<input id="tutb" maxlength="80"></label>
      <label>Hematócrito (%)<input id="htb" inputmode="decimal" maxlength="5" placeholder="ex.: 42"></label>
      <label>Volume da bolsa (g)<input id="volg" inputmode="decimal" maxlength="7" placeholder="ex.: 250"></label>
      <label>Vencimento manual (opcional)<input id="dman" type="date" title="Preencha só se o vencimento não seguir a regra automática"></label>
      <div class="full"><div id="vpanel"></div></div>
      <label class="full">Observações<textarea id="obs" maxlength="300"></textarea></label>
    </div><div class="actions"><button class="btn primary" id="add">${eb ? 'Salvar alterações' : 'Registrar entrada'}</button>${eb ? '<button class="btn ghost" id="cancelEd" type="button">Cancelar</button>' : ''}</div></form>
    <div class="card"><div class="head"><h2>Estoque e histórico</h2><span class="row-actions"><button class="btn gold small" id="lblAll">Etiquetas das disponíveis</button><button class="btn ghost small" id="relE">Relatório PDF</button></span></div><div id="list"><p class="muted">Carregando…</p></div></div>`;
    const fillTip = () => { $('#tip').innerHTML = tipOpts(val('esp')); };
    $('#esp').addEventListener('change', fillTip); fillTip();
    // vencimento calculado em tempo real (datas locais, sem conversão UTC)
    const painelVal = () => {
      const p = PRODUTOS.find((x) => x.k === val('prod')), aberto = $('#aberto').checked;
      $('#hrWrap').classList.toggle('hidden', !aberto);
      if (aberto && !val('hcol')) { const n = new Date(); $('#hcol').value = `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`; }
      const man = !aberto && val('dman'), base = L.calcValidade(val('dcol'), p, aberto, val('hcol')), v = man ? { date: man, em: null, exp: null } : base, box = $('#vpanel');
      if (!v) { box.innerHTML = '<p class="muted">Informe a data da coleta para calcular o vencimento.</p>'; return null; }
      const st = L.statusVal(v.date, v.em);
      const regra = aberto ? `Sistema aberto/rompido: validade de ${p.h} horas a partir da coleta/abertura` : man ? 'Vencimento informado manualmente' : `${p.dias} dias a partir da coleta`;
      box.innerHTML = `<div class="vbox ${st.cls}"><div><span class="vlabel">Data de vencimento</span><b class="vdate">${esc(aberto ? fmtDT(v.em) : fmt(v.date))}</b><span class="vrule">${esc(regra)}</span></div><div class="vright"><span class="vdays">${esc(st.txt)}</span><span class="pill ${st.cls}">${{ ok: 'Válida', warn: 'Atenção', bad: 'Vencida' }[st.cls]}</span></div></div>`;
      return { p, aberto, v, st };
    };
    ['prod', 'dcol', 'aberto', 'hcol', 'dman'].forEach((i) => { const el = $('#' + i); el.addEventListener('input', painelVal); el.addEventListener('change', painelVal); });
    if (eb) {
      const p2 = (x) => String(x).padStart(2, '0');
      const prod = PRODUTOS.find((x) => x.comp === eb.hemocomponente && x.sol === (eb.solucao || null)) || PRODUTOS.find((x) => x.comp === eb.hemocomponente) || PRODUTOS[0];
      $('#bid').value = eb.bolsa_id; $('#prod').value = prod.k; $('#esp').value = eb.especie; $('#tip').innerHTML = tipOpts(eb.especie, eb.tipagem);
      $('#dcol').value = eb.data_coleta; $('#aberto').checked = !!eb.sistema_aberto;
      if (eb.sistema_aberto && eb.validade_em) { const t = new Date(new Date(eb.validade_em).getTime() - prod.h * 36e5); $('#hcol').value = `${p2(t.getHours())}:${p2(t.getMinutes())}`; }
      $('#org').value = eb.origem; $('#doa').value = eb.doador || ''; $('#tutb').value = eb.tutor || ''; $('#htb').value = eb.hematocrito ?? ''; $('#volg').value = eb.volume_g ?? ''; $('#obs').value = eb.observacoes || '';
      const cv = L.calcValidade(eb.data_coleta, prod, !!eb.sistema_aberto, $('#hcol').value);
      if (!eb.sistema_aberto && eb.validade && (!cv || cv.date !== eb.validade)) $('#dman').value = eb.validade; // bolsa antiga / prazo diferente da regra: preserva
      $('#cancelEd').addEventListener('click', () => entradas());
    }
    painelVal();
    $('#add').addEventListener('click', async (e) => {
      e.preventDefault();
      const calc = painelVal();
      if (!calc) return toast('Informe a data da coleta.', true);
      if (calc.aberto && !val('hcol')) return toast('Informe a hora da coleta/abertura.', true);
      const { p, aberto, v, st } = calc;
      const row = { bolsa_id: up(val('bid'), 40), hemocomponente: p.comp, solucao: p.sol, sistema_aberto: aberto, especie: val('esp'), tipagem: clean(val('tip'), 30) || '—', data_coleta: val('dcol'), origem: up(val('org'), 60), doador: up(val('doa'), 80) || null, tutor: up(val('tutb'), 80) || null, hematocrito: toNum(val('htb')), volume_g: toNum(val('volg')), validade: v.date, validade_em: v.em, observacoes: up(val('obs'), 300) || null };
      if (!row.bolsa_id || !row.data_coleta || !row.origem) return toast('Preencha ID, data e origem.', true);
      if ((row.hematocrito != null && !(row.hematocrito >= 0 && row.hematocrito <= 100)) || (row.volume_g != null && !(row.volume_g > 0 && row.volume_g < 5000))) return toast('Hematócrito (0–100) ou volume inválido.', true);
      if (st.cls === 'bad' && !confirm('Pelas regras, esta bolsa já está vencida. Registrar mesmo assim?')) return;
      if (v.date < row.data_coleta) return toast('O vencimento não pode ser anterior à coleta.', true);
      if (eb && row.bolsa_id !== eb.bolsa_id && !confirm(`Trocar o ID de ${eb.bolsa_id} para ${row.bolsa_id}? Saídas antigas continuam com o ID anterior.`)) return;
      e.target.disabled = true;
      const BCOLS = 'id,bolsa_id,hemocomponente,solucao,tipagem,especie,data_coleta,validade,validade_em,sistema_aberto,origem,doador,tutor,hematocrito,volume_g,observacoes,status,qr_token';
      const { data: salva, error } = eb ? await sb.from('bolsas').update(row).eq('id', eb.id).select(BCOLS).single() : await sb.from('bolsas').insert(row).select(BCOLS).single();
      e.target.disabled = false;
      if (error) return fail(error.code === '23505' ? { message: 'Já existe uma bolsa com esse ID.' } : error);
      toast(eb ? 'Bolsa atualizada.' : 'Entrada registrada. Gerando etiqueta…'); editBolsa = null; await entradas();
      if (!eb && salva) await etiquetas([salva]); // etiqueta oficial (4 quadrantes) abre automaticamente
    });
    const { data, error } = await sb.from('bolsas').select('id,bolsa_id,hemocomponente,solucao,tipagem,especie,data_coleta,validade,validade_em,sistema_aberto,origem,doador,tutor,hematocrito,volume_g,observacoes,status,qr_token').order('created_at', { ascending: false }).limit(400);
    if (error) return fail(error);
    $('#list').innerHTML = !data.length ? empty('Nenhuma bolsa cadastrada.') : `<div class="tbl-wrap"><table class="wide"><thead><tr><th>ID</th><th>Hemocomp.</th><th>Tipagem</th><th>Espécie</th><th>Coleta</th><th>Validade</th><th>Doador / Tutor</th><th>HT %</th><th>Vol. (g)</th><th>Origem</th><th>Status</th><th></th></tr></thead><tbody>${data.map((b) => `
      <tr><td><b>${esc(b.bolsa_id)}</b></td><td>${esc(b.hemocomponente)}${b.solucao ? ' — ' + esc(b.solucao) : ''}${b.sistema_aberto ? ' ' + chip('aberto', 'bad') : ''}</td><td>${b.tipagem === NAO_TIPADA || b.tipagem === '—' ? chip('Pendente', 'gold') + ' ' : ''}<select data-tip="${esc(b.id)}" aria-label="Tipagem da bolsa">${tipOpts(b.especie, b.tipagem)}</select></td><td>${esc(b.especie)}</td><td>${fmt(b.data_coleta)}</td><td>${esc(b.validade_em ? fmtDT(b.validade_em) : fmt(b.validade))}<br>${valChip(b)}</td><td>${esc([b.doador, b.tutor].filter(Boolean).join(' / ') || '—')}</td><td>${b.hematocrito == null ? '—' : esc(String(b.hematocrito).replace('.', ','))}</td><td>${b.volume_g == null ? '—' : esc(String(b.volume_g).replace('.', ','))}</td><td>${esc(b.origem)}</td>
      <td>${chip(...(STATUS[b.status] || [b.status, 'wine']))}</td>
      <td><div class="row-actions"><select data-st="${esc(b.id)}" aria-label="Alterar status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${k === b.status ? 'selected' : ''}>${v[0]}</option>`).join('')}</select> <button class="btn ghost small" data-lbl="${esc(b.id)}">REIMPRIMIR ETIQUETA</button><button class="btn ghost small" data-edt="${esc(b.id)}">Editar</button><button class="btn ghost small" data-his="${esc(b.id)}">Histórico</button></div></td></tr>`).join('')}</tbody></table></div>`;
    $('#list').addEventListener('change', async (e) => { const s = e.target.closest('select[data-st]'); if (!s) return; const { error: er } = await sb.from('bolsas').update({ status: s.value }).eq('id', s.dataset.st); er ? fail(er) : (toast('Status atualizado.'), entradas()); });
    $('#list').addEventListener('change', async (e) => {
      const t = e.target.closest('select[data-tip]'); if (!t) return;
      const { error: er } = await sb.from('bolsas').update({ tipagem: t.value }).eq('id', t.dataset.tip);
      er ? fail(er) : (toast('Tipagem da bolsa atualizada.'), entradas());
    });
    $('#list').addEventListener('click', (e) => { const b = e.target.closest('button[data-lbl]'); const x = b && data.find((v) => v.id === b.dataset.lbl); if (x) etiquetas([x]); });
    $('#list').addEventListener('click', (e) => {
      const ed = e.target.closest('button[data-edt]'), hi = e.target.closest('button[data-his]');
      if (ed) { editBolsa = data.find((v) => v.id === ed.dataset.edt); window.scrollTo(0, 0); entradas(); }
      else if (hi) { const x = data.find((v) => v.id === hi.dataset.his); mostrarHistorico('bolsas', x.id, `Histórico da bolsa ${x.bolsa_id}`); }
    });
    $('#lblAll').addEventListener('click', () => etiquetas(data.filter((b) => b.status === 'disponivel')));
    $('#relE').addEventListener('click', () => relatorioPeriodo('entradas'));
  }

  // ---------- PEDIDOS E LIBERAÇÃO DE BOLSAS ----------
  let editPedido = null, lastResp = '';
  const PED_COLS = 'id,numero,paciente,especie,raca,sexo,peso,ht_atual,ht_alvo,clinica,veterinario,tutor,telefone,tipo_solicitacao,componente,tipagem_paciente,status,bolsa_id,alternativa,resultado,tentativas,saida_id,laudo_id,concluido_em,created_at';
  const PED_BOLSA_COLS = 'id,bolsa_id,hemocomponente,solucao,tipagem,especie,hematocrito,volume_g,validade,validade_em,status,data_coleta,origem';
  const SOL = { tipagem: 'Apenas tipagem', crossmatch: 'Prova de compatibilidade + bolsa', bolsa: 'Bolsa direta' };
  const PED_ST = { aberto: ['Em aberto', 'gold'], concluido: ['Concluído', 'ok'], cancelado: ['Cancelado', 'bad'] };
  Object.assign(CAMPOS, { paciente: 'Paciente', peso: 'Peso (kg)', ht_atual: 'Ht atual (%)', ht_alvo: 'Ht alvo (%)', tipo_solicitacao: 'Tipo de solicitação', componente: 'Componente', tipagem_paciente: 'Tipagem do paciente', alternativa: 'Bolsa alternativa', resultado: 'Resultado', tentativas: 'Provas incompatíveis', concluido_em: 'Concluído em', veterinario: 'Veterinário solicitante' });
  const compRotulo = (v) => (L.COMPONENTES_PEDIDO.find((c) => c.valor === v) || { rotulo: v }).rotulo;

  async function pedidos() {
    const ed = editPedido; editPedido = null;
    await loadCad();
    viewEl.innerHTML = head('Pedidos e liberação de bolsas', 'Cadastre o pedido, escolha a bolsa, registre a prova cruzada e libere — laudo e etiqueta saem prontos') + `
    <form id="f" class="card" novalidate><h2>Novo pedido</h2>
      <div class="grid" style="margin-top:12px">
        <label>Nome do paciente<input id="pn" maxlength="80"></label>
        <label>Espécie<select id="pe"><option>Canino</option><option>Felino</option></select></label>
        <label>Raça<input id="pr" maxlength="80"></label>
        <label>Sexo<select id="ps"><option value="">—</option><option>Macho</option><option>Fêmea</option></select></label>
        <label>Peso do paciente (kg)<input id="pw" inputmode="decimal" maxlength="6" placeholder="ex.: 20"></label>
        <label>Hematócrito atual do paciente (%)<input id="ph" inputmode="decimal" maxlength="5" placeholder="ex.: 15"></label>
        <label>Hematócrito desejado / alvo (%)<input id="pa" inputmode="decimal" maxlength="5" value="30"><small id="pSug" class="ht-hint"></small><small id="pTaco" class="taco-aviso hidden" role="alert"></small></label>
        <label>Tipagem do paciente<select id="ptp"></select></label>
        <label>Hospital / clínica solicitante<input id="pc" list="dlCli" maxlength="100" autocomplete="off"></label>
        <label>Médico veterinário solicitante<input id="pv" list="dlVet" maxlength="80" autocomplete="off"></label>
        <label>Tutor (opcional)<input id="pt" maxlength="80"></label>
        <label>WhatsApp do solicitante (opcional)<input id="pf" inputmode="tel" maxlength="20" placeholder="DDD + número"></label>
      </div>
      <fieldset class="rad"><legend>Tipo de solicitação</legend>
        <label><input type="radio" name="sol" value="tipagem"> Apenas tipagem sanguínea</label>
        <label><input type="radio" name="sol" value="crossmatch" checked> Prova de compatibilidade (crossmatch) + bolsa</label>
        <label><input type="radio" name="sol" value="bolsa"> Solicitação direta de bolsa (tipagem já conhecida)</label></fieldset>
      <fieldset class="rad"><legend>Componente desejado</legend>
        ${L.COMPONENTES_PEDIDO.map((c, i) => `<label><input type="radio" name="cmp" value="${esc(c.valor)}" ${i === 0 ? 'checked' : ''}> ${esc(c.rotulo)}</label>`).join('')}</fieldset>
    </form>
    <div id="pbox"></div><div id="pconc"></div>
    <div class="card"><h2>Pedidos recentes</h2><div id="plist" style="margin-top:12px"><p class="muted">Carregando…</p></div></div>${dlCad()}`;

    let bolsas = [], sel = null, ehAlt = false, pedidoId = null, tentativas = 0, manualAlvo = false, done = null;
    const num = (id) => { const n = toNum(val(id)); return n != null && Number.isFinite(n) ? n : null; };
    const radio = (n) => (document.querySelector(`input[name=${n}]:checked`) || {}).value;
    const okHt = (x) => x != null && x >= 0 && x <= 100;
    const load = async () => { const { data, error } = await sb.from('bolsas').select(PED_BOLSA_COLS).eq('status', 'disponivel').limit(800); if (error) return fail(error); bolsas = data || []; };
    ligarCadastros({ cli: 'pc', vet: 'pv', tel: 'pf' });
    const fillTip = (keep) => { $('#ptp').innerHTML = ['Não tipado', ...TIPOS[val('pe')]].map((o) => `<option>${esc(o)}</option>`).join(''); if (keep) $('#ptp').value = keep; };
    const sugerir = () => { const a = num('ph'); $('#pa').value = okHt(a) ? L.htAlvoSugerido(val('pe'), a) : L.htAlvoPadrao(val('pe')); manualAlvo = false; };

    // ---- leitura/validação do pedido
    const lerPedido = () => {
      const r = { paciente: up(val('pn'), 80), especie: val('pe'), raca: up(val('pr'), 80) || null, sexo: val('ps') || null, peso: num('pw'), ht_atual: num('ph'), ht_alvo: num('pa'),
        clinica: up(val('pc'), 100), veterinario: up(val('pv'), 80), tutor: up(val('pt'), 80) || null, telefone: digits(val('pf')) || null,
        tipo_solicitacao: radio('sol'), componente: radio('cmp'), tipagem_paciente: val('ptp') === 'Não tipado' ? null : val('ptp') };
      if (!r.paciente || !r.clinica || !r.veterinario) { toast('Preencha paciente, hospital/clínica e veterinário solicitante.', true); return null; }
      if (!(r.peso > 0 && r.peso < 200)) { toast('Informe o peso do paciente (0 a 200 kg).', true); return null; }
      if (!okHt(r.ht_atual)) { toast('Informe o hematócrito atual (0 a 100%).', true); return null; }
      if (r.ht_alvo != null && !okHt(r.ht_alvo)) { toast('Hematócrito alvo inválido.', true); return null; }
      if (r.telefone && !/^\d{10,13}$/.test(r.telefone)) { toast('WhatsApp inválido (use DDD + número).', true); return null; }
      return r;
    };

    // ---- painel de estoque
    const resultado = () => {
      const esp = val('pe'), comp = radio('cmp');
      return L.buscarBolsas({ bolsas, esp, comp, pac: val('ptp') });
    };
    const renderBox = () => {
      const box = $('#pbox'); if (done) { box.innerHTML = ''; return; }
      const a = num('ph'), t = num('pa'), kg = num('pw'), esp = val('pe'), comp = radio('cmp'), tipo = radio('sol');
      const alerta = okHt(a) && okHt(t) && L.elevacaoAcentuada(esp, a, t);
      $('#pTaco').classList.toggle('hidden', !alerta); $('#pTaco').textContent = alerta ? 'Atenção: Elevação acentuada de hematócrito exige grande volume. Avalie risco de sobrecarga circulatória (TACO) ou considere fracionar a transfusão.' : '';
      $('#pSug').textContent = !manualAlvo && okHt(a) ? `Sugestão automática (${esp === 'Felino' ? 'gato' : 'cão'}, Ht atual ${String(a).replace('.', ',')}%) — você pode alterar.` : manualAlvo ? 'Valor definido por você.' : '';
      if (tipo === 'tipagem') { box.innerHTML = ''; return; }
      if (!(kg > 0 && kg < 200) || !okHt(a)) { box.innerHTML = `<div class="card">${empty('Informe espécie, peso, hematócrito atual e componente para ver as bolsas disponíveis.')}</div>`; return; }
      // volume de referência
      let ideal = null; const fx = L.faixaReferencia(comp, kg), cards = [];
      if ((comp === 'Concentrado de hemácias' || comp === 'Sangue total') && okHt(t) && t > a) {
        const hb = comp === 'Sangue total' ? 40 : 65; ideal = L.calcVolume(kg, a, t, esp === 'Felino' ? 60 : 90, hb).ideal;
        cards.push(`<div class="stat"><b>${Math.round(ideal)} mL</b><span>Volume estimado pelo hematócrito (bolsa a ${hb}%)</span></div>`);
      }
      if (fx) cards.push(`<div class="stat gold"><b>${fx.mlMin}–${fx.mlMax} mL</b><span>Faixa de referência: ${fx.min}–${fx.max} mL/kg</span></div>`);
      else if (comp === 'Plaquetas') cards.push('<div class="stat gold"><b>—</b><span>Plaquetas: dose conforme protocolo do veterinário</span></div>');
      const { exatas, alternativas, excl } = resultado();
      const linha = (b, alt) => `<tr class="${sel && sel.id === b.id ? 'sug' : ''}"><td><b>${esc(b.bolsa_id)}</b></td><td>${esc(b.tipagem)}</td><td>${esc(b.hemocomponente)}${b.solucao ? ' — ' + esc(b.solucao) : ''}</td><td>${b.ml || '—'}</td><td>${b.hematocrito == null ? '—' : esc(String(b.hematocrito).replace('.', ','))}</td><td>${esc(b.validade_em ? fmtDT(b.validade_em) : fmt(b.validade))} ${valChip(b)}${ideal && b.ml && Math.abs(b.ml - ideal) <= ideal * 0.15 ? ' ' + chip('Volume ideal', 'wine') : ''}${alt ? `<div class="muted" style="font-size:.78rem;color:#9A5A00">${esc(b.motivos.join(' • '))}</div>` : ''}</td><td><button type="button" class="btn ${sel && sel.id === b.id ? 'primary' : 'ghost'} small" data-sel="${esc(b.id)}" data-alt="${alt ? 1 : 0}">${sel && sel.id === b.id ? 'Selecionada' : 'Selecionar'}</button></td></tr>`;
      const tabela = (rows, alt) => `<div class="tbl-wrap"><table><thead><tr><th>Código / lote</th><th>Tipo sanguíneo</th><th>Componente</th><th>Volume (mL)</th><th>Ht bolsa (%)</th><th>Validade</th><th></th></tr></thead><tbody>${rows.map((b) => linha(b, alt)).join('')}</tbody></table></div>`;
      const fora = [excl.vencidas && `${excl.vencidas} vencida(s)`, excl.semTipagem && `${excl.semTipagem} sem tipagem`, excl.gatoIncompat && `${excl.gatoIncompat} de gato com tipo incompatível (nunca oferecidas)`].filter(Boolean);
      box.innerHTML = `${cards.length ? `<div class="stats">${cards.join('')}</div>` : ''}
        ${exatas.length ? `<div class="card"><h2>Bolsas disponíveis (vencimento mais próximo primeiro)</h2><div style="margin-top:12px">${tabela(exatas, false)}</div></div>` : ''}
        ${!exatas.length ? `<div class="alert info" role="alert" style="background:#FFF4D6;border-color:#EBCB9C;color:#8A5A1F">Nenhuma bolsa exata encontrada. Exibindo alternativas compatíveis/disponíveis em estoque.</div>` : ''}
        ${!exatas.length && alternativas.length ? `<div class="card"><h2>Alternativas disponíveis</h2><p class="muted" style="margin:6px 0 12px">Exigem confirmação do veterinário antes da liberação.</p>${tabela(alternativas, true)}</div>` : ''}
        ${!exatas.length && !alternativas.length ? `<div class="card">${empty('Nenhuma bolsa disponível para este pedido.')}</div>` : ''}
        ${fora.length ? `<p class="muted" style="font-size:.82rem">Fora da lista: ${esc(fora.join(' • '))}.</p>` : ''}`;
    };

    // ---- conclusão
    const renderConc = () => {
      const c = $('#pconc'); const tipo = radio('sol'), esp = val('pe');
      if (done) {
        c.innerHTML = `<div class="card sug-card"><h2>${done.tipo === 'tipagem' ? 'Tipagem concluída' : 'Bolsa liberada'}</h2>
          <p style="margin:8px 0">${done.tipo === 'tipagem' ? `Resultado: <b>${esc(done.resultado)}</b> — paciente <b>${esc(done.ped.paciente)}</b>.` : `Bolsa <b>${esc(done.bolsa.bolsa_id)}</b> (${esc(done.bolsa.hemocomponente)}, ${esc(done.bolsa.tipagem)}) vinculada ao pedido nº ${HemoPDF.pad(done.ped.numero)} — <b>${esc(done.ped.paciente)}</b>.`} ${done.alt ? chip('Bolsa alternativa autorizada', 'gold') : ''}</p>
          <div class="actions"><button type="button" class="btn primary" data-act="laudo">Gerar laudo PDF</button>${done.tipo !== 'tipagem' ? '<button type="button" class="btn gold" data-act="etiq">Gerar etiqueta da bolsa</button>' : ''}${done.ped.telefone ? '<button type="button" class="btn wa" data-act="wa">Enviar laudo por WhatsApp</button>' : ''}<button type="button" class="btn ghost" data-act="novo">Novo pedido</button></div></div>`;
        return;
      }
      if (tipo === 'tipagem') {
        const T = TIPAGEM[esp];
        c.innerHTML = `<div class="card"><h2>Resultado da tipagem</h2><div class="grid" style="margin-top:12px">
          <label>Resultado<select id="ctr">${opts(T.res)}</select></label>
          <label>Teste realizado<select id="cte">${opts(T.testes)}</select></label>
          <label>Responsável pela conclusão<input id="cresp" maxlength="60" value="${esc(lastResp)}"></label></div>
          <div class="actions"><button type="button" class="btn primary" data-act="tip">Concluir e gerar laudo de tipagem</button></div></div>`;
        return;
      }
      if (!sel) { c.innerHTML = ''; return; }
      const cross = tipo === 'crossmatch', tipOpts = ['Não tipado', ...TIPOS[esp]];
      c.innerHTML = `<div class="card"><h2>Conclusão — bolsa ${esc(sel.bolsa_id)}</h2>
        <p class="muted" style="margin:6px 0 12px">${esc(sel.hemocomponente)} • ${esc(sel.tipagem)} • ${sel.ml || '—'} mL • validade ${esc(sel.validade_em ? fmtDT(sel.validade_em) : fmt(sel.validade))}</p>
        ${ehAlt ? `<label class="alt-ok"><input type="checkbox" id="altOk"> Confirmo a seleção de bolsa alternativa autorizada pelo veterinário</label>` : ''}
        <div class="grid" style="margin-top:12px">
          <label>Tipagem do paciente<select id="ctp">${opts(tipOpts, val('ptp'))}</select></label>
          ${cross ? `<label>Autoaglutinação<select id="cau">${opts(['NEGATIVA', 'POSITIVA 1+', 'POSITIVA 2+', 'POSITIVA 3+'])}</select></label>
          <label>Prova maior<select id="cma">${opts(['NEGATIVA', 'POSITIVA'])}</select></label>
          <label>Prova menor<select id="cme">${opts(['NEGATIVA', 'POSITIVA'])}</select></label>` : ''}
          <label>Responsável pela liberação<input id="cresp" maxlength="60" value="${esc(lastResp)}"></label></div>
        <div class="actions">${cross ? '<button type="button" class="btn ok-btn" data-act="comp">Compatível</button><button type="button" class="btn bad-btn" data-act="inc">Incompatível</button>' : '<button type="button" class="btn primary" data-act="direta">Liberar bolsa</button>'}<button type="button" class="btn ghost" data-act="limpar">Trocar bolsa</button></div></div>`;
    };
    const atualizar = () => { if (sel && !resultado().exatas.concat(resultado().alternativas).some((b) => b.id === sel.id)) { sel = null; } renderBox(); renderConc(); };
    const recarregar = async () => { await load(); atualizar(); };

    // ---- persistência
    const salvarPedido = async (r, extra = {}) => {
      if (pedidoId) { const { data, error } = await sb.from('pedidos').update({ ...r, ...extra }).eq('id', pedidoId).select(PED_COLS).single(); if (error) throw error; return data; }
      const { data, error } = await sb.from('pedidos').insert({ ...r, status: 'aberto', tentativas, ...extra }).select(PED_COLS).single(); if (error) throw error; pedidoId = data.id; return data;
    };
    const laudoDados = (r, b, extra) => ({ idade: '', peso: String(r.peso).replace('.', ','), hematocrito: String(r.ht_atual).replace('.', ','), doador: b.bolsa_id, bolsa_id: b.bolsa_id, hemocomponente: String(b.hemocomponente).toUpperCase(), ...extra });
    const laudoRow = (r, dados, pid) => ({ tipo: 'compatibilidade', animal: r.paciente, especie: r.especie, raca: r.raca, responsavel: r.veterinario, telefone: r.telefone, data_exame: today(), dados, observacoes: null, pedido_id: pid });

    const incompativel = async (btn) => {
      const r = lerPedido(); if (!r || !sel) return;
      r.tipagem_paciente = val('ctp') === 'Não tipado' ? null : val('ctp'); btn.disabled = true;
      try {
        tentativas += 1; const ped = await salvarPedido(r, { tentativas });
        const dados = laudoDados(r, sel, { autoaglutinacao: 'AUTOAGLUTINAÇÃO ' + val('cau'), prova_maior: val('cma'), prova_menor: val('cme'), compatibilidade: 'INCOMPATÍVEL' });
        const { error } = await sb.from('laudos').insert(laudoRow(r, dados, ped.id)); if (error) throw error;
        toast(`Prova INCOMPATÍVEL registrada para ${sel.bolsa_id}. A bolsa continua disponível — escolha outra.`, true);
        sel = null; await recarregar(); await lista();
      } catch (e) { tentativas = Math.max(0, tentativas - 1); fail(e); } finally { btn.disabled = false; }
    };

    const liberar = async (modo, btn) => {
      const r = lerPedido(); if (!r) return; if (!sel) return toast('Escolha uma bolsa.', true);
      if (ehAlt && !$('#altOk').checked) return toast('Marque a confirmação de bolsa alternativa autorizada pelo veterinário.', true);
      const resp = up(val('cresp'), 60); if (!resp) return toast('Informe o responsável pela liberação.', true);
      r.tipagem_paciente = val('ctp') === 'Não tipado' ? null : val('ctp');
      if (modo === 'direta' && !r.tipagem_paciente) return toast('Solicitação direta exige a tipagem do paciente.', true);
      if (esp3(r) && !r.tipagem_paciente) return toast('Tipagem do gato é obrigatória para liberar bolsa.', true);
      lastResp = resp; btn.disabled = true; const bolsa = sel, prev = bolsa.status; let ped = null, lau = null, sai = null;
      // 1) reserva atômica da bolsa: só passa se ainda estiver disponível
      const claim = await sb.from('bolsas').update({ status: 'enviada' }).eq('id', bolsa.id).in('status', ['disponivel', 'reservada']).select('id');
      if (claim.error) { btn.disabled = false; return fail(claim.error); }
      if (!claim.data || !claim.data.length) { btn.disabled = false; toast('Esta bolsa acabou de ser liberada em outro pedido. Escolha outra.', true); sel = null; await recarregar(); return; }
      try {
        const agora = new Date().toISOString(); ped = await salvarPedido(r);
        const dados = laudoDados(r, bolsa, modo === 'comp'
          ? { autoaglutinacao: 'AUTOAGLUTINAÇÃO ' + val('cau'), prova_maior: val('cma'), prova_menor: val('cme'), compatibilidade: 'COMPATÍVEL' }
          : { autoaglutinacao: 'NÃO REALIZADA', prova_maior: 'NÃO REALIZADA', prova_menor: 'NÃO REALIZADA', compatibilidade: 'LIBERAÇÃO DIRETA' });
        const l1 = await sb.from('laudos').insert(laudoRow(r, dados, ped.id)).select(LAUDO_COLS).single(); if (l1.error) throw l1.error; lau = l1.data;
        const saRow = { data_saida: today(), receptor: r.paciente, tutor: r.tutor || '—', tipagem_receptor: r.tipagem_paciente, sexo: r.sexo, raca: r.raca, veterinario: r.veterinario, validade: bolsa.validade, validade_em: bolsa.validade_em,
          nome_etiqueta: r.paciente, clinica: r.clinica, endereco: (cadClinica(r.clinica) || {}).endereco || null, cidade: (cadClinica(r.clinica) || {}).cidade || null, bolsa_id: bolsa.bolsa_id, hemocomponente: bolsa.hemocomponente, tipagem_bolsa: bolsa.tipagem, especie: r.especie, data_origem: bolsa.data_coleta, origem: bolsa.origem,
          teste_tipagem: !!r.tipagem_paciente, compatibilidade: modo === 'comp', responsavel: resp, observacoes: ehAlt ? 'Bolsa alternativa autorizada pelo veterinário' : null, pedido_id: ped.id };
        const s1 = await sb.from('saidas').insert(saRow).select(SAIDA_COLS).single(); if (s1.error) throw s1.error; sai = s1.data;
        const fim = await sb.from('pedidos').update({ status: 'concluido', bolsa_id: bolsa.bolsa_id, alternativa: ehAlt, resultado: modo === 'comp' ? 'COMPATÍVEL' : 'LIBERAÇÃO DIRETA', saida_id: sai.id, laudo_id: lau.id, concluido_em: agora }).eq('id', ped.id).select(PED_COLS).single();
        if (fim.error) throw fim.error;
        done = { tipo: 'bolsa', ped: fim.data, bolsa, lau, sai, alt: ehAlt, liberacao: agora }; sel = null;
        toast(`Bolsa ${bolsa.bolsa_id} liberada.`); renderBox(); renderConc(); await lista(); await load();
      } catch (e) { // desfaz o que foi feito para não deixar a bolsa "sumida" do estoque
        await sb.from('bolsas').update({ status: prev }).eq('id', bolsa.id);
        if (sai) await sb.from('saidas').delete().eq('id', sai.id); if (lau) await sb.from('laudos').delete().eq('id', lau.id);
        fail(e); await recarregar();
      } finally { btn.disabled = false; }
    };
    const esp3 = (r) => r.especie === 'Felino';

    const concluirTipagem = async (btn) => {
      const r = lerPedido(); if (!r) return; const resp = up(val('cresp'), 60); if (!resp) return toast('Informe o responsável pela conclusão.', true);
      lastResp = resp; const T = TIPAGEM[r.especie], res = val('ctr'); btn.disabled = true; r.tipagem_paciente = res;
      try {
        const ped = await salvarPedido(r);
        const dados = { idade: '', peso: String(r.peso).replace('.', ','), hematocrito: String(r.ht_atual).replace('.', ','), resultado: res, teste: val('cte'), lote: '', orientacao: T.orient[res] };
        const l1 = await sb.from('laudos').insert({ tipo: 'tipagem', animal: r.paciente, especie: r.especie, raca: r.raca, responsavel: r.veterinario, telefone: r.telefone, data_exame: today(), dados, observacoes: null, pedido_id: ped.id }).select(LAUDO_COLS).single(); if (l1.error) throw l1.error;
        const fim = await sb.from('pedidos').update({ status: 'concluido', resultado: 'TIPAGEM REALIZADA', laudo_id: l1.data.id, concluido_em: new Date().toISOString() }).eq('id', ped.id).select(PED_COLS).single(); if (fim.error) throw fim.error;
        done = { tipo: 'tipagem', ped: fim.data, lau: l1.data, resultado: res }; toast('Tipagem registrada.'); renderBox(); renderConc(); await lista();
      } catch (e) { fail(e); } finally { btn.disabled = false; }
    };

    // ---- eventos
    $('#pbox').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-sel]'); if (!b) return;
      const r = resultado(), item = r.exatas.concat(r.alternativas).find((x) => x.id === b.dataset.sel); if (!item) return;
      sel = item; ehAlt = b.dataset.alt === '1'; renderBox(); renderConc(); $('#pconc').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#pconc').addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return; const a = b.dataset.act;
      if (a === 'comp') liberar('comp', b); else if (a === 'direta') liberar('direta', b); else if (a === 'inc') incompativel(b);
      else if (a === 'tip') concluirTipagem(b); else if (a === 'limpar') { sel = null; renderBox(); renderConc(); }
      else if (a === 'novo') { editPedido = null; pedidos(); }
      else if (a === 'laudo') emitir(done.lau, false);
      else if (a === 'wa') emitir(done.lau, true);
      else if (a === 'etiq') etiquetaSaida({ ...done.sai, liberacao_em: done.liberacao, apos_aberta_h: ((L.PRODUTOS.find((p) => p.comp === done.bolsa.hemocomponente) || {}).h) || 24 });
    });
    const mudou = async () => { sel = null; await load(); atualizar(); };
    $('#pe').addEventListener('change', async () => { fillTip(); sugerir(); await mudou(); });
    $('#ph').addEventListener('input', () => { sugerir(); atualizar(); });
    $('#pa').addEventListener('input', () => { manualAlvo = true; atualizar(); });
    ['pw'].forEach((i) => $('#' + i).addEventListener('input', atualizar));
    $('#ptp').addEventListener('change', () => { sel = null; atualizar(); });
    document.querySelectorAll('input[name=cmp],input[name=sol]').forEach((r) => r.addEventListener('change', mudou));

    // ---- lista de pedidos recentes
    let rows = [];
    const lista = async () => {
      const { data, error } = await sb.from('pedidos').select(PED_COLS).order('created_at', { ascending: false }).limit(40); if (error) return fail(error); rows = data || [];
      $('#plist').innerHTML = !rows.length ? empty('Nenhum pedido ainda.') : `<div class="tbl-wrap"><table><thead><tr><th>Nº</th><th>Data</th><th>Paciente</th><th>Clínica</th><th>Solicitação</th><th>Componente</th><th>Bolsa</th><th>Situação</th><th></th></tr></thead><tbody>${rows.map((p) => `<tr>
        <td>${HemoPDF.pad(p.numero)}</td><td>${esc(fmtDT(p.created_at))}</td><td>${esc(p.paciente)}</td><td>${esc(p.clinica)}</td><td>${esc(SOL[p.tipo_solicitacao])}</td><td>${esc(compRotulo(p.componente))}</td>
        <td>${esc(p.bolsa_id || '—')}${p.alternativa ? ' ' + chip('alternativa', 'gold') : ''}</td>
        <td>${chip(PED_ST[p.status][0], PED_ST[p.status][1])}${p.tentativas ? `<div class="muted" style="font-size:.76rem">${p.tentativas} incompatível(is)</div>` : ''}</td>
        <td><div class="row-actions" style="flex-wrap:wrap;min-width:170px">${p.status === 'concluido' ? `<button class="btn ghost small" data-pl="${esc(p.id)}">Laudo</button>${p.saida_id ? `<button class="btn ghost small" data-pe="${esc(p.id)}">Etiqueta</button>` : ''}` : p.status === 'aberto' ? `<button class="btn ghost small" data-pr="${esc(p.id)}">Retomar</button><button class="btn ghost small" data-pc="${esc(p.id)}">Cancelar</button>` : ''}<button class="btn ghost small" data-ph="${esc(p.id)}">Histórico</button></div></td></tr>`).join('')}</tbody></table></div>`;
    };
    $('#plist').addEventListener('click', async (e) => {
      const g = (a) => { const b = e.target.closest(`button[${a}]`); return b ? rows.find((x) => x.id === b.getAttribute(a)) : null; };
      let p;
      if ((p = g('data-pl'))) { const { data, error } = await sb.from('laudos').select(LAUDO_COLS).eq('id', p.laudo_id).single(); if (error) return fail(error); emitir(data, false); }
      else if ((p = g('data-pe'))) { const { data, error } = await sb.from('saidas').select(SAIDA_COLS).eq('id', p.saida_id).single(); if (error) return fail(error); etiquetaSaida({ ...data, liberacao_em: p.concluido_em, apos_aberta_h: ((L.PRODUTOS.find((x) => x.comp === data.hemocomponente) || {}).h) || 24 }); }
      else if ((p = g('data-pr'))) { editPedido = p; pedidos(); }
      else if ((p = g('data-pc'))) { if (!confirm('Cancelar este pedido em aberto?')) return; const { error } = await sb.from('pedidos').update({ status: 'cancelado' }).eq('id', p.id); error ? fail(error) : (toast('Pedido cancelado.'), lista()); }
      else if ((p = g('data-ph'))) mostrarHistorico('pedidos', p.id, `Histórico do pedido nº ${HemoPDF.pad(p.numero)} — ${p.paciente}`);
    });

    // ---- início (novo pedido ou retomada)
    fillTip(); sugerir();
    if (ed) {
      const set = (id, v) => { const el = $('#' + id); if (el) el.value = v == null ? '' : v; };
      set('pn', ed.paciente); set('pe', ed.especie); fillTip(ed.tipagem_paciente || 'Não tipado'); set('pr', ed.raca); set('ps', ed.sexo); set('pw', String(ed.peso).replace('.', ',')); set('ph', String(ed.ht_atual).replace('.', ','));
      set('pa', ed.ht_alvo == null ? '' : String(ed.ht_alvo).replace('.', ',')); manualAlvo = true; set('pc', ed.clinica); set('pv', ed.veterinario); set('pt', ed.tutor); set('pf', ed.telefone);
      const r1 = document.querySelector(`input[name=sol][value=${ed.tipo_solicitacao}]`); if (r1) r1.checked = true;
      document.querySelectorAll('input[name=cmp]').forEach((r) => { r.checked = r.value === ed.componente; });
      pedidoId = ed.id; tentativas = ed.tentativas || 0; toast('Pedido retomado.');
    }
    await Promise.all([load(), lista()]); atualizar();
  }

  // ---------- SAÍDAS ----------
  async function saidas() {
    const es = editSaida; editSaida = null; const pre = prefillSaida; prefillSaida = null; const ult = ultimaSaida; ultimaSaida = null;
    await loadCad();
    const { data: disp } = await sb.from('bolsas').select('bolsa_id,hemocomponente,tipagem,especie,data_coleta,validade,validade_em,origem').in('status', ['disponivel', 'reservada']).order('bolsa_id');
    viewEl.innerHTML = head(es ? 'Editar saída' : 'Saída de bolsas', es ? `Alterando a saída de ${es.receptor} — as alterações ficam registradas no histórico` : 'Controle de bolsas enviadas às clínicas') + `
    ${ult ? `<div class="card" id="ultS"><h2>Saída registrada: ${esc(ult.receptor)} — bolsa ${esc(ult.bolsa_id)}</h2><p class="muted" style="margin:6px 0 12px">Imprima as duas etiquetas: a da bolsa e a do lado de fora da caixa de isopor (QR do motoboy e da clínica).</p><div class="actions"><button class="btn ghost" id="ultB" type="button">Etiqueta da bolsa</button><button class="btn primary" id="ultC" type="button">Etiqueta da caixa (QR)</button></div></div>` : ''}
    <form id="f" class="card" novalidate><div class="grid">
      <label>Data da saída<input id="dsa" type="date" value="${today()}" required></label>
      <label>Bolsa (disponíveis)<input id="bid" list="dlb" maxlength="40" required placeholder="digite ou escolha"></label>
      ${dlCad()}<datalist id="dlb">${(disp || []).map((b) => `<option value="${esc(b.bolsa_id)}">`).join('')}</datalist>
      <label>Hemocomponente<select id="hemo">${opts(COMPONENTES)}</select></label>
      <label>Espécie<select id="esp"><option>Canino</option><option>Felino</option></select></label>
      <label>Tipagem da bolsa<input id="tbo" maxlength="30"></label>
      <label>Data da coleta<input id="dor" type="date"></label>
      <label>Validade da bolsa<input id="dvb" type="date"></label>
      <label>Origem<input id="org" maxlength="60" placeholder="CDLV / Hemopet / Próprio"></label>
      <label>Receptor (nome do animal)<input id="rec" maxlength="80" required></label>
      <label>Sexo<select id="sex"><option>Macho</option><option>Fêmea</option></select></label>
      <label>Raça do receptor<input id="rcr" maxlength="80"></label>
      <label>Nome na mensagem de recuperação<input id="nme" maxlength="80" placeholder="igual ao receptor — pode editar"></label>
      <label>Tipagem do receptor<input id="tre" maxlength="30" placeholder="Positivo / Negativo"></label>
      <label>Tutor<input id="tut" maxlength="80" required></label>
      <label>Clínica ou hospital<input id="cli" list="dlCli" maxlength="100" required autocomplete="off"></label>
      <label>Veterinário responsável (clínica)<input id="vet" list="dlVet" maxlength="80" required autocomplete="off"></label>
      <label>Cidade<input id="cid" maxlength="60"></label>
      <label class="full">Endereço do hospital ou clínica (onde o paciente está internado)<input id="end" maxlength="200" placeholder="rua, número, bairro — aparece ao ler o QR code"></label>
      <label>Responsável pela saída<input id="res" maxlength="60" required></label>
      <label>Teste de tipagem feito?<select id="tt"><option value="0">Não</option><option value="1">Sim</option></select></label>
      <label>Compatibilidade feita?<select id="tc"><option value="0">Não</option><option value="1">Sim</option></select></label>
      <label>Motorista que retirou<input id="mot" maxlength="80" placeholder="nome do motorista"></label>
      <label>Retirada pelo motorista (data e hora)<input id="ret" type="datetime-local"></label>
      <label>Chegada ao hospital (data e hora)<input id="ent" type="datetime-local"></label>
      <label>Recebido por (no hospital)<input id="rcb" maxlength="80" placeholder="nome de quem recebeu"></label>
      <label>Temperatura na chegada (°C)<input id="tmp" inputmode="decimal" maxlength="5" placeholder="ex.: 4"></label>
      <label class="full">Observações<textarea id="obs" maxlength="300"></textarea></label>
    </div><div class="actions"><button class="btn primary" id="add">${es ? 'Salvar alterações' : 'Registrar saída'}</button>${es ? '<button class="btn ghost" id="cancelEd" type="button">Cancelar</button>' : ''}</div></form>
    <div class="card"><div class="head"><h2>Saídas registradas</h2><button class="btn ghost small" id="relS">Relatório PDF</button></div>
      <div class="filters"><label>De<input type="date" id="fi" value="${monthStart()}"></label><label>Até<input type="date" id="ff" value="${today()}"></label><label>Buscar<input id="q" maxlength="60"></label></div>
      <div id="list"><p class="muted">Carregando…</p></div></div>`;
    let vem = es ? es.validade_em || null : null;
    if (es) {
      const set = (id, v) => { $('#' + id).value = v ?? ''; };
      set('dsa', es.data_saida); set('bid', es.bolsa_id); set('hemo', es.hemocomponente); set('esp', es.especie); set('tbo', es.tipagem_bolsa); set('dor', es.data_origem); set('dvb', es.validade); set('org', es.origem);
      set('rec', es.receptor); set('sex', es.sexo || 'Macho'); set('rcr', es.raca); set('nme', es.nome_etiqueta); set('tre', es.tipagem_receptor); set('tut', es.tutor); set('cli', es.clinica); set('vet', es.veterinario); set('cid', es.cidade); set('end', es.endereco); set('res', es.responsavel);
      set('ent', es.entregue_em ? new Date(new Date(es.entregue_em).getTime() - new Date(es.entregue_em).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''); set('rcb', es.recebido_por); set('mot', es.motorista); set('ret', es.retirada_em ? new Date(new Date(es.retirada_em).getTime() - new Date(es.retirada_em).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : ''); set('tmp', es.temp_chegada == null ? '' : String(es.temp_chegada).replace('.', ',')); set('tt', es.teste_tipagem ? '1' : '0'); set('tc', es.compatibilidade ? '1' : '0'); set('obs', es.observacoes);
      $('#cancelEd').addEventListener('click', () => saidas());
    }
    $('#bid').addEventListener('change', () => {
      const b = (disp || []).find((x) => String(x.bolsa_id).toUpperCase() === val('bid').toUpperCase()); if (!b) return; vem = b.validade_em || null;
      $('#hemo').value = b.hemocomponente; $('#esp').value = b.especie; $('#tbo').value = b.tipagem; $('#dor').value = b.data_coleta; $('#dvb').value = b.validade || ''; $('#org').value = b.origem;
    });
    if (ult) { $('#ultB').addEventListener('click', () => etiquetaSaida(ult)); $('#ultC').addEventListener('click', () => etiquetaCaixa(ult)); }
    ligarCadastros({ cli: 'cli', vet: 'vet', end: 'end', cid: 'cid' });
    if (pre && !es) {
      if ((disp || []).some((x) => x.bolsa_id === pre)) { $('#bid').value = pre; $('#bid').dispatchEvent(new Event('change')); toast(`Bolsa ${pre} selecionada. Preencha o paciente e a clínica.`); }
      else toast(`A bolsa ${pre} não está disponível para saída (já enviada, descartada ou inexistente).`, true);
    }
    $('#cli').addEventListener('change', () => { if ($('#end').value || cadClinica(val('cli'))) return; const x = all.find((r) => r.clinica === val('cli') && r.endereco); if (x) { $('#end').value = x.endereco; if (!$('#cid').value) $('#cid').value = x.cidade || ''; } });
    $('#add').addEventListener('click', async (e) => {
      e.preventDefault();
      const row = { data_saida: val('dsa'), bolsa_id: up(val('bid'), 40), hemocomponente: val('hemo'), especie: val('esp'), tipagem_bolsa: up(val('tbo'), 30) || null, data_origem: val('dor') || null, origem: up(val('org'), 60) || null,
        receptor: up(val('rec'), 80), sexo: val('sex'), raca: clean(val('rcr'), 80) || null, veterinario: up(val('vet'), 80), validade: val('dvb') || null, validade_em: vem, nome_etiqueta: up(val('nme'), 80) || null, tipagem_receptor: clean(val('tre'), 30) || null, tutor: up(val('tut'), 80), clinica: up(val('cli'), 100), cidade: up(val('cid'), 60) || null, endereco: up(val('end'), 200) || null, responsavel: up(val('res'), 60),
        teste_tipagem: val('tt') === '1', compatibilidade: val('tc') === '1', observacoes: up(val('obs'), 300) || null,
        entregue_em: val('ent') ? new Date(val('ent')).toISOString() : null, recebido_por: up(val('rcb'), 80) || null, temp_chegada: toNum(val('tmp')),
        motorista: up(val('mot'), 80) || null, retirada_em: val('ret') ? new Date(val('ret')).toISOString() : null };
      if (es) { row.recebimento_status = es.recebimento_status || null; row.recebimento_obs = es.recebimento_obs || null; }
      { const stv = L.statusVal(row.validade, row.validade_em); if (!es && stv && stv.cls === 'bad') return toast('Bolsa VENCIDA: não é permitido registrar a saída. Descarte-a em Entradas.', true); }
      if (row.temp_chegada != null && (Number.isNaN(row.temp_chegada) || row.temp_chegada < -40 || row.temp_chegada > 60)) return toast('Temperatura inválida (use graus, ex.: 4 ou 4,5).', true);
      if (!row.bolsa_id || !row.receptor || !row.tutor || !row.clinica || !row.veterinario || !row.responsavel) return toast('Preencha bolsa, receptor, tutor, clínica, veterinário e responsável.', true);
      if ((!row.tipagem_bolsa || row.tipagem_bolsa === NAO_TIPADA || row.tipagem_bolsa === '—') && !confirm('Esta bolsa ainda não foi tipada. Registrar a saída mesmo assim?')) return;
      const trocouBolsa = !es || row.bolsa_id !== es.bolsa_id;
      if (es && trocouBolsa && !confirm(`Trocar a bolsa de ${es.bolsa_id} para ${row.bolsa_id}? A bolsa anterior mantém o status atual — ajuste em Entradas, se precisar.`)) return;
      e.target.disabled = true;
      const { data: nova, error } = await (es ? sb.from('saidas').update(row).eq('id', es.id) : sb.from('saidas').insert(row)).select(SAIDA_COLS).single();
      if (!error && trocouBolsa) await sb.from('bolsas').update({ status: 'enviada' }).eq('bolsa_id', row.bolsa_id);
      e.target.disabled = false; if (error) return fail(error);
      if (es) { toast('Saída atualizada.'); if (confirm('Gerar a etiqueta atualizada?')) await etiquetaSaida(nova); }
      else { toast('Saída registrada. Gerando etiqueta…'); ultimaSaida = nova; await etiquetaSaida(nova); }
      saidas();
    });
    let all = [];
    const draw = () => {
      const q = clean(val('q'), 60).toLowerCase(), a = val('fi'), b = val('ff');
      const rows = all.filter((r) => (!a || r.data_saida >= a) && (!b || r.data_saida <= b) && (!q || (r.receptor + r.tutor + r.clinica + r.bolsa_id).toLowerCase().includes(q)));
      $('#list').innerHTML = !rows.length ? empty('Nenhuma saída no período.') : `<div class="tbl-wrap"><table><thead><tr><th>Data</th><th>Receptor</th><th>Tutor</th><th>Clínica</th><th>Bolsa</th><th>Tipagem</th><th>Tipag.</th><th>Compat.</th><th>Motorista</th><th>Chegada</th><th>Resp.</th><th></th></tr></thead><tbody>${rows.map((r) => `
        <tr><td>${fmt(r.data_saida)}</td><td><b>${esc(r.receptor)}</b></td><td>${esc(r.tutor)}</td><td>${esc(r.clinica)}</td><td>${esc(r.bolsa_id)}</td><td>${esc(r.tipagem_bolsa || '—')}</td>
        <td>${r.teste_tipagem ? chip('X', 'ok') : '—'}</td><td>${r.compatibilidade ? chip('X', 'ok') : '—'}</td><td>${r.motorista ? esc(r.motorista) : '—'}</td><td>${r.recebimento_status === 'PROBLEMA' ? chip('PROBLEMA', 'bad') + ' ' : ''}${r.entregue_em ? chip(fmtDT(r.entregue_em), r.recebimento_status === 'PROBLEMA' ? 'bad' : 'ok') : '—'}</td><td>${esc(r.responsavel)}</td><td><div class="row-actions"><button class="btn ghost small" data-lbl="${esc(r.id)}">Etiqueta</button><button class="btn ghost small" data-cx="${esc(r.id)}">Caixa</button><button class="btn ghost small" data-edt="${esc(r.id)}">Editar</button><button class="btn ghost small" data-his="${esc(r.id)}">Histórico</button><button class="btn danger small" data-del="${esc(r.id)}">Excluir</button></div></td></tr>`).join('')}</tbody></table></div>`;
    };
    const { data, error } = await sb.from('saidas').select(SAIDA_COLS).order('data_saida', { ascending: false }).order('created_at', { ascending: false }).limit(1000);
    if (error) return fail(error); all = data || []; draw();
    ['fi', 'ff', 'q'].forEach((i) => $('#' + i).addEventListener('input', draw));
    $('#list').addEventListener('click', async (e) => { const b = e.target.closest('button[data-del]'); if (!b || !confirm('Excluir esta saída?')) return; const { error: er } = await sb.from('saidas').delete().eq('id', b.dataset.del); er ? fail(er) : (toast('Saída excluída.'), saidas()); });
    $('#list').addEventListener('click', async (e) => {
      const cx = e.target.closest('button[data-cx]'); if (cx) { const rc = all.find((x) => x.id === cx.dataset.cx); if (rc) await etiquetaCaixa(rc); return; }
      const b = e.target.closest('button[data-lbl]'); const r = b && all.find((x) => x.id === b.dataset.lbl); if (!r) return;
      await etiquetaSaida({ ...r, nome_etiqueta: r.nome_etiqueta || r.receptor }); // o nome da mensagem se altera em Editar
    });
    $('#list').addEventListener('click', (e) => {
      const ed = e.target.closest('button[data-edt]'), hi = e.target.closest('button[data-his]');
      if (ed) { editSaida = all.find((x) => x.id === ed.dataset.edt); window.scrollTo(0, 0); saidas(); }
      else if (hi) { const x = all.find((v) => v.id === hi.dataset.his); mostrarHistorico('saidas', x.id, `Histórico da saída — ${x.receptor} (${x.bolsa_id})`); }
    });
    $('#relS').addEventListener('click', () => relatorioPeriodo('saidas', val('fi'), val('ff')));
  }

  async function etiquetaSaida(r) {
    try { if (!r.qr_url) { const { data: bq } = await sb.from('bolsas').select('qr_token').eq('bolsa_id', r.bolsa_id).maybeSingle(); r = { ...r, qr_url: traceUrl(bq && bq.qr_token) }; avisoQr(); } const doc = await HemoPDF.etiquetaSaida([r], S); preview(doc, `ETIQUETA_${r.receptor}_${r.bolsa_id}.pdf`.replace(/[^\w.\-]+/g, '_'), `Etiqueta de saída — ${r.receptor} (150 × 100 mm)`); } catch (e) { fail(e); }
  }

  async function etiquetaCaixa(r) {
    try { if (!r.qr_url) { const { data: bq } = await sb.from('bolsas').select('qr_token').eq('bolsa_id', r.bolsa_id).maybeSingle(); r = { ...r, qr_url: traceUrl(bq && bq.qr_token) }; avisoQr(); } const doc = await HemoPDF.etiquetaCaixa(r, S); preview(doc, `CAIXA_${r.receptor}_${r.bolsa_id}.pdf`.replace(/[^\w.\-]+/g, '_'), `Etiqueta da caixa de transporte — ${r.receptor} (150 × 100 mm)`); } catch (e) { fail(e); }
  }

  async function etiquetas(list) {
    if (!list.length) return toast('Nenhuma bolsa para etiquetar.', true);
    if (list.some((b) => !b.tipagem || b.tipagem === NAO_TIPADA || b.tipagem === '—')) toast('Atenção: há bolsa(s) ainda sem tipagem — a etiqueta sairá sem ela.', true);
    try { list = list.map((b) => ({ ...b, qr_url: traceUrl(b.qr_token) })); avisoQr(); const doc = await HemoPDF.etiquetas(list, S); preview(doc, `ETIQUETAS_${today()}.pdf`, `${list.length} etiqueta(s) de bolsa (canino 100 × 100 mm · felino 50 × 70 mm)`); } catch (e) { fail(e); }
  }

  async function relatorioPeriodo(tipo, a, b) {
    a = a || monthStart(); b = b || today();
    try {
      if (tipo === 'saidas') {
        const { data, error } = await sb.from('saidas').select('data_saida,receptor,tutor,tipagem_receptor,clinica,cidade,bolsa_id,hemocomponente,tipagem_bolsa,especie,data_origem,origem,teste_tipagem,compatibilidade,responsavel').gte('data_saida', a).lte('data_saida', b).order('data_saida');
        if (error) throw error;
        const doc = await HemoPDF.relatorio('CONTROLE DE SAÍDAS DE BOLSAS', `Período: ${fmt(a)} a ${fmt(b)}`,
          ['DATA', 'RECEPTOR', 'TUTOR', 'TIPAG. REC.', 'CLÍNICA / CIDADE', 'ID BOLSA', 'HEMOCOMP.', 'TIPAG. BOLSA', 'ESP.', 'ORIGEM', 'TESTE', 'COMPAT.', 'RESP.'],
          data.map((r) => [fmt(r.data_saida), r.receptor, r.tutor, r.tipagem_receptor || '', [r.clinica, r.cidade].filter(Boolean).join(' / '), r.bolsa_id, r.hemocomponente, r.tipagem_bolsa || '', r.especie.slice(0, 3), [fmt(r.data_origem), r.origem].filter((x) => x && x !== '—').join(' '), r.teste_tipagem ? 'X' : '', r.compatibilidade ? 'X' : '', r.responsavel]), S);
        doc.save(`SAIDAS_${a}_a_${b}.pdf`);
      } else {
        const { data, error } = await sb.from('bolsas').select('bolsa_id,hemocomponente,tipagem,especie,data_coleta,validade,origem,doador,tutor,hematocrito,volume_g,status').order('data_coleta');
        if (error) throw error;
        const doc = await HemoPDF.relatorio('CONTROLE DE ENTRADA DE BOLSAS', `Posição em ${fmt(today())}`,
          ['ID BOLSA', 'HEMOCOMPONENTE', 'TIPAGEM', 'ESPÉCIE', 'DOADOR / TUTOR', 'HT %', 'VOL. (g)', 'COLETA', 'VALIDADE', 'ORIGEM', 'STATUS'],
          data.map((r) => [r.bolsa_id, r.hemocomponente, r.tipagem, r.especie, [r.doador, r.tutor].filter(Boolean).join(' / '), r.hematocrito ?? '', r.volume_g ?? '', fmt(r.data_coleta), fmt(r.validade), r.origem, (STATUS[r.status] || [r.status])[0]]), S);
        doc.save(`ENTRADAS_${today()}.pdf`);
      }
    } catch (e) { fail(e); }
  }

  // ---------- CONFIGURAÇÕES ----------
  function config() {
    viewEl.innerHTML = head('Ajustes', 'Dados que saem no rodapé e na assinatura dos laudos') + `
    <form id="f" class="card" novalidate><div class="grid">
      <label>Médico veterinário responsável<input id="vn" maxlength="120" value="${esc(S.vet_name)}"></label>
      <label>CRMV<input id="cr" maxlength="40" value="${esc(S.crmv)}"></label>
      <label>MAPA<input id="ma" maxlength="40" value="${esc(S.mapa)}"></label>
      <label>Endereço<input id="ad" maxlength="200" value="${esc(S.address)}"></label>
      <label>Telefones<input id="ph" maxlength="120" value="${esc(S.phones)}"></label>
      <label>E-mail<input id="em" data-keep maxlength="120" value="${esc(S.email)}"></label>
      <label class="full">Endereço público do sistema (usado no QR code das etiquetas)<input id="su" data-keep maxlength="200" inputmode="url" placeholder="https://seu-sistema.vercel.app" value="${esc(S.site_url || '')}"></label>
      <label class="full">Assinatura (PNG ou JPG, até 500 KB)<input id="sg" type="file" accept="image/png,image/jpeg"></label>
      <div class="full">${S.signature ? `<img class="sig-preview" id="sgp" alt="Assinatura atual" src="${esc(S.signature)}">` : '<p class="muted">Nenhuma assinatura cadastrada.</p>'}</div>
    </div>
    <div class="actions"><button class="btn primary" id="sv">Salvar ajustes</button><button class="btn ghost" id="lo">Sair da conta</button></div></form>
    <div class="card"><h2>Cópia de segurança</h2><p class="muted" style="margin:6px 0 12px">Baixa um arquivo com TODOS os dados (bolsas, laudos, saídas, pedidos, clínicas e veterinários). Faça toda semana e guarde no Google Drive ou no e-mail. O arquivo contém dados de tutores: guarde com cuidado.</p>
      <div class="actions"><button class="btn ghost" id="bk" type="button">Baixar cópia de segurança</button></div></div>`;
    $('#bk').addEventListener('click', async (e) => {
      e.target.disabled = true; toast('Gerando cópia de segurança…');
      try {
        const out = { gerado_em: new Date().toISOString(), sistema: 'ANILAB Banco de Sangue', tabelas: {} };
        for (const t of ['bolsas', 'laudos', 'saidas', 'pedidos', 'clinicas', 'veterinarios']) {
          let from = 0, all = [];
          for (;;) { const { data, error } = await sb.from(t).select('*').order('created_at', { ascending: true }).range(from, from + 999); if (error) { if (t === 'clinicas' || t === 'veterinarios') break; throw error; } all = all.concat(data || []); if (!data || data.length < 1000) break; from += 1000; }
          out.tabelas[t] = all;
        }
        const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
        const url = URL.createObjectURL(blob), l = document.createElement('a');
        l.href = url; l.download = `anilab-backup-${today()}.json`; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast(`Cópia salva: ${Object.values(out.tabelas).reduce((n, v) => n + v.length, 0)} registros.`);
      } catch (er) { fail(er); }
      e.target.disabled = false;
    });
    let sig = S.signature;
    $('#sg').addEventListener('change', (e) => { // item 16: tipo e tamanho restritos
      const f = e.target.files[0]; if (!f) return;
      if (!['image/png', 'image/jpeg'].includes(f.type) || f.size > 500 * 1024) { e.target.value = ''; return toast('Use PNG/JPG de até 500 KB.', true); }
      const r = new FileReader(); r.onload = () => { sig = r.result; const p = $('#sgp'); if (p) p.src = sig; else toast('Assinatura carregada — clique em Salvar.'); }; r.readAsDataURL(f);
    });
    $('#lo').addEventListener('click', (e) => { e.preventDefault(); logout(); });
    $('#sv').addEventListener('click', async (e) => {
      e.preventDefault(); e.target.disabled = true;
      const upd = { vet_name: up(val('vn'), 120), crmv: up(val('cr'), 40), mapa: up(val('ma'), 40), address: up(val('ad'), 200), phones: up(val('ph'), 120), email: clean(val('em'), 120), signature: sig, site_url: clean(val('su'), 200).replace(/\/+$/, '') || null, updated_at: new Date().toISOString() };
      if (upd.site_url && !/^https:\/\/[^\s]+\.[^\s]+$/.test(upd.site_url)) { e.target.disabled = false; return toast('Endereço do sistema inválido — use https://... completo.', true); }
      const { error } = await sb.from('settings').update(upd).eq('id', 1); e.target.disabled = false;
      if (error) return fail(error); S = { ...S, ...upd, site_url: upd.site_url || '' }; toast('Ajustes salvos.');
    });
  }
})();
