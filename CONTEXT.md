# conta-tools-contabil: o que já existe

Atualizado a cada round de implementação.

## Fase 1 (esqueleto e importação)

- CLI: `--version`, `migrar`, `provisionar-db`, `serve --conf api.conf`.
- Leitores do IGC (`igc/`): plano, balancete, razão.
- Conferências da importação (`importacao/conferencias.py`) e gravação por mês (`importacao/gravar.py`).
- API: `/version`, `/status`, `/nav.js`, `/me/papeis`, `POST /importacoes`, `GET /importacoes`, tela `/`.
