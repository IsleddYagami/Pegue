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
    rollback=sim   -> a rodada TERMINOU e um passo real do fluxo falhou
    rollback=nao   -> smoke nao respondeu, ou a rodada estourou o prazo (ai
                      nenhum passo falho conta: pode ter sido cortado no
                      meio) — nao prova que o deploy esta ruim

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

    # REGRA DE PROVA (8/Nov/2026, depois de o rollback APAGAR o deploy bom
    # 0b981e7 — o do bairro pelo Google — promovendo 7aaa09a por cima):
    # se o smoke estourou o PROPRIO prazo, a rodada nao terminou, e rodada
    # que nao terminou nao prova nada sobre o deploy. O corpo do smoke
    # continua rodando depois do prazo e vai marcando passo como falho por
    # ter sido cortado no meio — foi assim que "26_cliente_libera_coleta"
    # virou "prova" e derrubou deploy bom. Entao: estourou = NAO reverte,
    # tenha falhado o que tiver falhado.
    estourou = any(p.get("step") == PASSO_DE_PRAZO for p in falhos) or (
        "estourou" in str(dados.get("motivo") or "")
    )

    reais = [p for p in falhos if p.get("step") != PASSO_DE_PRAZO]
    if estourou:
        if reais:
            print(
                "  a rodada estourou o prazo: os %d passo(s) falhos acima podem"
                " ter sido cortados no meio. Nao serve de prova contra o deploy."
                % len(reais)
            )
        print("rollback=nao")
        return 0

    print("rollback=%s" % ("sim" if reais else "nao"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
