# Acessos: conta-tools-contabil

Sistema no conta-tools-auth: `conta-tools-contabil`. Papéis: `leitura` < `operador` < `responsavel`.
Acesso por módulo: quem tem o módulo vê todas as empresas (não existe filtro por empresa).
Atualizar no MESMO commit de qualquer rota ou tela que ganhe ou mude controle de acesso.

| Tela UI | Endpoint(s) | Módulo | Papel mínimo |
|---|---|---|---|
| Importar do IGC (`/`) | `GET /` | qualquer papel no sistema | sessão |
| Importar do IGC | `POST /importacoes` | `conciliacao` | `operador` |
| Importar do IGC | `GET /importacoes` | `conciliacao` | `leitura` |
| - | `GET /version`, `GET /status`, `GET /nav.js` | público | - |
| - | `GET /me/papeis` | sem credencial devolve `{}` | - |
