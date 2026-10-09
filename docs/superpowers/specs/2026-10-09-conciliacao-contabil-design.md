# Conciliação contábil: desenho

Data: 2026-10-09. Autor das decisões: Eric. Base: mockups em `mockups/` (tela de referência
`tela-v1-conciliacao.html`), dados reais da Brasil Reverso (razão, balancete e plano de jan a jul/2026).

## 1. Propósito

Ferramenta de **produtividade**: acelerar a conciliação das contas e, ao mesmo tempo,
aumentar a qualidade da entrega, porque a conciliação fica mais precisa. Toda decisão de tela e de
regra passa por este filtro: o elemento acelera a conciliação ou a torna mais precisa? Se não faz
nenhum dos dois, sai ou fica atrás de um clique. A tela tem que ser simples, precisa, rápida e clara.

## 2. Escopo

**Nesta especificação (v1):**
- importar razão, balancete e plano de contas exportados do IGC, com conferências;
- guardar uma cópia do razão e todas as decisões do analista, por empresa e por mês;
- parear lançamentos em camadas (documento, documento com centavos, valor e nome, valor em conta de
  um terceiro) e propor sugestões;
- tela de conciliação (a V1 dos mockups) ligada à API;
- NFS-e recebidas que não estão no razão, via conta-tools-nfts;
- ajustes de centavos e CSV no formato de importação do IGC;
- fechar conta (saldo atestado);
- registro de ações (quem, quando) e desfazer.

**Fora da v1, no parking lot do ecossistema** (`conta-tools-shared/docs/PARKING-LOT.md`):
- sugestão por IA (Claude), sempre como sugestão verificada, nunca conciliando sozinha;
- planilha Excel (o mockup do arquivo ainda não foi desenhado).

**Não será feito**: acesso restrito por empresa. Decisão do Eric (2026-10-09): o acesso é por módulo,
e quem tem o módulo vê todas as empresas.

## 3. Lista de requisitos (aprovada em 2026-10-09)

Cada requisito é sim ou não. Tela que falha em um deles não está pronta; não há média.

Rápida:
1. Abre nas contas com pendência, na ordem de quem tem mais a fazer. Pendência inclui NFS-e e
   ajustes a lançar.
2. Pareamento seguro (mesmo documento e mesmo valor) chega conciliado, sem pedir confirmação.
3. Aceitar uma sugestão custa um clique; aceitar todas as de uma conta também.
4. Dá para conciliar pelo teclado.
5. A reimportação mantém o que já foi feito.
6. O CSV de ajustes sai pronto para importar no IGC, sem edição.

Precisa:
7. Os saldos conferem com o balancete e a tela mostra quando não conferem.
8. Diferença de centavos nunca fecha sozinha: o grupo só fecha junto com o ajuste a lançar.
9. NFS-e recebida que não está no razão aparece dentro da conta do fornecedor.
10. Bruto da nota e pagamento esperado (líquido) aparecem separados e com nome.
11. Sugestão (de regra ou de IA) nunca concilia sozinha.
12. Toda ação pode ser desfeita e fica registrado quem fez e quando.
13. A tela avisa quando a base de NFS-e não cobre o período: última sincronização com erro,
    empresa sem certificado ou notas que não chegam ao fim do período. A idade da sincronização
    não importa (o nfts sincroniza todo dia; a conciliação olha meses fechados).

Clara:
14. Cada linha está em aberto, sugerida ou conciliada; o que falta lançar no IGC tem sempre a mesma cara.
15. Botões com rótulo; ação destrutiva afastada da principal; botão que não se aplica não aparece
    (nada de botão desabilitado sem motivo).
16. O que já está conciliado só aparece se o analista pedir.
17. A tela mostra quanto falta para fechar a empresa inteira no período.

Preferências visuais do Eric: nenhum texto cinza (tudo em `#1f2430`); aviso de desfazer grande e laranja.

## 4. Fontes: exportações do IGC

