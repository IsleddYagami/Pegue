// IMUNI ESLint plugin — Camada 1B da defesa em profundidade.
//
// Cada regra aqui mata uma CATEGORIA inteira de bugs que ja apareceram
// em auditorias manuais. Regra entra apos bug ser caçado pelo menos
// uma vez. Custo: regra de lint vs custo de auditoria recorrente —
// muito mais barato.
//
// Audit 1/Mai/2026 (diretiva Fabio): IMUNI eh sistema reutilizavel.
// Esse plugin vai junto quando IMUNI for instalado em outros projetos.

const noWeakLengthValidation = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Validação por `length < N` é fraca pra dados estruturados (telefone, CPF, placa, PIX). Use regex ou helper de validators-cadastro.ts.",
      recommended: true,
    },
    schema: [],
    messages: {
      weak: "Validação fraca: `{{var}}.length < {{n}}`. Use regex específica ou helper de @/lib/validators-cadastro pra CPF/placa/PIX/email/telefone.",
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (node.operator !== "<" && node.operator !== "<=") return;
        const right = node.right;
        const left = node.left;
        // Pattern: X.length < N onde N <= 10
        if (
          right?.type === "Literal" &&
          typeof right.value === "number" &&
          right.value <= 10 &&
          left?.type === "MemberExpression" &&
          left.property?.type === "Identifier" &&
          left.property.name === "length"
        ) {
          // Skip casos OK: arrays cuja semantica eh contagem (ex: lista.length < 3)
          // Heuristica: se objeto se chama tipo "lista", "items", "array", deixa.
          const obj = left.object;
          let nomeObj = "";
          if (obj?.type === "Identifier") nomeObj = obj.name;
          else if (obj?.type === "MemberExpression" && obj.property?.type === "Identifier") {
            nomeObj = obj.property.name;
          }
          const nomesArrayOk = /^(lista|itens|items|array|results|resultados|fotos|provas|admins|prestadores|corridas|tabelas|partes|telefones|veiculos|tentativas|candidatos|exemplos|msgs|mensagens|palavras|numeros|ids|orfas|categorias|sessoes|veiculo|fretistas|alertados|ignorados|abertas|outros|sugestoes|comentarios|destinatarios|grupo|ranking|topicos|cores|amostras|despesas|pendentes|votos|opcoes|criticas|filhos|frutas|chaves|valores|registros)$/i;
          if (nomeObj && nomesArrayOk.test(nomeObj)) return;
          // Tambem aceita: variavel/membro com sufixo numerico (ex: tentativas2, prestadoresTeste)
          if (nomeObj && /(?:lista|array|s|os|as)$/i.test(nomeObj) && nomeObj.length > 4) return;

          context.report({
            node,
            messageId: "weak",
            data: { var: nomeObj || "?", n: right.value },
          });
        }
      },
    };
  },
};

const noFetchWithoutTimeout = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Chamada fetch() externa sem AbortController/signal trava webhook se servico remoto ficar lento. Adicionar timeout obrigatorio.",
      recommended: true,
    },
    schema: [],
    messages: {
      noTimeout:
        "fetch() externo sem timeout. Use AbortController + setTimeout(controller.abort, MS) e passe `signal: controller.signal`. Ver lib/chatpro.ts (fetchComTimeout) e lib/asaas.ts.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee?.type === "Identifier" &&
          node.callee.name === "fetch"
        ) {
          // Aceita: fetch(url) sem 2o arg eh OK (raro, mas legitimo pra GET simples)
          const initArg = node.arguments[1];
          if (!initArg) return;
          if (initArg.type !== "ObjectExpression") return;
          const hasSignal = initArg.properties.some(
            (p) =>
              p.type === "Property" &&
              p.key?.type === "Identifier" &&
              p.key.name === "signal",
          );
          if (!hasSignal) {
            context.report({ node, messageId: "noTimeout" });
          }
        }
      },
    };
  },
};

const noJsonParseWithoutTry = {
  meta: {
    type: "problem",
    docs: {
      description:
        "JSON.parse() sem try/catch crasha o handler se input nao for JSON valido. Sempre envolver com try/catch.",
      recommended: true,
    },
    schema: [],
    messages: {
      noTry:
        "JSON.parse() fora de try/catch. Input externo invalido vai derrubar o handler. Envolva em try/catch com fallback.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          node.callee.object.name === "JSON" &&
          node.callee.property?.type === "Identifier" &&
          node.callee.property.name === "parse"
        ) {
          // Procura ancestral TryStatement
          let p = node.parent;
          let inTry = false;
          while (p) {
            if (p.type === "TryStatement" && p.block && containsNode(p.block, node)) {
              inTry = true;
              break;
            }
            p = p.parent;
          }
          if (!inTry) {
            context.report({ node, messageId: "noTry" });
          }
        }
      },
    };
  },
};

function containsNode(container, target) {
  let cur = target;
  while (cur) {
    if (cur === container) return true;
    cur = cur.parent;
  }
  return false;
}

const plugin = {
  meta: {
    name: "eslint-plugin-imuni",
    version: "0.1.0",
  },
  rules: {
    "no-weak-length-validation": noWeakLengthValidation,
    "no-fetch-without-timeout": noFetchWithoutTimeout,
    "no-json-parse-without-try": noJsonParseWithoutTry,
  },
};

export default plugin;
