# IMUNI — Sistema imuno-corretivo agnóstico de domínio

Esse diretório contém o **core** do IMUNI. Não tem nenhum acoplamento
ao domínio Pegue (corridas, prestadores, etc). É reutilizável em
qualquer aplicação Next.js + Supabase.

## Visão

IMUNI é um sistema de **defesa em profundidade contra bugs e estados
inconsistentes**, organizado em 5 camadas:

| Camada | Onde executa | O que pega |
|---|---|---|
| 1 — Types do schema | Build (`tsc`) | Coluna/tabela errada |
| 1B — ESLint custom | Build (`eslint`) | Validação fraca, endpoint sem auth, race condition |
| 2 — Testes regressivos | Pre-commit (`vitest`) | Cada bug fixado vira teste pra não voltar |
| 3 — Invariantes do banco | Cron diário | Estado inconsistente entre tabelas |
| 4 — E2E headless | Pre-prod | Página quebrada por header/CSP |
| 5 — Sentry + alertas | Runtime | Erro real em produção |

## Arquitetura core/plugin

```
src/lib/
├── imuni/                       ← CORE (genérico, esse diretório)
│   ├── types.ts                 ← Severidade, ResultadoInvariante, InvarianteFn
│   ├── runner.ts                ← executarPlugin / executarPlugins / classificar
│   └── README.md                ← este arquivo
│
└── imuni-{dominio}/             ← PLUGIN por domínio
    ├── invariantes.ts           ← invariantes específicas do domínio
    └── invariantes.test.ts      ← regressivos
```

## Como adicionar IMUNI em outro projeto (ex: Otimizi)

### 1. Copia o diretório `src/lib/imuni/` (core)
Sem mudança — é genérico.

### 2. Cria `src/lib/imuni-{seu-dominio}/invariantes.ts`

```ts
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";
import type { ResultadoInvariante, PluginImuni } from "@/lib/imuni/types";

async function invSeuCheck(): Promise<ResultadoInvariante> {
  // Sua query SQL específica
  const { data } = await supabase.from("sua_tabela").select("...");
  // ...
  return {
    nome: "OTIMIZI-INV-1",
    descricao: "Frase clara do que foi violado",
    severidade: "alta",
    count: data?.length || 0,
    amostra: (data || []).slice(0, 5),
    ok: !data || data.length === 0,
    comoAgir: "Instrução pro admin",
  };
}

export const pluginOtimizi: PluginImuni = {
  dominio: "otimizi",
  invariantes: [invSeuCheck /* , outras */],
};
```

### 3. Cria endpoint cron `/api/cron/auditar-invariantes/route.ts`

```ts
import { executarPlugin, classificar } from "@/lib/imuni/runner";
import { pluginOtimizi } from "@/lib/imuni-otimizi/invariantes";

export async function GET() {
  const resultados = await executarPlugin(pluginOtimizi);
  const stats = classificar(resultados);
  // ... alerta admin se stats.violacoes_alta.length > 0
}
```

### 4. Configura cron-job.org pra chamar 1x/dia

Pronto. IMUNI está rodando no novo projeto.

## Princípios de design

1. **Invariantes nunca lançam exceção.** Erros viram campo `erro` no resultado.
2. **Severidade ALTA notifica admin imediato. MEDIA só agrega no log.**
3. **Amostra de 5 exemplos.** Suficiente pra investigar sem expor dataset inteiro.
4. **Cada invariante é função pura** que lê estado do banco e retorna resultado. Sem efeitos colaterais.
5. **Plugin = lista de funções.** Sem classes, sem framework.

## Histórico

Criado em 1/Mai/2026 a partir do meta-sistema da Pegue, depois que
auditoria manual achou 41 bugs em 7 horas e a re-auditoria mostrou
que sempre dá pra achar mais. Tese: melhor que humano achar bug é
sistema imuno-corretivo achar sozinho.
