# Avaliação das telas "NFS-e sem lançamento" (N1 a N4)

Escrita em 2026-10-08. Objetivo: escolher o desenho da lista de NFS-e recebidas que não aparecem no razão.
Método: tarefas reais, rubrica combinada antes de olhar as telas, caminhada automática, três revisões
independentes e às cegas, e depois teste com analistas. Este arquivo guarda as tarefas e a rubrica; o resultado
é preenchido ao final.

## Telas avaliadas

| Tela | Em uma frase |
|---|---|
| N1 | Aba "NFS-e sem lançamento" ao lado de "Contas"; clicar numa nota mostra o detalhe à direita. |
| N2 | Faixa no topo com o resumo; "Ver as 5 notas" abre uma tela própria com a tabela. |
| N3 | Sem faixa: a nota aparece como linha "a lançar" dentro da conta do fornecedor; item "sem conta" na lista. |
| N4 | Faixa do topo (N2) mais a linha dentro da conta (N3), ligadas por um botão que abre a conta. |

## Tarefas do analista (caminho mínimo, contado em ações: clique ou digitação)

| # | Tarefa | Sucesso quando |
|---|---|---|
| T1 | Saber quantas NFS-e recebidas estão sem lançamento | o total (5) aparece na tela |
| T2 | Ver bruto, retenções e líquido da nota 4719 (VIANA) | os três valores aparecem |
| T3 | Abrir a conta do Google e ver a nota dele como linha a lançar | a nota aparece dentro da conta |
| T4 | Descobrir quais fornecedores não têm conta no plano e o que fazer | a lista das sem conta e a ação aparecem |
| T5 | Marcar a 4719 como "já lancei no IGC" e ver os contadores atualizarem | a nota sai da pendência |
| T6 | Abrir o PDF da nota 4719 | o botão de PDF é acionado |
| T7 | Trabalhando na conta VIANA, perceber sem agir que há NFS-e a lançar nela | aparece sem nenhum clique |

## Rubrica (nota de 1 a 5 por critério; peso entre parênteses)

UX:
- U1 Visão geral: saber o tamanho do problema em até um clique (2)
- U2 Esforço: ações necessárias nas tarefas (2)
- U3 Contexto: ver a nota onde ela vai ser lançada (3)
- U4 Descoberta: entender sem treinamento (1)
- U5 Erro e recuperação: risco de errar e facilidade de desfazer (2)
- U6 Consistência com o resto da ferramenta e do ecossistema (1)

Contábil (regras que a tela precisa respeitar):
- C1 Não confunde pendência com lançamento real: nota "a lançar" fica fora dos saldos (3)
- C2 Rastreabilidade: dá para saber quem tratou cada nota e por quê (1)
- C3 Fornecedor sem conta: ação clara, sem criar conta falsa (2)
- C4 Fecha o ciclo com o IGC: marcar como lançada e sumir na reimportação (2)
- C5 Não induz a lançar errado: bruto, retenções e líquido visíveis e distintos (3)
- C6 Limites visíveis: o nfts só cobre NFS-e do Portal Nacional e pode estar defasado (1)

## Resultado

Análise feita em 2026-10-08: caminhada automática das tarefas, três revisões independentes e às cegas
(telas com letras e ordem diferentes para cada revisor, só imagens e descrição neutra) e consolidação.

### Placar (nota ponderada, máximo 115; UX máximo 55, contábil máximo 60)

| Tela | UX revisor | Contábil revisor | Júnior revisor | Média | UX | Contábil | Média sem peso (1 a 5) |
|---|---|---|---|---|---|---|---|
| N1 aba | 74 | 78 | 72 | 74,7 | 28,7 | 46,0 | 3,19 |
| N2 faixa + tela | 69 | 79 | 63 | 70,3 | 29,3 | 41,0 | 3,03 |
| N3 na conta | 80 | 79 | 80 | 79,7 | 38,7 | 41,0 | 3,31 |
| **N4 combinado** | **90** | **94** | **88** | **90,7** | **46,7** | **44,0** | **3,75** |

