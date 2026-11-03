#!/usr/bin/env python3
"""Le a resposta do smoke E2E e diz o que aconteceu.

Nasceu em 3/Nov/2026. Antes, o CI so' via "exit 28" (timeout do curl) e
ninguem sabia em que passo o smoke parava — e pior, QUALQUER falha do job
disparava o auto-rollback, que revertia deploys bons (provado no run
41562969221, que tirou do ar a frase aprovada pelo Fabio).

Uso:
    echo "$response" | python3 scripts/ler-smoke.py

Imprime o relatorio legivel no stderr/stdout e, na ULTIMA linha do stdout,
sempre uma destas:
    rollback=sim   -> um passo REAL do fluxo falhou; reverter se justifica
    rollback=nao   -> smoke nao respondeu, ou so' estourou o prazo:
                      nao prova que o deploy esta ruim, entao nao reverte

Mora no repositorio (e nao embutido no YAML) porque python multi-linha
dentro de bloco YAML quebra o arquivo de workflow — ja quebrou uma vez.
"""

import json
import sys

# Passo sintetico que o proprio smoke cria quando estoura o prazo dele.
# Nao e' falha do fluxo: e' falha de tempo. Nao justifica rollback.
PASSO_DE_PRAZO = "99_estourou_o_prazo"


def main() -> int:
    bruto = sys.stdin.read()

    try:
        dados = json.loads(bruto)
    except Exception:
        print("smoke nao respondeu JSON. Primeiros 400 caracteres:")
        print(bruto[:400] if bruto.strip() else "(resposta vazia)")
        print("rollback=nao")
        return 0

    if not isinstance(dados, dict):
        print("resposta em formato inesperado")
        print("rollback=nao")
        return 0

    passos = dados.get("steps") or []
    falhos = [p for p in passos if not p.get("ok")]

    print("ok=%s | passos=%d | falhos=%d | duracao=%sms" % (
        dados.get("ok"), len(passos), len(falhos), dados.get("duracao_ms"),
    ))
    if dados.get("motivo"):
        print("motivo: %s" % dados["motivo"])

    for p in falhos:
        print("  FALHOU %s" % p.get("step"))
        print("     esperado: %s" % p.get("esperado"))
        print("     obtido:   %s" % p.get("obtido"))
        if p.get("erro"):
            print("     erro:     %s" % p["erro"])

    mais_lentos = sorted(passos, key=lambda p: -(p.get("duracao_ms") or 0))[:5]
    if mais_lentos:
        print("  passos mais lentos:")
        for p in mais_lentos:
            print("     %-40s %sms" % (p.get("step"), p.get("duracao_ms")))

    reais = [p for p in falhos if p.get("step") != PASSO_DE_PRAZO]
    print("rollback=%s" % ("sim" if reais else "nao"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
