-- =====================================================================
-- ANILAB — BANCO DE SANGUE — banco de dados (Supabase / Postgres)
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma única vez).
-- Cobre os itens de segurança: 4 (RLS), 6 (auth no servidor), 7 (logs
-- travados), 8 (campos imutáveis), 13/14 (constraints e validação).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Configurações do laboratório (linha única) ----------
create table if not exists public.settings (
  id            int primary key default 1 check (id = 1),
  vet_name      text not null default 'Emanuel Araújo'          check (char_length(vet_name) <= 120),
  crmv          text not null default 'CRMV-MG 14396'           check (char_length(crmv) <= 40),
  mapa          text not null default '38575/2017'              check (char_length(mapa) <= 40),
  address       text not null default 'R. Padre Rolim, 815 - Santa Efigênia, Belo Horizonte - MG, 30130-090' check (char_length(address) <= 200),
  phones        text not null default '(31) 3395-3633'         check (char_length(phones) <= 120),
  email         text not null default 'contato@laboratorioanilab.com.br' check (char_length(email) <= 120),
  signature     text check (signature is null or (char_length(signature) <= 700000 and signature like 'data:image/%')),
  updated_at    timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------- Laudos (tipagem e compatibilidade) ----------
create table if not exists public.laudos (
  id            uuid primary key default gen_random_uuid(),
  numero        bigint generated always as identity,
  tipo          text not null check (tipo in ('tipagem','compatibilidade')),
  animal        text not null check (char_length(animal) between 1 and 80),
  especie       text not null check (especie in ('Canino','Felino')),
  raca          text check (raca is null or char_length(raca) <= 80),
  responsavel   text not null check (char_length(responsavel) between 1 and 80),
  telefone      text check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  data_exame    date not null default current_date,
  dados         jsonb not null default '{}'::jsonb check (pg_column_size(dados) < 8000),
  observacoes   text check (observacoes is null or char_length(observacoes) <= 500),
  created_by    uuid not null default auth.uid() references auth.users(id),
  created_at    timestamptz not null default now()
);
create index if not exists laudos_data_idx on public.laudos (data_exame desc);

-- ---------- Entrada de bolsas ----------
create table if not exists public.bolsas (
  id             uuid primary key default gen_random_uuid(),
  bolsa_id       text not null unique check (char_length(bolsa_id) between 1 and 40),
  hemocomponente text not null check (hemocomponente in ('Concentrado de hemácias','Sangue total','Plasma','Plaquetas')),
  tipagem        text not null check (char_length(tipagem) <= 30),
  especie        text not null check (especie in ('Canino','Felino')),
  data_coleta    date not null,
  origem         text not null check (char_length(origem) between 1 and 60),
  doador         text check (doador is null or char_length(doador) <= 80),
  tutor          text check (tutor is null or char_length(tutor) <= 80),
  hematocrito    numeric(4,1) check (hematocrito is null or (hematocrito >= 0 and hematocrito <= 100)),
  volume_g       numeric(7,1) check (volume_g is null or (volume_g > 0 and volume_g < 5000)),
  validade       date,
  validade_em    timestamptz,
  solucao        text check (solucao is null or char_length(solucao) <= 30),
  sistema_aberto boolean not null default false,
  status         text not null default 'disponivel' check (status in ('disponivel','reservada','enviada','retornou','suspensa','descartada')),
  observacoes    text check (observacoes is null or char_length(observacoes) <= 300),
  created_by     uuid not null default auth.uid() references auth.users(id),
  created_at     timestamptz not null default now()
);

-- Se você já tinha rodado uma versão anterior deste arquivo, estas linhas atualizam a tabela:
alter table public.bolsas add column if not exists tutor       text check (tutor is null or char_length(tutor) <= 80);
alter table public.bolsas add column if not exists hematocrito numeric(4,1) check (hematocrito is null or (hematocrito >= 0 and hematocrito <= 100));
alter table public.bolsas add column if not exists volume_g    numeric(7,1) check (volume_g is null or (volume_g > 0 and volume_g < 5000));
alter table public.bolsas add column if not exists validade    date;
alter table public.bolsas add column if not exists validade_em timestamptz;
alter table public.bolsas add column if not exists solucao     text check (solucao is null or char_length(solucao) <= 30);
alter table public.bolsas add column if not exists sistema_aberto boolean not null default false;
alter table public.bolsas drop constraint if exists bolsas_status_check;
alter table public.bolsas add constraint bolsas_status_check check (status in ('disponivel','reservada','enviada','retornou','suspensa','descartada'));

-- ---------- Saída de bolsas (controle de saídas) ----------
create table if not exists public.saidas (
  id               uuid primary key default gen_random_uuid(),
  data_saida       date not null default current_date,
  receptor         text not null check (char_length(receptor) between 1 and 80),
  tutor            text not null check (char_length(tutor) between 1 and 80),
  tipagem_receptor text check (tipagem_receptor is null or char_length(tipagem_receptor) <= 30),
  sexo             text check (sexo is null or sexo in ('Macho','Fêmea')),
  raca             text check (raca is null or char_length(raca) <= 80),
  veterinario      text check (veterinario is null or char_length(veterinario) <= 80),
  validade         date,
  validade_em      timestamptz,
  nome_etiqueta    text check (nome_etiqueta is null or char_length(nome_etiqueta) <= 80),
  clinica          text not null check (char_length(clinica) between 1 and 100),
  cidade           text check (cidade is null or char_length(cidade) <= 60),
  bolsa_id         text not null check (char_length(bolsa_id) between 1 and 40),
  hemocomponente   text not null check (hemocomponente in ('Concentrado de hemácias','Sangue total','Plasma','Plaquetas')),
  tipagem_bolsa    text check (tipagem_bolsa is null or char_length(tipagem_bolsa) <= 30),
  especie          text not null check (especie in ('Canino','Felino')),
  data_origem      date,
  origem           text check (origem is null or char_length(origem) <= 60),
  teste_tipagem    boolean not null default false,
  compatibilidade  boolean not null default false,
  responsavel      text not null check (char_length(responsavel) between 1 and 60),
  observacoes      text check (observacoes is null or char_length(observacoes) <= 300),
  created_by       uuid not null default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now()
);
create index if not exists saidas_data_idx on public.saidas (data_saida desc);

-- Atualização para quem já rodou a versão anterior:
alter table public.saidas add column if not exists sexo          text check (sexo is null or sexo in ('Macho','Fêmea'));
alter table public.saidas add column if not exists raca          text check (raca is null or char_length(raca) <= 80);
alter table public.saidas add column if not exists veterinario   text check (veterinario is null or char_length(veterinario) <= 80);
alter table public.saidas add column if not exists validade      date;
alter table public.saidas add column if not exists validade_em timestamptz;
alter table public.saidas add column if not exists nome_etiqueta text check (nome_etiqueta is null or char_length(nome_etiqueta) <= 80);

-- ---------- Log de auditoria (item 7: ninguém lê/escreve pela API) ----------
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    uuid,
  tabela     text not null,
  acao       text not null,
  registro   uuid,
  antes      jsonb,
  depois     jsonb
);
alter table public.audit_log enable row level security;       -- sem policy = bloqueado
revoke all on public.audit_log from anon, authenticated;