As três exportações são HTML com extensão `.xls`, codificadas em cp1252 (Latin-1), com os acentos
intactos ("ALUGUÉIS", "APLICAÇÕES"). Ler os bytes e decodificar como cp1252; ler como UTF-8 destrói
os acentos (foi o erro do extrator descartável dos mockups, que fez parecer que a origem já vinha sem
acento). Parser de HTML (tabela única, `<tr>`/`<td>` com `<font>`/`<b>` dentro), sem confiar na extensão.

**Plano de contas** (`PLANO DE CONTAS - <EMPRESA> <ANO>.xls`): colunas Classificação, Código
(reduzido, formato `106-6`), Descrição, CNPJ, Grau. Linha com reduzido é analítica; sem reduzido é
sintética (vira agrupador da lista de contas).

**Balancete**: colunas Conta (classificação), Reduzida, Descrição, Saldo Anterior (`1.234,56 D` ou
`28,74 C`), Débito, Crédito, Saldo Atual. O CNPJ da empresa vem no cabeçalho (primeira célula).
Só interessam as linhas com reduzido no formato `\d+-\d`.

**Razão**: blocos por conta. A linha de abertura do bloco tem `Conta: 211010036` na primeira coluna
e `Red.: 73-6 NOME` na segunda, com o saldo anterior na coluna de saldo. Os lançamentos têm Data
(`dd/mm/aaaa`), Histórico, CP (contrapartida, reduzido; `-` é lançamento sem contrapartida),
Lote/Lcto, Débito, Crédito, Saldo.

**Sinais**: o razão imprime o saldo com o sinal da natureza: D − C no grupo 1 (ativo) e C − D em todos
os outros (passivo, receitas, custos, despesas), conferido nas 350 contas do exemplo. Internamente tudo é
D − C: valor do lançamento = débito − crédito (colunas separadas, sem ambiguidade); o saldo anterior vem
do **balancete**, que traz o lado D/C explícito. O saldo impresso do razão só entra na conferência, em
valor absoluto. Assim um plano com outra natureza de contas não quebra a leitura.

**Identidade do lançamento**: (conta reduzida, Lote/Lcto). Única nas 15.289 linhas do exemplo. É a chave
que permite reimportar sem perder conciliação.

**Conferências na importação** (todas obrigatórias; a importação falha inteira se uma falhar, nada
é gravado pela metade):
- o balancete fecha (soma dos saldos);
- para cada conta: saldo anterior + soma dos lançamentos = último saldo do razão;
- razão bate com o balancete conta a conta (saldo anterior, débitos, créditos, saldo atual). No exemplo:
  350 contas, 0 divergências;
- saldo anterior do período importado = saldo final já gravado do mês anterior, quando houver;
- contas com saldo e sem movimento existem só no balancete (28 no exemplo): entram como conta sem
  lançamentos, com o saldo anterior como item em aberto.

**Escopo de contas**: todas as contas do razão e do balancete, sem exclusão. Decisão do Eric
(2026-10-09): o analista escolhe o que quer conciliar, pelo filtro de grupo e pela busca da lista de
contas. A ferramenta não decide por ele (os mockups excluíam o disponível 1.1.1 e as contas de
resultado; isso não vale para o sistema).

## 5. Períodos

A importação aceita qualquer intervalo (empresa com fechamento em atraso manda o acumulado); a gravação
é por **mês**. O saldo anterior entra como item em aberto ("período anterior"). Itens que ficam em
aberto num mês voltam no mês seguinte como parte do saldo anterior e continuam pareáveis.

## 6. Pareamento

Camadas, nesta ordem. Cada grupo guarda a camada que o formou (vira a etiqueta do motivo na tela).

