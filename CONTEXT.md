# conta-tools-contabil: o que já existe

Atualizado a cada round de implementação.

## Fase 1 (esqueleto e importação), versão 0.1.1

- CLI: `--version`, `migrar`, `provisionar-db`, `serve --conf api.conf`.
- Leitores do IGC (`igc/`): plano, balancete, razão. HTML em cp1252.
- Conferências da importação (`importacao/conferencias.py`) e gravação por mês
  (`importacao/gravar.py`), sincronizando lançamentos por identidade `(cnpj, reduzido, lote_lcto)`.
- API: `/version`, `/status` (toca o banco), `/nav.js`, `/me/papeis`, `POST /importacoes`,
  `GET /importacoes`, tela `/` (importar e ver o histórico). RBAC por módulo (`docs/ACESSOS.md`).

Conferido com os arquivos reais da Brasil Reverso (01 a 07/2026): 350 contas no razão, 378 no
balancete, 15.289 lançamentos, 1.666 contas com reduzido no plano, 0 divergências.

Formatos descobertos na fase 1 (estão nos docstrings de `igc/`):
- o razão imprime o saldo com o sinal da natureza (ativo D − C, demais C − D); o D − C vem do balancete;
- o balancete marca com menos o saldo contra a natureza ("-28,74 C"): o lado real é a letra.

## Pendente

- Deploy: seção nova em `conta-tools-web/DEPLOY.md` (porta 5016, Caddy `/contabil/*`,
  `python-multipart` como dependência explícita, `provisionar-db`, `migrar`, NSSM). Fica para quando
  o Eric decidir subir.
- Fases 2 a 4 da spec: pareamento e decisões, tela de conciliação ligada à API, NFS-e/ajustes/CSV e
  fechar conta.
