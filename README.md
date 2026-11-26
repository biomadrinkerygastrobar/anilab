# ANILAB — Banco de Sangue

Sistema web para laudos de **tipagem** e **compatibilidade**, controle de **entrada** e **saída** de bolsas, com PDF e envio por WhatsApp. Paleta: azul-marinho `#183C60`, azul `#1E9BD7`, fundo `#F7F7F7` (da logo ANILAB).

Stack: HTML/CSS/JS puro + **Supabase** (banco e login) + **Vercel** (hospedagem e headers).

## Como publicar

1. **Supabase**: crie um projeto → *SQL Editor* → cole e rode `supabase/schema.sql`.
2. Supabase → *Authentication → Providers → Email*: **desligue "Allow new users to sign up"** e crie os usuários da equipe em *Authentication → Users* (senha de 8+ caracteres).
3. Supabase → *Project Settings → API*: copie a **URL** e a chave **anon/public** (nunca a `service_role`).
4. **Vercel**: importe esta pasta (via GitHub) → *Environment Variables*: `SUPABASE_URL` e `SUPABASE_ANON_KEY` → Deploy.
5. Entre no site → *Ajustes* → envie a imagem da assinatura do veterinário.

Para testar localmente: `cp .env.example .env`, preencha, rode `export $(cat .env | xargs) && sh build.sh` e abra `public/index.html` por um servidor estático.

## WhatsApp
- **Celular**: o botão abre o menu de compartilhar já com o PDF anexado → escolha o WhatsApp e o contato.
- **Computador**: baixa o PDF e abre o WhatsApp Web com a mensagem pronta (anexe o PDF baixado).
O envio 100% automático (sem tocar em nada) exige a API oficial do WhatsApp Business — dá para acrescentar depois.

## Checklist de segurança (20 itens)

| # | Item | Como está |
|---|------|-----------|
| 1 | Esconder chaves de API | Chaves só em variáveis da Vercel; `build.sh` gera `config.js` (ignorado pelo Git) |
| 2 | Limpar segredos do Git | `.gitignore` cobre `.env`, chaves e `config.js`. Se algum segredo já foi commitado, **troque a chave** |
| 3 | Chave pública do banco | Front usa só a `anon`; o build recusa `service_role` |
| 4 | RLS | Ativo em todas as tabelas (`schema.sql`) |
| 5 | Criptografar dados sensíveis | Supabase criptografa em repouso e em trânsito (TLS). Não há CPF/dados de cartão no sistema |
| 6 | Autenticação no servidor | Supabase Auth + políticas `to authenticated`; cadastro público desligado |
| 7 | Travar log | `audit_log` sem acesso pela API; gravado por trigger |
| 8 | Bloquear adulteração de campos | Trigger `fn_lock_fields` impede alterar `id`, `numero`, `created_by`, `created_at` |
| 9 | Cookies de sessão | ⚠ Supabase JS guarda a sessão no navegador (localStorage), não em cookie HttpOnly. Mitigado por CSP estrita + sem scripts inline. Cookie HttpOnly exigiria funções server-side (Next.js/Vercel Functions) |
| 10 | Hash de senhas | Feito pelo Supabase Auth (bcrypt) |
| 11 | Limitar tentativas de login | Bloqueio de 5 min após 5 erros no app + rate limit nativo do Supabase |
| 12 | Proteção contra bots | Campo-armadilha (honeypot). Recomendado: ative CAPTCHA (Turnstile/hCaptcha) em *Authentication → Attack Protection* |
| 13 | Parametrizar queries | Cliente Supabase (PostgREST) — sem SQL montado por texto |
| 14 | Validar entradas | Limpeza/limites no front **e** `CHECK` constraints no banco |
| 15 | Escapar conteúdo | Toda saída HTML passa por `esc()` |
| 16 | Restringir upload | Só PNG/JPG até 500 KB (assinatura), validado também no banco |
| 17 | Enxugar respostas | Todos os `select` listam colunas explícitas |
| 18 | Headers de segurança | CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy (`vercel.json`) |
| 19 | Forçar HTTPS | Vercel redireciona + HSTS com preload |
| 20 | Escanear dependências | Sem `node_modules`; bibliotecas via CDN com versão fixa. Antes de publicar, confira as versões e, se quiser, adicione SRI |

## Observações
- Laudos podem ser **excluídos** só por quem os criou; não há edição (reemita o laudo se errar).
- Ao registrar uma saída, a bolsa vira *Enviada* automaticamente; use a lista de Entradas para marcar *Retornou/Suspensa*.
- A conclusão da compatibilidade é calculada (qualquer prova positiva = incompatível). A interpretação clínica continua sendo do veterinário responsável.