alter table public.audit_log add column if not exists antes  jsonb;
alter table public.audit_log add column if not exists depois jsonb;

create or replace function public.fn_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (user_id, tabela, acao, registro, antes, depois)
  values (auth.uid(), tg_table_name, tg_op,
          case when tg_op = 'DELETE' then old.id else new.id end,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Histórico de alterações de um registro: o log continua fechado para a API; só esta função o expõe (a usuários logados).
create or replace function public.fn_historico(p_tabela text, p_registro uuid)
returns table (at timestamptz, usuario text, acao text, antes jsonb, depois jsonb)
language sql stable security definer set search_path = public, auth as $$
  select a.at, coalesce(u.email::text, '—'), a.acao, a.antes, a.depois
  from public.audit_log a left join auth.users u on u.id = a.user_id
  where auth.uid() is not null and p_tabela in ('bolsas','laudos','saidas','pedidos')
    and a.tabela = p_tabela and a.registro = p_registro
  order by a.at desc limit 100;
$$;
revoke all on function public.fn_historico(text, uuid) from public, anon;
grant execute on function public.fn_historico(text, uuid) to authenticated;

-- ---------- Item 8: campos que ninguém pode adulterar ----------
create or replace function public.fn_lock_fields() returns trigger
language plpgsql as $$
begin
  new.id         := old.id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if tg_table_name = 'laudos' then new.numero := old.numero; end if;
  if tg_table_name = 'bolsas' then new.qr_token := old.qr_token; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['laudos','bolsas','saidas'] loop
    execute format('drop trigger if exists trg_lock on public.%I', t);
    execute format('create trigger trg_lock before update on public.%I for each row execute function public.fn_lock_fields()', t);
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()', t);
  end loop;
end $$;

-- ---------- Item 4: Row Level Security em TODAS as tabelas ----------
alter table public.settings enable row level security;
alter table public.laudos   enable row level security;
alter table public.bolsas   enable row level security;
alter table public.saidas   enable row level security;

-- Somente usuários autenticados (equipe). Anônimo não vê nada.
drop policy if exists settings_read   on public.settings;
drop policy if exists settings_update on public.settings;
create policy settings_read   on public.settings for select to authenticated using (true);
create policy settings_update on public.settings for update to authenticated using (true) with check (id = 1);

do $$
declare t text;
begin
  foreach t in array array['laudos','bolsas','saidas'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (created_by = auth.uid())', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (true) with check (true)', t, t);
    -- exclusão: só quem criou o registro
    execute format('create policy %I_delete on public.%I for delete to authenticated using (created_by = auth.uid())', t, t);
  end loop;
end $$;

revoke all on public.settings, public.laudos, public.bolsas, public.saidas from anon;


-- ---------- Rastreabilidade por QR code ----------
-- Cada bolsa ganha um código secreto e aleatório (impossível de adivinhar). É ele que vai no QR da etiqueta.
alter table public.bolsas add column if not exists qr_token uuid not null default gen_random_uuid();
create unique index if not exists bolsas_qr_token_idx on public.bolsas (qr_token);

-- Chegada ao hospital (preenchida na tela de Saídas)
alter table public.saidas add column if not exists entregue_em   timestamptz;
alter table public.saidas add column if not exists endereco      text check (endereco is null or char_length(endereco) <= 200);
alter table public.saidas add column if not exists recebido_por  text check (recebido_por is null or char_length(recebido_por) <= 80);
alter table public.saidas add column if not exists temp_chegada  numeric(4,1) check (temp_chegada is null or (temp_chegada >= -40 and temp_chegada <= 60));

-- Endereço público do sistema (o QR das etiquetas aponta para ele)
alter table public.settings add column if not exists site_url text check (site_url is null or (char_length(site_url) <= 200 and site_url ~ '^https://'));

-- Consulta pública (sem login) — devolve dados da bolsa, o paciente receptor e o endereço do hospital — nunca nomes de tutor, doador ou veterinário.
-- A tabela continua fechada para anônimos; apenas esta função, e só com o código secreto, entrega o resumo.
-- ---------- Rastreabilidade de transporte e recebimento ----------
alter table public.saidas add column if not exists motorista          text check (motorista is null or char_length(motorista) <= 80);
alter table public.saidas add column if not exists retirada_em        timestamptz;
alter table public.saidas add column if not exists recebimento_status text check (recebimento_status is null or recebimento_status in ('OK','PROBLEMA'));
alter table public.saidas add column if not exists recebimento_obs    text check (recebimento_obs is null or char_length(recebimento_obs) <= 300);

create or replace function public.fn_rastreio(p_token uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b public.bolsas; tip_em timestamptz; res jsonb;
begin
  select * into b from public.bolsas where qr_token = p_token;
  if not found then return null; end if;

  if b.tipagem is not null and b.tipagem not in ('—','Não tipada') then
    select min(a.at) into tip_em from public.audit_log a
     where a.tabela = 'bolsas' and a.registro = b.id and a.acao = 'UPDATE'
       and coalesce(a.antes->>'tipagem','—') in ('—','Não tipada')
       and coalesce(a.depois->>'tipagem','—') not in ('—','Não tipada');
    if tip_em is null then tip_em := b.created_at; end if;
  end if;

  select jsonb_build_object(
    'bolsa', jsonb_build_object('bolsa_id', b.bolsa_id, 'hemocomponente', b.hemocomponente, 'especie', b.especie,
      'tipagem', b.tipagem, 'data_coleta', b.data_coleta, 'origem', b.origem, 'hematocrito', b.hematocrito,
      'volume_g', b.volume_g, 'solucao', b.solucao, 'sistema_aberto', b.sistema_aberto, 'validade', b.validade,
      'validade_em', b.validade_em, 'status', b.status, 'entrada_em', b.created_at),
    'tipagem_em', tip_em,
    'compat', coalesce((select jsonb_agg(jsonb_build_object('numero', l.numero, 'data', l.data_exame,
        'resultado', l.dados->>'compatibilidade', 'autoaglutinacao', l.dados->>'autoaglutinacao',
        'maior', l.dados->>'prova_maior', 'menor', l.dados->>'prova_menor') order by l.data_exame, l.numero)
      from public.laudos l where l.tipo = 'compatibilidade' and l.dados->>'bolsa_id' = b.bolsa_id and l.dados->>'compatibilidade' in ('COMPATÍVEL','INCOMPATÍVEL','INCONCLUSIVO')), '[]'::jsonb),
    'saidas', coalesce((select jsonb_agg(jsonb_build_object('data', s.data_saida, 'paciente', s.receptor, 'clinica', s.clinica, 'endereco', s.endereco, 'cidade', s.cidade,
        'hemocomponente', s.hemocomponente, 'teste_tipagem', s.teste_tipagem, 'compatibilidade', s.compatibilidade,
        'entregue_em', s.entregue_em, 'recebido_por', s.recebido_por, 'temp_chegada', s.temp_chegada,
        'motorista', s.motorista, 'retirada_em', s.retirada_em, 'recebimento_status', s.recebimento_status, 'recebimento_obs', s.recebimento_obs) order by s.data_saida, s.created_at)
      from public.saidas s where s.bolsa_id = b.bolsa_id), '[]'::jsonb)
  ) into res;
  return res;
end $$;
revoke all on function public.fn_rastreio(uuid) from public;
grant execute on function public.fn_rastreio(uuid) to anon, authenticated;

-- Registro pelo QR (sem login): motorista (retirada) e clínica (recebimento). Cada etapa só pode ser gravada UMA vez,
-- sempre na saída mais recente da bolsa. Tudo validado no servidor.
create or replace function public.fn_registrar_retirada(p_token uuid, p_motorista text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bolsas; s public.saidas; nome text := btrim(coalesce(p_motorista,''));
begin
  if char_length(nome) < 2 or char_length(nome) > 80 then return jsonb_build_object('ok', false, 'erro', 'Informe o nome do motorista.'); end if;
  select * into b from public.bolsas where qr_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'erro', 'Código não reconhecido.'); end if;
  select * into s from public.saidas where bolsa_id = b.bolsa_id order by data_saida desc, created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'erro', 'Esta bolsa ainda não teve saída registrada.'); end if;
  if s.retirada_em is not null then return jsonb_build_object('ok', false, 'erro', 'A retirada já foi registrada.'); end if;
  if s.entregue_em is not null then return jsonb_build_object('ok', false, 'erro', 'A bolsa já foi recebida.'); end if;
  update public.saidas set motorista = nome, retirada_em = now() where id = s.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_registrar_retirada(uuid, text) from public;
grant execute on function public.fn_registrar_retirada(uuid, text) to anon, authenticated;

create or replace function public.fn_confirmar_recebimento(p_token uuid, p_nome text, p_status text, p_temp numeric, p_obs text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare b public.bolsas; s public.saidas; nome text := btrim(coalesce(p_nome,'')); obs text := nullif(btrim(coalesce(p_obs,'')), '');
begin
  if char_length(nome) < 2 or char_length(nome) > 80 then return jsonb_build_object('ok', false, 'erro', 'Informe o nome de quem recebeu.'); end if;
  if p_status not in ('OK','PROBLEMA') then return jsonb_build_object('ok', false, 'erro', 'Status inválido.'); end if;
  if p_status = 'PROBLEMA' and obs is null then return jsonb_build_object('ok', false, 'erro', 'Descreva o problema.'); end if;
  if obs is not null and char_length(obs) > 300 then obs := left(obs, 300); end if;
  if p_temp is not null and (p_temp < -30 or p_temp > 50) then return jsonb_build_object('ok', false, 'erro', 'Temperatura inválida.'); end if;
  select * into b from public.bolsas where qr_token = p_token;
  if not found then return jsonb_build_object('ok', false, 'erro', 'Código não reconhecido.'); end if;
  select * into s from public.saidas where bolsa_id = b.bolsa_id order by data_saida desc, created_at desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'erro', 'Esta bolsa ainda não teve saída registrada.'); end if;
  if s.entregue_em is not null then return jsonb_build_object('ok', false, 'erro', 'O recebimento já foi registrado.'); end if;
  update public.saidas set recebido_por = nome, entregue_em = now(), temp_chegada = p_temp,
         recebimento_status = p_status, recebimento_obs = obs where id = s.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.fn_confirmar_recebimento(uuid, text, text, numeric, text) from public;
grant execute on function public.fn_confirmar_recebimento(uuid, text, text, numeric, text) to anon, authenticated;



-- ---------- Pedidos e liberação de bolsas ----------
create table if not exists public.pedidos (
  id               uuid primary key default gen_random_uuid(),
  numero           bigint generated always as identity,
  paciente         text not null check (char_length(paciente) between 1 and 80),
  especie          text not null check (especie in ('Canino','Felino')),
  raca             text check (raca is null or char_length(raca) <= 80),
  sexo             text check (sexo is null or sexo in ('Macho','Fêmea')),
  peso             numeric(5,1) not null check (peso > 0 and peso < 200),
  ht_atual         numeric(4,1) not null check (ht_atual >= 0 and ht_atual <= 100),
  ht_alvo          numeric(4,1) check (ht_alvo is null or (ht_alvo >= 0 and ht_alvo <= 100)),
  clinica          text not null check (char_length(clinica) between 1 and 100),
  veterinario      text not null check (char_length(veterinario) between 1 and 80),
  tutor            text check (tutor is null or char_length(tutor) <= 80),
  telefone         text check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  tipo_solicitacao text not null check (tipo_solicitacao in ('tipagem','crossmatch','bolsa')),
  componente       text not null check (componente in ('Concentrado de hemácias','Sangue total','Plasma','Plaquetas')),
  tipagem_paciente text check (tipagem_paciente is null or char_length(tipagem_paciente) <= 30),
  status           text not null default 'aberto' check (status in ('aberto','concluido','cancelado')),
  bolsa_id         text check (bolsa_id is null or char_length(bolsa_id) <= 40),
  alternativa      boolean not null default false,
  resultado        text check (resultado is null or resultado in ('COMPATÍVEL','INCOMPATÍVEL','LIBERAÇÃO DIRETA','TIPAGEM REALIZADA')),
  tentativas       integer not null default 0,
  saida_id         uuid,
  laudo_id         uuid,
  concluido_em     timestamptz,
  created_by       uuid not null default auth.uid() references auth.users(id),
  created_at       timestamptz not null default now()
);
create index if not exists pedidos_status_idx on public.pedidos (status, created_at desc);

alter table public.saidas add column if not exists pedido_id uuid;
alter table public.laudos add column if not exists pedido_id uuid;

alter table public.pedidos enable row level security;
revoke all on public.pedidos from anon;
drop policy if exists pedidos_select on public.pedidos;
drop policy if exists pedidos_insert on public.pedidos;
drop policy if exists pedidos_update on public.pedidos;
drop policy if exists pedidos_delete on public.pedidos;
create policy pedidos_select on public.pedidos for select to authenticated using (true);
create policy pedidos_insert on public.pedidos for insert to authenticated with check (created_by = auth.uid());
create policy pedidos_update on public.pedidos for update to authenticated using (true) with check (true);
create policy pedidos_delete on public.pedidos for delete to authenticated using (created_by = auth.uid());

create or replace function public.fn_lock_pedidos() returns trigger
language plpgsql as $$
begin
  new.id := old.id; new.created_by := old.created_by; new.created_at := old.created_at; new.numero := old.numero;
  return new;
end $$;
drop trigger if exists trg_lock on public.pedidos;
create trigger trg_lock before update on public.pedidos for each row execute function public.fn_lock_pedidos();
drop trigger if exists trg_audit on public.pedidos;
create trigger trg_audit after insert or update or delete on public.pedidos for each row execute function public.fn_audit();


-- Contatos da ANILAB: troca uma única vez os valores antigos de fábrica (não sobrescreve o que você já editou em Ajustes)
update public.settings set address = 'R. Padre Rolim, 815 - Santa Efigênia, Belo Horizonte - MG, 30130-090' where id = 1 and address = 'Rua Monsenhor Horta 452 - Calafate';
update public.settings set phones  = '(31) 3395-3633' where id = 1 and phones = '(31) 99164-0108';
update public.settings set email   = 'contato@laboratorioanilab.com.br' where id = 1 and email = 'hemovitabs@gmail.com';


-- ---------- Cadastros: hospitais/clínicas e médicos veterinários ----------
create table if not exists public.clinicas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(nome) between 1 and 100),
  endereco   text not null check (char_length(endereco) between 1 and 200),
  cidade     text check (cidade is null or char_length(cidade) <= 60),
  telefone   text check (telefone is null or char_length(telefone) <= 30),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists clinicas_nome_uq on public.clinicas (lower(nome));

