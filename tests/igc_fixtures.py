"""Monta HTML no mesmo formato das exportações do IGC (cp1252, <tr >/<td>/<font>).

Usado no lugar dos arquivos reais (dado de cliente, fora do git). O markup foi copiado do
balancete real: célula com estilo, texto dentro de <font>, às vezes com <b>."""

from __future__ import annotations


def tabela_html(linhas: list[list[str]], titulo: str = "Relatório") -> bytes:
    partes = [f"<html >\r\n<title >\r\n{titulo}\r\n</title >\r\n<body >\r\n<table >\r\n"]
    for linha in linhas:
        partes.append("<tr >\r\n")
        for celula in linha:
            partes.append(
                '<td style="width:64,25px" align="Left">\r\n'
                f'<font face="Arial" size="3" color="black"><b>{celula}</b></font>\r\n</td>\r\n'
            )
        partes.append("</tr>\r\n")
    partes.append("</table>\r\n</body>\r\n</html>\r\n")
    return "".join(partes).encode("cp1252")
