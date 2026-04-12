// Mensagens do bot com tom empático e de servir

export const MSG = {
  // Menu inicial
  boasVindas: `Oii! 😊 Que bom ter você aqui no Pegue! 🚚
Estou aqui pra te ajudar com o que precisar.

O que você precisa?

1️⃣ *Pequenos Fretes ou Mudança*
2️⃣ *Guincho* (carro ou moto)
3️⃣ *Falar com nosso especialista Santos*`,

  // Após escolher frete/mudança
  pedirLocalizacao: `Ótimo! Vou te ajudar com seu frete! 🚚

De onde vamos retirar o material?

Lá embaixo, do lado de onde você digita a mensagem, tem um ícone de clipe 📎 - clica nele e depois em *Localização* 📍

Ou se preferir, me passa o *CEP* ou *endereço com rua e bairro* 🏠`,

  // Guincho
  guincho: `Para guincho, fala direto com nosso especialista *Santos*! 😊
Ele vai te atender rapidinho:
📱 (11) 97142-9605

Pode chamar agora mesmo! 🚗`,

  localizacaoRecebida: (endereco: string) =>
    `Achei! Você tá aqui pertinho: ${endereco} ✅

Pra ser mais rápido e fácil, manda foto do material que precisa 📸`,

  enderecoRecebido: (endereco: string) =>
    `Anotado! Coleta em: ${endereco} ✅

Pra ser mais rápido e fácil, manda foto do material que precisa 📸`,

  fotoItemAdicionado: (item: string, emoji: string, listaItens: string) =>
    `Vi! *${item}* ${emoji} Anotado! ✅

Até agora temos: ${listaItens}

Tem mais algum item? Manda outra foto ou digite *PRONTO* pra seguir 😊`,

  todosItensProntos: (listaItens: string, veiculo: string) =>
    `Beleza! Seus itens:
${listaItens}

🚚 Veículo sugerido: *${veiculo}*

E pra onde a gente leva? Me manda o endereço ou CEP do destino 🏠`,

  fotoRecebida: (item: string) =>
    `Aah entendi! Vi que é ${item}! 📦
Vou cuidar direitinho do transporte, fica tranquilo(a)!

E pra onde a gente leva? Me manda o endereço ou CEP do destino 🏠`,

  fotoSemIA: `Recebi sua foto! 📸
Vou cuidar direitinho do transporte, fica tranquilo(a)!

E pra onde a gente leva? Me manda o endereço ou CEP do destino 🏠`,

  // Pergunta sobre local de entrega (elevador/escada/térreo)
  destinoRecebido: (destino: string) =>
    `${destino}! Ótimo destino! ✅

Me conta sobre o local de entrega:

1️⃣ *Local térreo*
2️⃣ *Prédio com elevador*
3️⃣ *Prédio sem elevador / escada*`,

  // Pergunta andar quando escolhe escada
  qualAndar: `Entendi, prédio sem elevador! 🏢
Qual andar? Me manda o número`,

  // Pergunta se precisa ajudante
  precisaAjudante: (infoLocal: string) =>
    `${infoLocal}

Vai precisar de ajudante pra carregar? 😊

1️⃣ *Não*, consigo sozinho
2️⃣ *Sim*, preciso de ajudante`,

  // Orçamento com valor total
  orcamento: (
    origem: string,
    destino: string,
    carga: string,
    veiculo: string,
    total: string
  ) =>
    `Preparei seu orçamento! 📋

📍 *Retirada:* ${origem}
🏠 *Destino:* ${destino}
📦 *Material:* ${carga}
🚚 *Veículo:* ${veiculo}

✅ *Total: R$ ${total}*

Pra quando você precisa? Me manda a *data* e *horário* 📅`,

  planoEscolhido: `Ótima escolha! ✨
Vou preparar tudo pra você.

Pra quando você precisa? Me manda a data e o horário que fica melhor pra você 📅`,

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
🚚 Veículo: ${veiculo}
📅 ${data}
${detalhes}
✅ *Total: R$ ${valor}*

Tá tudo certo? Posso confirmar? 😊
Responda *SIM* pra confirmar ou *NÃO* pra ajustar algo.`,

  freteRecebido: `Seu frete foi recebido! 😊
Estamos reservando a agenda!`,

  freteConfirmadoEnviaPagamento: (linkPagamento: string) =>
    `Agenda confirmada! ✅

Para garantir a data, conclua o pagamento:
💳 ${linkPagamento}

💰 *Pix* sem taxas
💳 *Cartão de crédito* taxas adicionais

⏳ A reserva se mantém disponível por *20 minutos*. Após esse tempo, será necessária uma nova cotação para verificar e garantir nova agenda.`,

  nenhumFretista: `Nosso especialista *Santos* logo enviará a confirmação do seu frete! 😊
📱 (11) 97142-9605`,

  linkPagamento: (link: string) =>
    `Segue o link pra pagamento seguro:
💳 ${link}

Obrigado por confiar no Pegue!
Relaxa. A gente leva. 🚚✨`,

  pagamentoConfirmado: (nomePrestador: string, telPrestador: string) =>
    `Pagamento confirmado! ✅🎉

O ${nomePrestador} vai entrar em contato pra alinhar os detalhes com você.
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
    `🚚 *Novo frete disponível!*

📍 Origem: ${origem}
🏠 Destino: ${destino}
📦 Material: ${carga}
📅 ${data}
💰 Você recebe: R$ ${valorPrestador}

Quer pegar? Responda *SIM*`,

  freteAceito: `Você ganhou o frete! ✅🎉
Este serviço já está reservado pra você!

A confirmação chegará logo após o pagamento do cliente. Fique atento! 📱

💰 Seu pagamento será liberado assim que o cliente confirmar o recebimento.`,

  freteJaPego: `Esse frete já foi pego! 😉
Fica de olho que sempre tem novos aparecendo! 🚚`,

  // Atendimento humano
  transferenciaHumano: `Vou te transferir pro *Santos*, nosso especialista! 😊
Pode chamar ele direto:
📱 (11) 97142-9605

Ele vai te ajudar com tudo! 🙏`,

  foraHorarioHumano: `Nosso time tá disponível de segunda a sexta, das 10h às 15h ⏰

Mas você pode falar direto com o *Santos*, nosso especialista:
📱 (11) 97142-9605

Ou se preferir, o bot continua te atendendo 24h! 🚚`,

  // === CADASTRO DE PRESTADOR ===

  cadastroInicio: `Que bom ter você com a Pegue! 🚚✨

Antes de começar, algumas informações importantes:

✅ Você precisa ter *18 anos ou mais*
✅ Ter veículo próprio com no máximo *15 anos de uso*
✅ Documentação em dia (CNH e documento do veículo)

Vamos lá! Qual seu *nome completo*?`,

  cadastroCpf: `Agora me passa seu *CPF* (somente números)`,

  cadastroSelfie: `Agora preciso de uma *selfie sua segurando seu RG ou CNH aberto* 📸

⚠️ O documento precisa estar *aberto e legível* na foto!
Segure próximo ao rosto pra ficar bem claro.`,

  cadastroFotoPlaca: `Agora manda uma *foto da placa* do seu veículo 📸`,

  cadastroFotoVeiculo: `Agora manda uma *foto do veículo inteiro* 🚗
(de preferência mostrando o veículo de lado)`,

  cadastroTipoVeiculo: `Qual o tipo do seu veículo?

1️⃣ *Carro comum* (Kicks, Livina, Renegade, Nivus, etc)
2️⃣ *Utilitário* (Strada, Saveiro, Courier)
3️⃣ *HR* (Hyundai HR)
4️⃣ *Caminhão Baú*`,

  cadastroTermos: `📋 *TERMOS DE PARTICIPAÇÃO - PEGUE*

Leia com atenção antes de prosseguir:

*1. SOBRE A PEGUE*
A Pegue é uma plataforma de intermediação de serviços de frete e transporte. Não somos uma empresa de transporte. Conectamos clientes a prestadores de serviço independentes.

*2. VOCÊ COMO PRESTADOR*
- Você é um prestador *independente*, não funcionário da Pegue
- Você decide quais serviços aceitar e quando trabalhar
- É sua responsabilidade manter veículo e documentação em dia

*3. PROTOCOLO DE FOTOS (OBRIGATÓRIO)*
- Fotografar TODOS os materiais na *coleta* antes de carregar
- Fotografar TODOS os materiais na *entrega* após descarregar
- Sem fotos = pagamento *BLOQUEADO*
- As fotos servem como prova para proteger você e o cliente

*4. RESPONSABILIDADE POR DANOS*
- O prestador é *responsável* por qualquer dano, avaria ou extravio de materiais durante o transporte
- Em caso de dano comprovado, o valor será descontado dos seus recebíveis
- Transporte com cuidado! Proteja os materiais adequadamente

*5. PAGAMENTO*
- Você recebe *88%* do valor do frete
- O pagamento é liberado *após o cliente confirmar o recebimento* dos materiais
- Quanto mais rápido a entrega for confirmada, mais rápido você recebe

*6. CANCELAMENTOS*
- Cancelar um serviço já aceito *afeta seu score* na plataforma
- Cancelamentos recorrentes podem levar à *desativação* da conta
- Cancele apenas em casos de real impossibilidade

*7. CONDUTA E ATENDIMENTO*
- Trate todos os clientes com *respeito e educação*
- Seja pontual nos horários combinados
- Reclamações de clientes *reduzem seu score* e suas indicações
- Comportamento inadequado resulta em *desativação imediata*

*8. SISTEMA DE SCORE*
- Bom desempenho = *mais indicações* de frete
- Cancelamentos, reclamações e danos = *menos indicações*
- Score muito baixo = *desativação da plataforma*

*9. DESATIVAÇÃO*
A Pegue pode desativar sua conta a qualquer momento em caso de:
- Danos recorrentes a materiais de clientes
- Reclamações graves ou reincidentes
- Cancelamentos excessivos
- Comportamento inadequado
- Documentação vencida ou irregular

*10. DADOS E PRIVACIDADE*
- Seus dados pessoais são usados apenas para o cadastro e operação da plataforma
- Dados dos clientes são confidenciais e não devem ser compartilhados

Para prosseguir com o cadastro, digite:
*eu concordo*`,

  cadastroConcluido: `Suas informações entraram em análise! ✅

Em breve você receberá a confirmação para iniciarmos nossa grande parceria! 🚚✨

Fique atento ao WhatsApp 📱`,

  // === FLUXO DE FOTOS COLETA/ENTREGA ===

  fretistaPedirFotosColeta: `📸 *Hora de registrar a coleta!*

Manda foto de TODOS os materiais antes de carregar.
Pode mandar uma por uma.

Quando terminar, digite *PRONTO*

⚠️ Sem fotos de coleta = pagamento bloqueado`,

  fretistaPedirFotosEntrega: `📸 *Hora de registrar a entrega!*

Manda foto de TODOS os materiais entregues.
Pode mandar uma por uma.

Quando terminar, digite *PRONTO*

⚠️ Sem fotos de entrega = pagamento bloqueado`,

  fretistaFotoRecebida: (total: number) =>
    `Foto ${total} recebida! ✅ Tem mais? Manda outra ou digite *PRONTO*`,

  fretistaColetaConfirmada: `Fotos de coleta registradas! ✅

Agora é só fazer a entrega com cuidado!
Quando chegar no destino, vou pedir as fotos de entrega 📸

Bom trabalho! 🚚`,

  fretistaEntregaConfirmada: `Fotos de entrega registradas! ✅

Aguardando confirmação do cliente para liberar seu pagamento 💰
Assim que o cliente confirmar, você será notificado!`,

  clienteConfirmarEntrega: (carga: string) =>
    `Seu frete foi entregue! 📦✅

Material: *${carga}*

⚠️ *Antes de confirmar, verifique com atenção:*
- Todos os itens foram entregues?
- Algum item chegou com dano ou avaria?
- Está tudo conforme o combinado?

Após sua confirmação, o pagamento do fretista será liberado.

Está tudo certo com a entrega? 😊

1️⃣ *SIM* - Tudo OK, pode liberar o pagamento
2️⃣ *NÃO* - Tive algum problema`,

  clienteConfirmouEntrega: `Entrega confirmada! ✅🎉

Obrigado por confiar no Pegue!
Relaxa. A gente leva. 🚚✨

Qualquer dúvida, é só chamar!`,

  clienteReclamouEntrega: `Sentimos muito pelo problema 😔

Nosso especialista *Santos* vai entrar em contato pra resolver:
📱 (11) 97142-9605

Vamos cuidar disso pra você!`,

  fretistaPagamentoLiberado: `Pagamento liberado! ✅💰

O cliente confirmou a entrega. Seu pagamento será processado!

Obrigado pelo excelente trabalho! 🚚✨`,

  fretistaProblemaNaEntrega: `⚠️ O cliente reportou um problema na entrega.

Nosso especialista *Santos* vai entrar em contato:
📱 (11) 97142-9605

Pagamento fica retido até resolução.`,

  // Erros e fallbacks
  naoEntendi: `Desculpa, não entendi 😅
Me conta o que você precisa que eu te ajudo!

Ou se preferir, fala direto com o *Santos*, nosso especialista:
📱 (11) 97142-9605`,

  erroInterno: `Ops, tive um probleminha aqui 😅
Mas já já normaliza!

Enquanto isso, você pode falar direto com o *Santos*, nosso especialista:
📱 (11) 97142-9605`,

  obrigado: `Por nada! 😊
Estamos aqui sempre que precisar.
Relaxa. A gente leva. 🚚✨

Qualquer dúvida, é só chamar!`,
};