## Atualizando um sistema já publicado (sem perder dados)
Os dados ficam no Supabase; o deploy da Vercel só troca o código.
1. **Backup**: Supabase → Table Editor → exporte `bolsas`, `saidas`, `laudos` e `settings` em CSV.
2. **Banco primeiro**: rode `supabase/schema.sql` de novo no SQL Editor. Ele só cria o que falta (colunas, funções, políticas) e não apaga registros.
3. **Código depois**: troque `public/`, `vercel.json` e `build.sh` no repositório; a Vercel republica sozinha (as variáveis de ambiente continuam valendo).
4. Abra o site com `Ctrl+Shift+R`.
O histórico de alterações só registra mudanças feitas **depois** da atualização do banco.

## Rastreabilidade por QR code

- Toda etiqueta (entrada e saída) sai com um **QR code**. Ao aproximar o celular, abre a página pública `https://SEU-DOMINIO/?r=<código>` com a linha do tempo da bolsa:
  1. **Pré-analítica:** coleta e entrada no banco (volume, hematócrito, validade);
  2. **Analítica:** tipagem e provas de compatibilidade;
  3. **Pós-analítica:** saída, hospital de destino e **chegada ao hospital** (data/hora, quem recebeu, temperatura).
- A chegada é registrada na tela **Saídas → Editar** (campos "Chegada ao hospital", "Recebido por", "Temperatura").
- **Privacidade:** a página pública não mostra nome de doador, tutor, paciente nem veterinário. O código do QR é um UUID aleatório por bolsa (não dá para adivinhar) e a consulta passa só pela função `fn_rastreio`; as tabelas continuam fechadas para anônimos.
- O QR usa o endereço onde o sistema está publicado. Gere as etiquetas pelo site publicado (não pelo arquivo de demonstração) para que o link funcione em qualquer celular.
- Para atualizar um sistema já publicado: faça backup, rode o `supabase/schema.sql` novamente (cria o código das bolsas existentes e os campos de chegada) e faça o redeploy.

### Endereço do QR e dados do paciente
- Em **Ajustes → "Endereço público do sistema"** informe o endereço do site publicado (ex.: `https://seu-sistema.vercel.app`). O QR passa a usar sempre esse endereço, mesmo se a etiqueta for gerada em outro lugar. QR gerado pelo arquivo de demonstração ou por endereço local **não abre em outro celular** (o sistema avisa).
- Em **Saídas** há o campo **Endereço do hospital ou clínica**. Ele sai na etiqueta, aparece na página do QR (com o link "Ver no mapa") e é sugerido nas próximas saídas para a mesma clínica.
- A página do QR mostra o **nome do paciente** e o endereço do hospital; tutor, doador e veterinário continuam ocultos.

## Pedidos e liberação de bolsas
Tela **Pedidos** (menu lateral): cadastra o pedido (paciente, espécie, peso, hematócrito, clínica, veterinário, tipo de solicitação e componente) e mostra na hora as bolsas disponíveis, com vencimento mais próximo primeiro (FEFO).
- **Volume estimado:** pelo hematócrito (peso × volemia × ΔHt ÷ Ht da bolsa) e faixa de referência em mL/kg (hemácias 6–10; sangue total e plasma 10–20; plaquetas conforme protocolo).
- **Sem bolsa exata:** aparece o aviso amarelo e as alternativas (outro componente, ou DEA-1 diferente em cães). Liberar uma alternativa exige marcar a confirmação do veterinário. Em gatos, bolsa de tipo incompatível nunca é oferecida; bolsas sem tipagem ou vencidas também nunca.
- **Incompatível:** a bolsa continua disponível, o teste fica registrado (laudo ligado ao pedido) e a seleção é limpa para escolher outra.
- **Compatível / liberar:** a bolsa passa a *enviada* ("utilizada / vendida"), é criada a saída e o laudo, e aparecem os botões **Gerar laudo PDF** e **Gerar etiqueta** (etiqueta 150×100 com data/hora da liberação e validade após aberta).
- Dois operadores não conseguem liberar a mesma bolsa: a reserva só passa se ela ainda estiver disponível.
- Atualização de banco: rode o `supabase/schema.sql` de novo (cria a tabela `pedidos` e a coluna `pedido_id`).