| Camada | Nome na tela | Regra | Resultado |
|---|---|---|---|
| R1 | mesmo nº de documento | mesmo número no histórico (`NOTA`/`NF` + nº, ou nº de 3+ dígitos), soma zero, tem débito e crédito | conciliado direto |
| R2 | mesmo documento, diferença de centavos | como R1, mas a soma difere até R$ 0,05 | sugestão; só fecha com ajuste |
| R3 | mesmo valor, sem documento em comum | valor oposto exato, mais próximo no tempo | sugestão |
| R4 | valor em conta de um terceiro | valor oposto exato em conta marcada como "de um terceiro" | sugestão |
| Manual | agrupado manualmente | o analista marca lançamentos que somam zero (tolerância R$ 0,05) | conciliado |
| Aceita | sugestão aceita | sugestão R2/R3/R4 confirmada | conciliado |

Regras:
- Diferença de centavos nunca fecha sozinha. Aceitar um grupo R2 cria o ajuste a lançar (seção 8).
- Uma conta pode ser marcada pelo analista como "de vários terceiros"; o padrão é "de um terceiro".
  R4 só roda em conta de um terceiro.
- **Candidatos** (ajuda visual, não camada): com lançamentos marcados e diferença, a tela destaca os
  lançamentos em aberto da mesma conta que zeram a diferença; se não houver um sozinho, pares
  (no máximo 20). Ordem por data mais próxima dos marcados. A tela não escolhe.
- **Pagamento esperado da NFS-e** (camada a desenhar no plano, dentro da v1): nota + retenções +
  pagamento igual ao `valor_liquido_nfse` do nfts formam um grupo quando existe **um único**
  pagamento candidato. Com mais de um (nota mensal de mesmo valor), fica com os candidatos.

## 7. NFS-e recebidas sem lançamento (integração nfts)

Contrato aprovado e em produção: `conta-tools-nfts/docs/CONTRATO-CONTABIL.md` (nfts 0.9.50). Resumo:
- `GET /notas/busca`, `POST /notas/consulta-lote` (até 500 itens), `GET /notas/{chave}/pdf?cnpj_empresa=`,
  `GET /cobertura`;
- chamada entre serviços pela porta direta `http://127.0.0.1:5012`, com chave de serviço lida do
  `api.conf` (seção `[servicos_chaves]`), nunca escrita no código nem no log;
- cliente HTTP: 404 é resposta, qualquer outro erro levanta.

Regras de negócio:
- o analista lança o **bruto** da nota (crédito no fornecedor) e o **líquido** no pagamento;
  `valor_liquido_nfse` (do `<vLiq>`) é o pagamento esperado; o `valor_liquido_calculado` é só informativo;
- NFS-e do período cujo número não aparece no histórico de nenhuma conta vira linha "a lançar"
  dentro da conta do fornecedor (pareada pelo CNPJ do plano; sem CNPJ, por nome) e fica **fora dos saldos**;
- fornecedor sem conta no plano: a nota aparece em "NFS-e sem conta de fornecedor", no topo da lista
  "o que falta lançar"; não há botão "já lancei" enquanto não houver conta;
- ações sobre a nota: abrir PDF, "já lancei" (some na reimportação que trouxer o lançamento), ignorar
  com motivo; todas no desfazer e no registro;
- cobertura (requisito 13) vem de `/cobertura`: `ultima_sincronizacao_ok`, `tem_certificado`,
  `ultima_data_emissao`.

## 8. Ajustes de centavos e CSV para o IGC

- "✓ Aceitar com ajuste": concilia o grupo R2 e cria o ajuste com o padrão da empresa (conta de ajuste,
  código de histórico, complemento sugerido, data do lançamento mais recente do grupo).
- "Ajustar…": abre o painel para escolher conta (busca no plano), histórico (lista padrão do IGC, aceita
  código fora dela), complemento (máx. 30) e data. O escolhido vira o padrão da empresa.
- Na primeira vez da empresa não há padrão: "Aceitar com ajuste" abre o painel. O padrão aparece no
  cabeçalho da conta.
- Direção: grupo com débito a mais credita a conta do grupo e debita a conta de ajuste (e vice-versa).
- Desfazer o grupo remove o ajuste; remover o ajuste devolve o grupo para Sugestões.
- Ajuste baixado no CSV sai da pendência e espera a reimportação.

