// Mensagens do bot com tom empatico e de servir

export const MSG = {
  boasVindas: `Oii! 😊 Que bom ter voce aqui no Pegue! 🚚
Estou aqui pra te ajudar com o que precisar.

De onde vamos retirar o material?

La embaixo, do lado de onde voce digita a mensagem, tem um icone de clipe 📎 - clica nele e depois em *Localizacao* 📍

Ou se preferir, me passa o *CEP* ou *endereco com rua e bairro* 🏠`,

  localizacaoRecebida: (endereco: string) =>
    `Achei! Voce ta aqui pertinho: ${endereco} ✅

Agora manda uma foto do material 📸 assim consigo te dizer qual o melhor veiculo e quantos ajudantes vai precisar!

Ou se preferir, descreve o que precisa transportar 😊`,

  enderecoRecebido: (endereco: string) =>
    `Anotado! Coleta em: ${endereco} ✅

Agora manda uma foto do material 📸 assim consigo te dizer qual o melhor veiculo e quantos ajudantes vai precisar!

Ou se preferir, descreve o que precisa transportar 😊`,

  fotoRecebida: (item: string) =>
    `Aah entendi! Vi que e ${item}! 📦
Vou cuidar direitinho do transporte, fica tranquilo(a)!

E pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,

  fotoSemIA: `Recebi sua foto! 📸
Vou cuidar direitinho do transporte, fica tranquilo(a)!

E pra onde a gente leva? Me manda o endereco ou CEP do destino 🏠`,

  destinoRecebido: (destino: string) =>
    `${destino}! Otimo destino! ✅

Preciso de mais alguns detalhes:
🏢 Tem escada no local? Qual andar?
🙋 Vai precisar de ajudante pra carregar?

Me conta tudo que eu monto o orcamento! 😊`,

  detalhesRecebidos: (
    origem: string,
    destino: string,
    carga: string,
    distancia: string,
    economica: string,
    padrao: string,
    premium: string
  ) =>
    `Preparei 3 opcoes pra voce escolher a que cabe melhor no seu bolso:

📍 ${origem} → 🏠 ${destino}
📦 ${carga}
📏 ${distancia} km

🟢 *1 - Economica* - R$ ${economica} (prazo flexivel)
🟡 *2 - Padrao* - R$ ${padrao} (dia combinado)
⭐ *3 - Premium* - R$ ${premium} (prioridade + ajudante)

Qual te atende melhor?
E se tiver qualquer duvida, me pergunta! To aqui pra isso 😊`,

  planoEscolhido: `Otima escolha! ✨
Vou preparar tudo pra voce.

Pra quando voce precisa? Me manda a data e o horario que fica melhor pra voce 📅`,

  resumoFrete: (
    origem: string,
    destino: string,
    carga: string,
    data: string,
    plano: string,
    valor: string
  ) =>
    `Deixa eu resumir tudo:

📍 Retirada: ${origem}
🏠 Destino: ${destino}
📦 Material: ${carga}
📅 ${data}
💰 ${plano}: R$ ${valor}

Ta tudo certo? Posso confirmar? 😊
Responda *SIM* pra confirmar ou *NAO* pra ajustar algo.`,

  linkPagamento: (link: string) =>
    `Maravilha! 🎉
Seu frete ta confirmado!

Segue o link pra pagamento seguro:
💳 ${link}

Assim que o pagamento for confirmado, nosso motorista recebe os detalhes e entra em contato com voce!

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

Quer pegar? Responda *SIM* e seu valor
Exemplo: *SIM 200*`,

  freteAceito: `Voce ganhou o frete! ✅🎉
Aguarde a confirmacao do pagamento do cliente.
Assim que pago, voce recebe todos os detalhes!`,

  freteJaPego: `Esse frete ja foi pego! 😉
Fica de olho que sempre tem novos aparecendo! 🚚`,

  // Atendimento humano
  transferenciaHumano: `Vou te transferir pro nosso time! 😊
Em instantes alguem te chama aqui mesmo.
Aguarda so um pouquinho! 🙏`,

  foraHorarioHumano: `Nosso time ta disponivel de segunda a sexta, das 10h as 15h ⏰

Mas pode deixar sua mensagem aqui que respondemos assim que voltar! 😊

Ou se preferir, o bot continua te atendendo 24h! 🚚`,

  // Erros e fallbacks
  naoEntendi: `Desculpa, nao entendi 😅
Me conta o que voce precisa que eu te ajudo!

Ou se preferir:
1️⃣ *Solicitar frete*
2️⃣ *Falar com atendente*`,

  erroInterno: `Ops, tive um probleminha aqui 😅
Mas ja ja normaliza! Tenta de novo em alguns instantes.

Ou se preferir, chama nosso time:
📱 Falar com atendente`,

  obrigado: `Por nada! 😊
Estamos aqui sempre que precisar.
Relaxa. A gente leva. 🚚✨

Qualquer duvida, e so chamar!`,
};
