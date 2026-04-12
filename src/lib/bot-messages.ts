// Mensagens do bot com tom empatico e de servir

export const MSG = {
  // Menu inicial
  boasVindas: `Oii! 😊 Que bom ter voce aqui no Pegue! 🚚
Estou aqui pra te ajudar com o que precisar.

O que voce precisa?

1️⃣ *Pequenos Fretes ou Mudanca*
2️⃣ *Guincho* (carro ou moto)
3️⃣ *Falar com nosso especialista Santos*`,

  // Apos escolher frete/mudanca
  pedirLocalizacao: `Otimo! Vou te ajudar com seu frete! 🚚

De onde vamos retirar o material?

La embaixo, do lado de onde voce digita a mensagem, tem um icone de clipe 📎 - clica nele e depois em *Localizacao* 📍

Ou se preferir, me passa o *CEP* ou *endereco com rua e bairro* 🏠`,

  // Guincho
  guincho: `Para guincho, fala direto com nosso especialista *Santos*! 😊
Ele vai te atender rapidinho:
📱 (11) 97142-9605

Pode chamar agora mesmo! 🚗`,

  localizacaoRecebida: (endereco: string) =>
    `Achei! Voce ta aqui pertinho: ${endereco} ✅

Pra ser mais rapido e facil, manda foto do material que precisa 📸`,

  enderecoRecebido: (endereco: string) =>
    `Anotado! Coleta em: ${endereco} ✅

Pra ser mais rapido e facil, manda foto do material que precisa 📸`,

  fotoItemAdicionado: (item: string, emoji: string, listaItens: string) =>
    `Vi! *${item}* ${emoji} Anotado! ✅

Ate agora temos: ${listaItens}

Tem mais algum item? Manda outra foto ou digite *PRONTO* pra seguir 😊`,

  todosItensProntos: (listaItens: string, veiculo: string) =>
    `Beleza! Seus itens:
${listaItens}

🚚 Veiculo sugerido: *${veiculo}*

E pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,

  fotoRecebida: (item: string) =>
    `Aah entendi! Vi que e ${item}! 📦
Vou cuidar direitinho do transporte, fica tranquilo(a)!

E pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,

  fotoSemIA: `Recebi sua foto! 📸
Vou cuidar direitinho do transporte, fica tranquilo(a)!

E pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,

  // Pergunta sobre local de entrega (elevador/escada/terreo)
  destinoRecebido: (destino: string) =>
    `${destino}! Otimo destino! ✅

Me conta sobre o local de entrega:

1️⃣ *Local terreo*
2️⃣ *Predio com elevador*
3️⃣ *Predio sem elevador / escada*`,

  // Pergunta andar quando escolhe escada
  qualAndar: `Entendi, predio sem elevador! 🏢
Qual andar? Me manda o numero`,

  // Pergunta se precisa ajudante
  precisaAjudante: (infoLocal: string) =>
    `${infoLocal}

Vai precisar de ajudante pra carregar? 😊

1️⃣ *Nao*, consigo sozinho
2️⃣ *Sim*, preciso de ajudante`,

  // Orcamento com valor total
  orcamento: (
    origem: string,
    destino: string,
    carga: string,
    veiculo: string,
    total: string
  ) =>
    `Preparei seu orcamento! 📋

📍 *Retirada:* ${origem}
🏠 *Destino:* ${destino}
📦 *Material:* ${carga}
🚚 *Veiculo:* ${veiculo}

✅ *Total: R$ ${total}*

Pra quando voce precisa? Me manda a *data* e *horario* 📅`,

  planoEscolhido: `Otima escolha! ✨
Vou preparar tudo pra voce.

Pra quando voce precisa? Me manda a data e o horario que fica melhor pra voce 📅`,

  resumoFrete: (
    origem: string,
    destino: string,
    carga: string,
    data: string,
    veiculo: string,
    valor: string,
    detalhes: string
  ) =>
    `Deixa eu resumir tudo:

📍 Retirada: ${origem}
🏠 Destino: ${destino}
📦 Material: ${carga}
🚚 Veiculo: ${veiculo}
📅 ${data}
${detalhes}
✅ *Total: R$ ${valor}*

Ta tudo certo? Posso confirmar? 😊
Responda *SIM* pra confirmar ou *NAO* pra ajustar algo.`,

  freteRecebido: `Seu frete foi recebido! 😊
Estamos reservando a agenda!`,

  freteConfirmadoComPrestador: (nomePrestador: string, telPrestador: string, linkPagamento: string) =>
    `O fretista *${nomePrestador}* ira entrar em contato para alinhar os detalhes da entrega 🚚
📱 ${telPrestador}

Para garantir a data, conclua o pagamento:
💳 ${linkPagamento}

💰 *Pix* sem taxas
💳 *Cartao de credito* taxas adicionais

⏳ A reserva se mantem disponivel por *20 minutos*. Apos esse tempo, sera necessaria uma nova cotacao para verificar e garantir nova agenda.

Relaxa. A gente leva. 🚚✨`,

  nenhumFretista: `Nosso especialista *Santos* logo enviara a confirmacao do seu frete! 😊
📱 (11) 97142-9605`,

  linkPagamento: (link: string) =>
    `Segue o link pra pagamento seguro:
💳 ${link}

Obrigado por confiar no Pegue!
Relaxa. A gente leva. 🚚✨`,

  pagamentoConfirmado: (nomePrestador: string, telPrestador: string) =>
    `Pagamento confirmado! ✅🎉

O ${nomePrestador} vai entrar em contato pra alinhar os detalhes com voce.
📱 ${telPrestador}

Qualquer coisa, estamos aqui!
Relaxa. A gente leva. 🚚✨`,

  // Dispatch para fretistas
  novoFreteDisponivel: (
    origem: string,
    destino: string,
    carga: string,
    data: string,
    valorPrestador: string,
    corridaId: string
  ) =>
    `🚚 *Novo frete disponivel!*

📍 Origem: ${origem}
🏠 Destino: ${destino}
📦 Material: ${carga}
📅 ${data}
💰 Voce recebe: R$ ${valorPrestador}

Quer pegar? Responda *SIM*`,

  freteAceito: `Voce ganhou o frete! ✅🎉
Aguarde a confirmacao do pagamento do cliente.
Assim que pago, voce recebe todos os detalhes!`,

  freteJaPego: `Esse frete ja foi pego! 😉
Fica de olho que sempre tem novos aparecendo! 🚚`,

  // Atendimento humano
  transferenciaHumano: `Vou te transferir pro *Santos*, nosso especialista! 😊
Pode chamar ele direto:
📱 (11) 97142-9605

Ele vai te ajudar com tudo! 🙏`,

  foraHorarioHumano: `Nosso time ta disponivel de segunda a sexta, das 10h as 15h ⏰

Mas voce pode falar direto com o *Santos*, nosso especialista:
📱 (11) 97142-9605

Ou se preferir, o bot continua te atendendo 24h! 🚚`,

  // Erros e fallbacks
  naoEntendi: `Desculpa, nao entendi 😅
Me conta o que voce precisa que eu te ajudo!

Ou se preferir, fala direto com o *Santos*, nosso especialista:
📱 (11) 97142-9605`,

  erroInterno: `Ops, tive um probleminha aqui 😅
Mas ja ja normaliza!

Enquanto isso, voce pode falar direto com o *Santos*, nosso especialista:
📱 (11) 97142-9605`,

  obrigado: `Por nada! 😊
Estamos aqui sempre que precisar.
Relaxa. A gente leva. 🚚✨

Qualquer duvida, e so chamar!`,
};