Os três revisores colocaram a N4 em primeiro lugar. A N3 ficou em segundo para dois deles (para o revisor
contábil, N2 e N3 empataram em 79).

### Caminhada automática (caminho mínimo, em ações)

| Tarefa | N1 | N2 | N3 | N4 |
|---|---|---|---|---|
| T1 total | 0 | 0 | não faz | 0 |
| T2 bruto, retenções, líquido | 2 | 1 | 0 (sem retenções) | 1 |
| T3 abrir a conta e ver a nota | não faz | não faz | 3 | 2 |
| T4 fornecedores sem conta | 1 | 1 | 1 | 1 |
| T5 marcar como lançada | 3 | 2 | 1 | 1 |
| T6 abrir o PDF | 3 | 2 | 1 | 1 |
| T7 ver na conta que há nota | não faz | não faz | 0 | 0 |

### Calibração
Os três revisores acharam os defeitos que já eram conhecidos: N1 e N2 não mostram a nota dentro da conta
(U3 = 1 nos três) e a N3 não tem total geral (U1 baixo nos três).

### Onde a N4 ganha e onde perde
Ganha em visão geral (U1), esforço (U2), contexto (U3) e fornecedor sem conta (C3). Perde para a N1 em C5
(o painel de detalhe com bruto, retenções e líquido em campos rotulados) e em C6 (frase que explica o que foi
procurado no razão). Rastreabilidade (C2) e desfazer (U5) são fracos nas quatro telas.

### Achados novos, por prioridade
1. Botões só com ícone e o ✓ colado ao ✕ (risco de ignorar sem querer). Pôr rótulo e separar.
2. DESCARTADO. Os revisores apontaram o bruto em destaque como risco, mas partiram de um contexto errado dado
   por mim ("o líquido é a referência para lançar"). Regra confirmada pelo Eric em 2026-10-08: o analista lança
   o BRUTO da nota e o LÍQUIDO do pagamento. A tela está certa em destacar o bruto; o líquido passou a se chamar
   "pagamento esperado" na linha da conta e "Líquido (pagamento)" nas tabelas. Efeito colateral corrigido: os
   dados do mockup usavam o líquido calculado (VIANA 4719: 2.085,68, retenções 156,97) e passaram a usar o
   `valor_liquido_nfse` do nfts (2.003,84, retenções 238,81).
3. O texto "5 de 418 não apareceram" aparece no painel das notas sem conta, que lista só 2. Corrigir a mensagem.
4. O filtro "só contas com pendência" ignora NFS-e a lançar: uma conta que só tem NFS-e pendente some da lista.
5. Identidade do fornecedor: o prestador é "VIANA GESTAO AMBIENTAL LTDA" e a conta é "... EIRELI", sem CNPJ
   visível. Mostrar o CNPJ ao lado da conta escolhida e avisar quando o nome ou o CNPJ não batem.
6. A defasagem do nfts não aparece. A rota /cobertura já devolve `ultima_sincronizacao_ok` (nfts 0.9.50).
7. Rastreabilidade: nenhuma tela mostra quem tratou a nota nem quando. Vem do registro de ações na base.
8. O ✓ está habilitado em nota sem conta de fornecedor.
9. Três entradas para o mesmo dado (faixa, tabela, seção na conta) e faixa permanente: risco de ruído.
   Validar no teste com analistas.

### Limites desta análise
- Os revisores viram imagens estáticas: o efeito de "já lancei", o PDF e o desfazer não foram avaliados por eles.
- A descrição da N4 é mais longa que as outras, o que pode ter favorecido a nota dela.
- O caminho mínimo da caminhada é otimista; analistas reais gastam mais ações.
- As notas são de um modelo, não de analistas. Servem para eliminar o que é fraco e preparar o teste.

### Decisão sugerida
Tomar a N4 como base, aplicar os achados 1 a 8 e testar a N4 contra a N3 com 4 ou 5 analistas nas tarefas T1 a T7.