## Transporte e recebimento (pelo QR)
Depois da saída, a página do QR mostra a etapa pendente:
1. **Motorista** abre o QR da etiqueta, informa o nome e toca em *Registrar retirada* (grava nome + data/hora).
2. **Quem recebe na clínica** abre o mesmo QR, informa o nome (e, se quiser, a temperatura) e toca em **OK — recebi a bolsa** ou **Há problema** (com observação). O sistema atualiza a chegada automaticamente. Temperatura fora de 2–6 °C gera aviso.

Cada etapa só pode ser gravada **uma vez** (validado no banco). A equipe também vê/edita em *Saídas* (colunas Motorista e Chegada; chip vermelho PROBLEMA).
Observação de segurança: quem tiver o QR da bolsa consegue registrar essas duas etapas uma única vez; por isso o QR só deve ir na etiqueta física.
Para atualizar: rode de novo o `supabase/schema.sql` (SQL Editor) e `vercel --prod`.

## Triagem
A tela de Triagem foi removida. O cálculo de volume/Ht alvo e a escolha de bolsa continuam em *Pedidos*.

## Cadastros (hospitais/clínicas e veterinários)
Menu **Cadastros**: cadastre cada hospital/clínica (nome, endereço, cidade, telefone) e cada médico veterinário (nome, CRMV, WhatsApp e a clínica onde atua).
Em **Pedidos** e **Saídas** os campos de clínica e veterinário passam a sugerir os cadastrados; ao escolher, o endereço, a cidade e o WhatsApp são preenchidos sozinhos (o endereço vai para a etiqueta e para o QR). Ainda dá para digitar um nome que não esteja cadastrado.
Para ativar: rode de novo o `supabase/schema.sql` (cria as tabelas `clinicas` e `veterinarios`).

## Antes de usar de verdade (checklist de lançamento)
1. **Banco:** rode `supabase/schema.sql` no SQL Editor (pode rodar de novo a qualquer momento, não apaga dados). Foi testado em PostgreSQL 16 real: roda sem erros duas vezes seguidas.
2. **Usuários:** em Supabase → Authentication → Users, crie um usuário para cada pessoa da equipe e **desative "Allow new users to sign up"** (Authentication → Providers → Email) para que ninguém de fora crie conta.
3. **Variáveis na Vercel:** `SUPABASE_URL` e `SUPABASE_ANON_KEY` (a chave *anon*, nunca a *service_role*), depois `vercel --prod`.
4. **Ajustes:** confira endereço, telefone, e-mail, CRMV/MAPA, assinatura e o **endereço público do sistema** (para o QR abrir em qualquer celular).
5. **Teste de ponta a ponta:** cadastre uma clínica e um veterinário, crie um pedido, libere uma bolsa, imprima a etiqueta, leia o QR com outro celular e faça "retirada" e "recebimento".
6. **Imprima uma etiqueta de teste** na impressora real (150×100 mm, escala 100%, sem "ajustar à página") e leia o QR impresso.
7. **Cópia de segurança:** em Ajustes → *Baixar cópia de segurança*, toda semana; guarde o arquivo no Google Drive.

## Proteções embutidas
- Saída de bolsa **vencida é bloqueada** (no app e no banco).
- Sessão encerra após 30 min sem uso.
- Cada etapa do QR (retirada/recebimento) só grava uma vez; histórico de alterações em bolsas, laudos, saídas e pedidos.
- Tabelas fechadas para visitantes (RLS); o QR público só mostra rastreio da bolsa, sem nomes de tutor, doador ou veterinário.
- Instalável no celular: abra o site no Chrome → menu → *Adicionar à tela inicial*.

## Fluxo completo com QR (entrada → saída → motoboy → clínica)
1. **Entrada:** toda bolsa cadastrada já recebe um QR exclusivo, impresso na etiqueta da bolsa. O QR abre a ficha de rastreio (pré-analítica, analítica, saída, retirada e recebimento).
2. **Saída:** a equipe escaneia o QR da bolsa com a câmera do celular (logada no sistema) → toque em **Registrar saída desta bolsa**, preencha paciente e clínica e salve. Também dá para registrar manualmente em *Saídas* no computador.
3. **Etiquetas:** depois de salvar aparecem dois botões — *Etiqueta da bolsa* e **Etiqueta da caixa (QR)**, que vai do lado de fora do isopor (destino, endereço, paciente, bolsa, 2–6 °C).
4. **Motoboy:** escaneia o QR da caixa → informa o nome (fica lembrado no aparelho) → *Registrar retirada*.
5. **Clínica:** escaneia o mesmo QR → informa o nome → **OK — recebi** ou **Há problema**. O sistema atualiza sozinho.
A etiqueta da caixa também pode ser reimpressa em *Saídas* (botão **Caixa**).
