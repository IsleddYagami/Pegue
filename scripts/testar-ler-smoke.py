#!/usr/bin/env python3
"""Prova que o leitor do smoke nao manda reverter deploy bom.

Nasceu em 8/Nov/2026, depois de o auto-rollback APAGAR o deploy 0b981e7 (o
do bairro pelo Google) e promover 7aaa09a por cima. A resposta do run
42455724978 nao ficou guardada em lugar nenhum, entao o caso 1 aqui e'
RECONSTRUIDO das linhas do log daquele run (os dois passos falhos e o
motivo sao os de verdade; o resto do JSON e' o formato do smoke). Nao e'
captura ao vivo — mas prova a decisao, que e' o que o rollback usa.

Uso: python3 scripts/testar-ler-smoke.py
"""

import json
import subprocess
import sys
from pathlib import Path

LEITOR = Path(__file__).with_name("ler-smoke.py")


def decidir(corpo) -> str:
    bruto = corpo if isinstance(corpo, str) else json.dumps(corpo)
    r = subprocess.run(
        [sys.executable, str(LEITOR)],
        input=bruto,
        capture_output=True,
        text=True,
        check=True,
    )
    ultima = [l for l in r.stdout.strip().splitlines() if l.startswith("rollback=")]
    assert ultima, f"leitor nao disse rollback=. saida:\n{r.stdout}"
    return ultima[-1].split("=", 1)[1]


CASOS = []

# 1) O CASO REAL (run 42455724978): estourou o prazo E marcou um passo do
#    fluxo como falho. O passo foi cortado no meio — nao prova nada.
CASOS.append((
    "estourou o prazo e ainda marcou passo do fluxo",
    {
        "ok": False,
        "duracao_ms": 182061,
        "motivo": 'smoke estourou 180000ms — parou no passo seguinte a "25_fretista_pronto_coleta"',
        "steps": [
            {"step": "1_oi", "ok": True, "duracao_ms": 9535},
            {"step": "26_cliente_libera_coleta", "ok": False, "duracao_ms": 1200,
             "esperado": "coleta liberada", "obtido": "sem resposta"},
            {"step": "99_estourou_o_prazo", "ok": False, "duracao_ms": 180001,
             "esperado": "os 33 passos em menos de 180000ms", "obtido": "parou depois de 30 passos"},
        ],
    },
    "nao",
))

# 2) Rodada que TERMINOU com passo do fluxo falho: ai' sim e' prova.
CASOS.append((
    "terminou e um passo do fluxo falhou de verdade",
    {
        "ok": False,
        "duracao_ms": 94000,
        "steps": [
            {"step": "1_oi", "ok": True, "duracao_ms": 900},
            {"step": "12_cotacao", "ok": False, "duracao_ms": 1500,
             "esperado": "preco na mensagem", "obtido": "mensagem sem preco"},
        ],
    },
    "sim",
))

# 3) Rodada verde.
CASOS.append((
    "tudo verde",
    {"ok": True, "duracao_ms": 80000, "steps": [{"step": "1_oi", "ok": True, "duracao_ms": 900}]},
    "nao",
))

# 4) So' o passo sintetico de prazo.
CASOS.append((
    "so o passo de prazo",
    {
        "ok": False,
        "duracao_ms": 180001,
        "motivo": "smoke estourou 180000ms",
        "steps": [{"step": "99_estourou_o_prazo", "ok": False, "duracao_ms": 180001}],
    },
    "nao",
))

# 5) Sem o passo sintetico, mas o motivo diz que estourou (defesa a mais).
CASOS.append((
    "motivo diz que estourou, sem o passo sintetico",
    {
        "ok": False,
        "duracao_ms": 181000,
        "motivo": "smoke estourou 180000ms — parou no passo seguinte a \"9_endereco\"",
        "steps": [{"step": "9_endereco", "ok": False, "duracao_ms": 500}],
    },
    "nao",
))

# 6) Smoke mudo (timeout do curl, resposta vazia).
CASOS.append(("resposta vazia", "", "nao"))

# 7) Resposta que nao e' JSON (pagina de erro da Vercel, por exemplo).
CASOS.append(("resposta que nao e json", "<html>502</html>", "nao"))


def main() -> int:
    falhas = 0
    for nome, corpo, esperado in CASOS:
        obtido = decidir(corpo)
        marca = "ok  " if obtido == esperado else "FALHA"
        if obtido != esperado:
            falhas += 1
        print(f"{marca} {nome}: esperado rollback={esperado}, obtido rollback={obtido}")
    print(f"\n{len(CASOS) - falhas}/{len(CASOS)} casos passaram")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
