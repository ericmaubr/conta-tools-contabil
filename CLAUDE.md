# conta-tools-contabil: Regras para o Claude

## Antes de qualquer implementação

1. Leia `C:\dev\conta-tools-shared\CLAUDE.md`: hub do ecossistema ContaTools
2. Leia `C:\dev\conta-tools-shared\CONTEXT.md`: o que já existe no shared
3. Leia `C:\dev\conta-tools-launcher\docs\HAMBURGER-MENU.md`: padrão web (menu)
4. Leia [`docs/superpowers/specs/2026-10-09-conciliacao-contabil-design.md`](docs/superpowers/specs/2026-10-09-conciliacao-contabil-design.md): desenho e decisões
5. Leia `CONTEXT.md`: o que este repo já tem implementado

## Este repo

Serviço FastAPI (irmão do `conta-tools-nfts`, sem card no launcher). Ferramenta de produtividade:
acelerar a conciliação contábil com mais precisão. Recebe razão, balancete e plano de contas
exportados do IGC, confere, guarda por mês e (fases seguintes) pareia lançamentos, cruza com NFS-e
do nfts, gera ajustes no CSV de importação do IGC.

## Regras que já custaram caro

- Exportação do IGC é HTML com extensão `.xls` em **cp1252**. Ler como UTF-8 destrói os acentos (o
  protótipo dos mockups fez isso e parecia que a origem vinha sem acento).
- Dinheiro é `Decimal`. Saldo interno é sempre D − C. O sinal do saldo impresso no razão depende da
  natureza da conta (ativo D − C, demais C − D): use o balancete, que traz o lado D/C explícito.
- Débito/Crédito do CSV do IGC é o reduzido **sem o hífen** (`106-6` vira `1066`), não sem o dígito.
- Importação com divergência é recusada inteira. Nada de gravar pela metade.
- Nenhuma conta é excluída: o analista escolhe o que conciliar.
- `examples/` e os `dados*.js` dos mockups são dado de cliente: fora do git.

## O que NÃO pertence a este repo

- Notas fiscais (busca, PDF, cobertura): consumir do `conta-tools-nfts` pela porta 5012.
- Cadastro de empresas: identidade vem do `conta-tools-empresas`.
- Ideias adiadas: `C:\dev\conta-tools-shared\docs\PARKING-LOT.md`, nunca aqui.