**Formato do CSV** (modelo `examples/YUCATAN - FOLHA 02 2026.csv`): cabeçalho
`Data;Valor;Débito;Crédito;Cod Histórico;Cla Deb;Cla Cre;Obs;C. Custo;Complemento`, separador `;`,
Latin-1, CRLF, sem BOM, data `dd/mm/aaaa`, valor com vírgula, sem separador de milhar e sem zeros à
direita, complemento até 30 caracteres. Débito e Crédito são o **reduzido sem o hífen** (`106-6` vira
`1066`; não é o reduzido sem o dígito). Lista de históricos: `examples/lista_hist_padrao.slk` (SYLK,
169 itens, descrição cortada em 25 caracteres).

## 9. Fechar conta

- "✓ Fechar conta" aparece só quando a conta não tem sugestão para revisar nem nada a lançar no IGC;
  senão o cabeçalho diz o que falta.
- O analista atesta que os itens em aberto são o saldo correto no fim do período (composição do saldo).
  Os itens continuam em aberto e viram saldo anterior no mês seguinte.
- Observação opcional, no nível da conta.
- O fechamento guarda uma assinatura do estado da conta; qualquer mudança depois (ação, reimportação)
  reabre a conta sozinha, com o motivo visível. Nunca fechar automaticamente.
- Conta fechada sai da contagem "falta para fechar" e do filtro de pendência; tem botão Reabrir.

## 10. Tela

Referência visual e de comportamento: `mockups/tela-v1-conciliacao.html` (estado em 2026-10-09).
Elementos: faixa "Falta para fechar o período" com cobertura do nfts; lista de contas com filtro por
grupo, busca e "só contas com pendência"; cabeçalho da conta com saldos, selo do balancete e
fechamento; seções Em aberto (ou "Saldo em dd/mm/aaaa" quando fechada), A lançar no IGC, Sugestões
(aberta) e Conciliados (recolhida); barra de seleção com débitos, créditos, diferença, candidatos e
Agrupar; atalhos ↑↓, Espaço, Enter, X, C, [ ], Ctrl+Z; registro de ações; tela "o que falta lançar".

Padrões do ecossistema que a tela segue: menu hambúrguer com `GET /nav.js` registrado antes das páginas
(`conta-tools-launcher/docs/HAMBURGER-MENU.md`), `fetch` com path relativo, versão no header,
CNPJ sempre formatado na exibição.

## 11. Arquitetura

Serviço web próprio, irmão do conta-tools-nfts, sem card no launcher.

- **Pacote** `conta_tools_contabil` (src layout), FastAPI + uvicorn, SQLAlchemy Core, Alembic dentro
  do pacote, `conta-tools-shared` para logging, versão, auth e testes.
- **Porta** 5016, path externo `/contabil/*` (Caddy). Atualizar `conta-tools-web/DEPLOY.md` (seção
  nova, tabela de portas, dependências) no mesmo round em que o deploy existir.
- **CLI**: `--version/--about`, `serve`, `migrar`, `provisionar-db` (cópia adaptada de
  `conta_tools_empresas/cli/provisionar_db.py`, role `conta_tools_contabil_app`, banco
  `conta_tools_contabil`).
- **Rotas obrigatórias**: `/version`, `/status` (toca o banco de verdade), `/nav.js`.
- **Auth**: RBAC do conta-tools-auth, sistema `conta-tools-contabil`. Módulos: `conciliacao`
  (ler e decidir) e `ia` (envio de dados ao Claude, quando existir). Acesso por módulo; quem tem o
  módulo vê todas as empresas (não haverá acesso restrito por empresa). Tela protegida usa `instalar_redirect_de_tela`. `docs/ACESSOS.md` mantido no mesmo commit
  de qualquer rota nova. Teste único `assert_rotas_protegidas` cobrindo todas as rotas.