create table if not exists public.veterinarios (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (char_length(nome) between 1 and 80),
  crmv       text check (crmv is null or char_length(crmv) <= 30),
  telefone   text check (telefone is null or telefone ~ '^[0-9]{10,13}$'),
  clinica_id uuid references public.clinicas(id) on delete set null,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists veterinarios_nome_idx on public.veterinarios (lower(nome));

do $$
declare t text;
begin
  foreach t in array array['clinicas','veterinarios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (created_by = auth.uid())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (true) with check (true)', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (true)', t || '_delete', t);
    execute format('drop trigger if exists trg_lock on public.%I', t);
    execute format('create trigger trg_lock before update on public.%I for each row execute function public.fn_lock_fields()', t);
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.fn_audit()', t);
  end loop;
end $$;
grant select, insert, update, delete on public.clinicas, public.veterinarios to authenticated;

-- ---------- Segurança sanitária: nunca registrar SAÍDA de bolsa vencida (vale também para a API) ----------
create or replace function public.fn_bloqueia_saida_vencida() returns trigger
language plpgsql as $$
begin
  if (new.validade_em is not null and new.validade_em < now()) or (new.validade_em is null and new.validade is not null and new.validade < current_date) then
    raise exception 'Bolsa vencida: saída não permitida.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_saida_vencida on public.saidas;
create trigger trg_saida_vencida before insert on public.saidas for each row execute function public.fn_bloqueia_saida_vencida();


-- =====================================================================
-- PADRONIZAÇÃO EM CAIXA ALTA (UPPERCASE) — camada 2 (banco)
-- Converte os campos de TEXTO LIVRE para UPPER() em todo INSERT/UPDATE, mesmo que a API receba minúsculo.
-- Ficam de fora, de propósito: e-mail, URLs, tokens/UUIDs, assinatura (data:image) e os campos de vocabulário
-- controlado que o sistema compara por código (status, tipo, espécie, hemocomponente, tipagem, sexo, solução).
-- Esses continuam gravados como códigos e aparecem em MAIÚSCULAS na tela (CSS) e nos PDFs (toUpperSafe).
-- =====================================================================
create or replace function public.fn_force_uppercase() returns trigger
language plpgsql as $$
declare
  j     jsonb := to_jsonb(new);
  patch jsonb := '{}'::jsonb;
  c     text;
begin
  foreach c in array tg_argv loop
    if j ? c and jsonb_typeof(j -> c) = 'string' then
      patch := patch || jsonb_build_object(c, upper(j ->> c));
    end if;
  end loop;
  if patch <> '{}'::jsonb then new := jsonb_populate_record(new, patch); end if;
  return new;
end $$;

-- Colunas de texto livre por tabela: 1) migra os registros existentes; 2) cria o gatilho trg_zupper (roda depois do trg_lock)
do $$
declare
  mapa jsonb := '{
    "settings":     ["vet_name","crmv","mapa","address","phones"],
    "laudos":       ["animal","raca","responsavel","observacoes"],
    "bolsas":       ["bolsa_id","origem","doador","tutor","observacoes"],
    "saidas":       ["receptor","tutor","raca","veterinario","nome_etiqueta","clinica","cidade","bolsa_id","origem","responsavel","observacoes","endereco","motorista","recebido_por","recebimento_obs"],
    "pedidos":      ["paciente","raca","clinica","veterinario","tutor","bolsa_id"],
    "clinicas":     ["nome","endereco","cidade"],
    "veterinarios": ["nome","crmv"]
  }';
  t text; c text; cols text[];
begin
  for t in select jsonb_object_keys(mapa) loop
    if to_regclass('public.' || t) is null then continue; end if;
    select array_agg(x) into cols from jsonb_array_elements_text(mapa -> t) x
      where exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = x);
    -- migração segura: só toca linhas que ainda têm minúsculas
    foreach c in array cols loop
      execute format('update public.%I set %I = upper(%I) where %I is not null and %I <> upper(%I)', t, c, c, c, c, c);
    end loop;
    execute format('drop trigger if exists trg_zupper on public.%I', t);
    execute format('create trigger trg_zupper before insert or update on public.%I for each row execute function public.fn_force_uppercase(%s)',
                   t, (select string_agg(quote_literal(x), ',') from unnest(cols) x));
  end loop;
end $$;
