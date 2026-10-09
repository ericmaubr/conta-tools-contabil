# Integração conta-tools-contabil com conta-tools-nfts

Contrato HTTP que o nfts precisa expor para a conciliação contábil achar NFS-e e abrir o PDF (DANFSe).
Origem: sessão "contabil: setup", 2026-10-08. Status: **pedido ao nfts, aguardando codificação**.

## Por que existe

- Cada linha do razão "Nota 4605 - FORNECEDOR" ganha um selo com link para o PDF e mostra bruto, retenções e líquido.
- A lista "NFS-e sem lançamento" cruza as notas recebidas com o razão. Para essa lista valer, a ferramenta precisa saber se o nfts cobre o período.
- Quem chama é o **backend** da ferramenta contábil, com chave de serviço. O navegador do analista nunca fala direto com o nfts (link direto não manda Authorization e daria 401): o backend contábil busca o PDF e o entrega com a sessão do analista.

## Regras gerais

- Somente leitura. Papel `notas:leitura`; a chave de serviço da ferramenta contábil entra na allow-list (`autorizacao.py`) e em `docs/ACESSOS.md` no mesmo commit.
- Sempre filtrar por `papel` + `cnpj_empresa`. A chave única é `chave_acesso` + `cnpj_empresa`.
- Seguir o CLAUDE.md do shared: teste de toda rota sem token, porta direta (não Caddy), 404 é resposta e o resto levanta, bump de PATCH.

## Rotas

1. **`GET /notas/busca`** (JSON, paginado). Parâmetros: `cnpj_empresa` e `papel` (tomador|prestador) obrigatórios; `desde`, `ate` (por `data_emissao`); `competencia_desde`, `competencia_ate`; `numero`; `cnpj_contraparte`; `incluir_canceladas` (padrão false); `limite` (máx 500), `offset`; `incluir_xml` (padrão false).
   Cada nota devolve: `chave_acesso`, `numero_nota`, `data_emissao`, `competencia`, `papel`, `prestador{cnpj, razao_social}`, `tomador{cnpj, razao_social}`, `valor_servico`, `retencoes{pis, cofins, csll, ir, inss, outras, iss, iss_retido}`, `valor_liquido`, `cancelada`, `cancelada_em`, `municipio_prestador_ibge`, `municipio_tomador_ibge`, `tem_pdf`.
   O `valor_liquido` é calculado no nfts, em um lugar só, com a regra do parser (PIS/COFINS/CSLL às vezes vêm somados em `outras_retencoes`; NULL = não retido, usar COALESCE 0; ISS só entra se `iss_retido`).
2. **`GET /notas/{chave_acesso}/pdf?cnpj_empresa=...`** devolve `application/pdf` (DANFSe), gerado do `xml_bruto` com `conta_tools_shared.nfse.danfse`. 404 se a nota não existir para o `cnpj_empresa`. Nota cancelada: informar no retorno se o PDF vem marcado. `Content-Disposition: NFSe-<numero>-<cnpj_prestador>.pdf`.
3. **Localizar por número**: `GET /notas/busca` com `numero` + `cnpj_contraparte`. O número **não é único**: na Brasil Reverso (jan a jul/2026), 62 de 426 números de nota recebida se repetem entre prestadores. Identidade = `chave_acesso`; por número só vale com o CNPJ do prestador. Se vier mais de uma, devolver todas, nunca escolher.
4. **`POST /notas/consulta-lote`** (até 500 itens). Entrada: lista de `{cnpj_empresa, papel, cnpj_contraparte (opcional), numero}`. Saída: para cada item, as notas encontradas ou lista vazia. A tela mostra centenas de linhas de uma vez.
5. **`GET /cobertura?cnpj_empresa=...`** devolve primeira e última `data_emissao` sincronizadas, contagem por mês e por papel, data da última sincronização e se há certificado/.conf. O nfts só tem NFS-e do Portal Nacional: NF-e de mercadoria nunca estará lá, e a ferramenta precisa poder dizer isso.

## Mudanças de dados

- `numero_nota` hoje não é coluna (sai de `<nNFSe>` no `xml_bruto`). Materializar e indexar `(cnpj_empresa, papel, numero_nota)` e `(cnpj_empresa, data_emissao)`. Backfill pelo CLI `recalcular` (`docs/RECALCULOS.md`), porque o insert é só-insert.
- Não decidir sozinho entre `data_emissao` e `competencia`: a contabilidade ainda não confirmou. Expor os dois e filtrar pelo que o chamador pedir.

## Fora de escopo

- Não aceitar nem devolver credencial/certificado; não expor `xml_bruto` sem a flag.
- Não criar tela. Se o contrato crescer além disso, voltar a perguntar ao Eric.

## Testes mínimos

Rota sem token dá 401; token sem `notas:leitura` dá 403; nota de outra empresa dá 404; número repetido devolve todas; lote com item inexistente devolve lista vazia, não erro.

## Fluxo de entrega combinado

1. A sessão do nfts codifica e **avisa a sessão "contabil: setup"** quando terminar.
2. A sessão contábil testa se o contrato entrega o que a conciliação precisa e **aprova ou devolve com ajustes**.
3. Só depois da aprovação, a sessão do nfts coloca em produção. Sem aprovação, não faz deploy.