- **Empresa**: identidade vem do conta-tools-empresas (`igc_id`, `codigo_estabelecimento_igc`, CNPJ,
  razão social) por endpoint; o CNPJ do cabeçalho do balancete casa a empresa.
- Handler `async def` nunca chama trabalho síncrono pesado direto (importação de 17 MB é pesada):
  `asyncio.to_thread`.

## 12. Dados (Postgres)

Retenção: para sempre. Conciliação compartilhada por empresa (todos os analistas veem e mexem na mesma).

| Tabela | Conteúdo | Chave |
|---|---|---|
| `importacao` | uma por envio: empresa, período, arquivos (hash), quem, quando, resultado das conferências | id |
| `plano_conta` | plano versionado por importação: classificação, reduzido, descrição, CNPJ, grau | (importacao, reduzido) |
| `conta_mes` | saldo anterior, débitos, créditos, saldo final por conta e mês, marca "de vários terceiros" | (empresa, reduzido, mês) |
| `lancamento` | cópia do razão: data, histórico, contrapartida, lote/lcto, valor D − C | (empresa, reduzido, lote_lcto) |
| `grupo` | conciliação: camada, estado (sugestão, conciliado), quem e quando | id |
| `grupo_lancamento` | lançamentos do grupo | (grupo, lançamento) |
| `ajuste` | ajuste a lançar: grupo, conta de ajuste, histórico, complemento, data, valor, exportado em | id |
| `nfse_tratamento` | ação sobre NFS-e: chave de acesso, estado (lançada, ignorada), motivo, conta escolhida | (empresa, chave) |
| `fechamento` | conta fechada: empresa, reduzido, mês, observação, assinatura, quem, quando | (empresa, reduzido, mês) |
| `config_empresa` | conta de ajuste e histórico padrão | empresa |
| `acao` | registro append-only de toda ação, com o estado anterior para desfazer | id |

Regras:
- chave de upsert só com identidade (nunca coluna mutável);
- importação, plano e conferências na mesma transação;
- desfazer persistente: lê o estado anterior em `acao` e grava uma nova ação "desfez", nunca apaga.

## 13. Testes e qualidade

- Testes com o wrapper `python C:/dev/conta-tools-shared/scripts/testar.py`.
- Leitores do IGC testados contra trechos reais anonimizados em `tests/fixtures/` (os arquivos de
  `examples/` têm dados de cliente e não entram no git).
- Conferências testadas com casos que falham (balancete que não fecha, razão divergente).
- CSV testado byte a byte contra o modelo da Yucatan.
- `.githooks/pre-commit` de hardening ligado.
- PATCH do `pyproject.toml` a cada round de código.

## 14. Em aberto (perguntas ao Eric, não suposições)

1. Conta de ajuste por empresa: o Eric vai confirmar com o contador; a tela já resolve com o padrão
   escolhido pelo analista.

Respondida: NF-e de mercadoria (vendas "Nota 8479+" não estão no nfts) fica fora da v1. O
conta-tools-nfe não dá suporte a NF-e recebida; a ideia é usar a exportação do F-Sist, registrada no
parking lot do ecossistema ("NF-e recebidas (exportação do F-Sist)") para ser discutida depois da v1.

## 15. Fases de implementação

Cada fase vira um plano próprio (skill writing-plans) e termina com algo que roda.

1. **Esqueleto e importação**: pacote, CLAUDE.md, CLI, `/version` `/status` `/nav.js`, auth, Postgres
   (migrar, provisionar-db), leitores do IGC, conferências, gravação por mês, tela mínima de
   importação com o resultado das conferências.
2. **Pareamento e decisões**: camadas R1 a R4, grupos, aceitar, recusar, agrupar, desfazer, registro,
   API da conta.
3. **Tela de conciliação**: a V1 ligada à API, teclado, candidatos, faixa.
4. **NFS-e, ajustes, CSV e fechar conta**.
5. Parking lot: IA, Excel, NF-e recebidas do F-Sist.
