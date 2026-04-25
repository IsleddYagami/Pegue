// Mensagens do bot - sem acentos para compatibilidade total

export const MSG = {
  // Menu inicial
  boasVindas: `Ola! 😊 Que bom ter voce aqui na Pegue!

Vamos rapidamente fazer sua cotacao? Eu te ajudo, vamos la! 🚚

O que voce precisa?

1️⃣ *Pequenos Fretes*
2️⃣ *Mudanca completa*
3️⃣ *Guincho*
4️⃣ *Duvidas frequentes*`,

  pedirLocalizacao: `Otimo! 🚚

📍 *Envia sua localizacao atual* — segue o passo a passo na imagem 👆`,

  pedirLocalizacaoTextoSimples: `Otimo! 🚚

*Envia sua localizacao atual:*

📎 Clica no *clipe* abaixo > *Localizacao* 📍`,

  // URL publica da imagem tutorial (servida da pasta public/ via Vercel)
  TUTORIAL_LOCALIZACAO_URL: "https://www.chamepegue.com.br/tutorial-localizacao.png",

  guinchoMenu: `🚗 *SERVICO DE GUINCHO*

A gente busca seu veiculo no ponto A e leva pro ponto B!

📸 *COTACAO EXPRESS* - Manda uma *foto do veiculo* agora e receba o orcamento em segundos!

Ou escolha:
1️⃣ *Guincho Imediato* (preciso AGORA)
2️⃣ *Guincho Agendado* (escolher data e horario)`,

  guinchoDesativado: `O servico de guincho esta temporariamente indisponivel 😔

Mas fique tranquilo! Nosso especialista ja foi notificado e entrara em contato em breve! 🚗`,

  guinchoPedirLocalizacao: (categoria: string) =>
    `Entendi! *${categoria}* 🚗

📍 *Envia sua localizacao atual* — segue o passo a passo na imagem 👆`,

  guinchoPedirDestino: `Para onde vai o veiculo?

Digite *nome da rua, bairro e numero* 📍`,

  guinchoOrcamento: (
    categoria: string,
    origem: string,
    destino: string,
    valor: string,
    taxaExtra: string = ""
  ) =>
    `Preparei seu orcamento de guincho! 🚗

🔧 *Servico:* ${categoria}
📍 *Local:* ${origem}
🏠 *Destino:* ${destino}
${taxaExtra ? `🌙 *Taxa ${taxaExtra} aplicada*\n` : ""}
✅ *Total: R$ ${valor}*

📅 *Informe o dia e horario* 😊

Essas informacoes sao essenciais pra garantir o melhor atendimento!

Pode enviar tudo junto ou um de cada vez:
• *25/04 as 15h*
• *amanha 14:30*
• *segunda 9h*

Ou digite *AGORA* se for urgente`,

  localizacaoRecebida: (endereco: string) =>
    `Achei! Voce ta aqui pertinho: ${endereco} ✅

Como prefere informar os materiais?

1️⃣ *Mandar foto* 📸
2️⃣ *Lista rapida de mudanca* (so escolher os itens)
3️⃣ *Descrever por texto*`,

  enderecoRecebido: (endereco: string) =>
    `Anotado! Coleta em: ${endereco} ✅

Como prefere informar os materiais?

1️⃣ *Mandar foto* 📸
2️⃣ *Lista rapida de mudanca* (so escolher os itens)
3️⃣ *Descrever por texto*`,

  listaMudanca: `📋 *LISTA RAPIDA DE MUDANCA*

Mande os *numeros* dos itens separados por virgula:

*COZINHA:*
1 - Geladeira
2 - Fogao
3 - Micro-ondas
4 - Maquina de lavar
5 - Armario de cozinha
6 - Mesa com cadeiras

*QUARTO:*
7 - Cama casal
8 - Cama solteiro
9 - Guarda-roupa
10 - Comoda
11 - Colchao
12 - Escrivaninha

*SALA:*
13 - Sofa
14 - Rack / Estante
15 - TV
16 - Mesa de centro
17 - Poltrona

*OUTROS:*
18 - Caixas (quantas? ex: 18x5)
19 - Bicicleta
20 - Maquina de costura
21 - Tanquinho
22 - Ventilador/Ar condicionado

Mande os numeros separados por *espaco*:
Exemplo: *1 2 4 7 9 13 15 18x8*

(18x8 = 8 caixas)

Se tiver algo diferente, escreva no final!`,

  fotoItemAdicionado: (item: string, emoji: string, listaItens: string) => {
    const numerada = listaItens
      .split(", ")
      .filter((i) => i.trim().length > 0)
      .map((it, idx) => `${idx + 1}. ${it}`)
      .join("\n");
    return `Vi! *${item}* ${emoji} Anotado! ✅

📦 *Sua lista:*
${numerada}

Tem mais algum item?
• Manda outra *foto* ou *descrição* = adicionar
• *remover 2* = tira o item 2
• *PRONTO* = seguir
• *APAGAR* = limpar tudo`;
  },

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

  destinoRecebido: (destino: string) =>
    `${destino}! Otimo destino! ✅

Como e o local de *entrega*?

1️⃣ *Local Terreo*
2️⃣ *Local com elevador*
3️⃣ *Local com escada*`,

  qualAndar: `Entendi, local com escada! 🪜
Qual andar? Me manda o numero`,

  precisaAjudante: (infoLocal: string) =>
    `${infoLocal}

Vai precisar de ajudante pra carregar? 😊

1️⃣ *Nao*, sem ajudante
2️⃣ *Sim*, 1 ajudante
3️⃣ *Sim*, 2 ajudantes`,

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

📅 *Informe o dia e horario* 😊

Pode enviar tudo junto ou um de cada vez:
• *25/04 as 15h*
• *amanha 14:30*
• *segunda 9h*

Ou digite *AGORA* se for urgente`,

  planoEscolhido: `Otima escolha! ✨

📅 *Informe o dia e horario* 😊

Pode enviar tudo junto ou um de cada vez:
• *25/04 as 15h*
• *amanha 14:30*
• *segunda 9h*`,

  resumoFrete: (
    origem: string,
    destino: string,
    carga: string,
    data: string,
    veiculo: string,
    valor: string,
    detalhes: string
  ) =>
    `📋 *Resumo do seu pedido:*

📍 *Retirada:* ${origem}
🏠 *Destino:* ${destino}
📦 *Material:* ${carga}
🚚 *Veiculo:* ${veiculo}
📅 *Data:* ${data}
${detalhes}
✅ *Total: R$ ${valor}*

━━━━━━━━━━━━━━━━

🛑 *ANTES DE CONFIRMAR — CONFIRA:*

□ Quer *adicionar mais algum item* que tenha esquecido?
□ *Endereços* de retirada e entrega estão corretos?
□ *Data e horário* estão certos?
□ *Fretista NÃO faz montagem e desmontagem* — confira se não há essa necessidade
□ Se escolheu *elevador*, certifique-se que *todos os itens caibam* — divergência no dia pode gerar *custos adicionais*

━━━━━━━━━━━━━━━━

⚠️ *Importante:*
Por segurança, o fretista *não pode transportar itens fora da lista*. Se quiser incluir algo, será necessária *nova cotação* e pagamento separado.

━━━━━━━━━━━━━━━━

1️⃣ ✅ *SIM* - Conferi tudo, confirmar!
2️⃣ ✏️ *ALTERAR* - Quero corrigir ou adicionar algo`,

  freteRecebido: `Ok! Um momento, estamos preparando sua reserva 😊

Logo ja sera confirmado!`,

  // Mensagem de pagamento com confianca maxima:
  // - Comparacao com Mercado Livre (conceito que todo brasileiro entende)
  // - Nome do fretista revelado (sem telefone) pra dar cara humana
  // - Taxa de cartao clara pra nao ter surpresa
  // - Trust signals (CPF, CNH, redes sociais, endereco)
  freteConfirmadoEnviaPagamento: (linkPagamento: string, data: string, nomeFretista: string) =>
    `🎉 *Agenda confirmada pra ${data}!*

💳 *PAGAMENTO SEGURO*
${linkPagamento}

━━━━━━━━━━━━━━━━

🔒 *Exatamente como Mercado Livre:*

Após a confirmação do pagamento, o valor fica *retido no Mercado Pago*. Só é liberado ao fretista *depois que você confirmar* que o serviço foi concluído.

Qualquer problema = *reembolso 100%* 🔄

━━━━━━━━━━━━━━━━

🚚 *Fretista confirmado: ${nomeFretista}*
✅ CPF validado
✅ CNH validada
✅ Veículo + placa registrados
✅ Aceite dos termos de responsabilidade

━━━━━━━━━━━━━━━━

💰 *Pix* ou *cartão de crédito*

━━━━━━━━━━━━━━━━

📋 *Antes de pagar, saiba:*

• O fretista só leva o que está na sua cotação. Itens adicionais precisam de nova cotação.

• *Pontualidade é essencial.* O fretista reserva o horário pra você e tem outros compromissos. Cancelamento ou atraso no dia por parte do cliente gera *reembolso de 50%* do valor (taxa de locomoção do fretista).

━━━━━━━━━━━━━━━━

📸 Instagram: *@chamepegue*
🌐 *chamepegue.com.br*
📍 Sede: Presidente Altino, Osasco-SP

⏳ A reserva vale por *20 minutos*.
Dúvidas? Digite *SEGURO* 😊`,

  // Mensagem quando pagamento automatico esta OFF (equipe envia link manual depois).
  // Revela NOME do fretista (dá confianca) mas NAO telefone (evita negociacao direta).
  freteConfirmadoSemPagamento: (data: string, nomeFretista: string) =>
    `🎉 *Frete reservado pra ${data}!*

🚚 *Fretista confirmado: ${nomeFretista}*
✅ CPF + CNH validados
✅ Veículo registrado

Em alguns minutos nossa equipe te envia o *link de pagamento seguro* aqui no WhatsApp.

━━━━━━━━━━━━━━━━

🔒 *Pagamento igual Mercado Livre:*
Valor fica *retido no Mercado Pago* até você confirmar a entrega. Qualquer problema = *reembolso 100%*.

💰 Pix ou cartão de crédito

━━━━━━━━━━━━━━━━

📋 *Antes de pagar, saiba:*

• O fretista só leva o que está na sua cotação.
• *Pontualidade é essencial.* Cancelamento ou atraso pelo cliente no dia = reembolso de *50%* (taxa de locomoção do fretista).

━━━━━━━━━━━━━━━━

📸 @chamepegue | 🌐 chamepegue.com.br
Dúvidas? Digite *SEGURO* 😊`,

  nenhumFretista: `Nosso especialista logo enviara a confirmacao do seu frete! 😊
Fique tranquilo, ja estamos cuidando disso!`,

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

  explicaSeguranca: `🔒 *Pagamento Seguro — exatamente como Mercado Livre*

━━━━━━━━━━━━━━━━

🏦 *Como funciona o escrow:*

1️⃣ Você paga no link (Pix ou cartão)
2️⃣ O valor fica *RETIDO no Mercado Pago*
3️⃣ Fretista faz o serviço
4️⃣ Você confirma que recebeu tudo certinho
5️⃣ *Só então* o pagamento é liberado ao fretista

━━━━━━━━━━━━━━━━

🔄 *Reembolsos:*
• Fretista não apareceu → *100% reembolso*
• Cliente cancelou ANTES da coleta (mesmo dia ainda sem fretista a caminho) → *100% reembolso*
• Objeto danificado no transporte → disputa mediada pela Pegue
• Serviço não conforme → disputa mediada

⏰ *Política de atraso/cancelamento pelo cliente:*
Se o fretista já saiu ou chegou no local e cliente cancela/atrasa, será reembolsado *50%* do valor (os outros 50% cobrem a locomoção e tempo reservado do fretista).

━━━━━━━━━━━━━━━━

💰 *Pix* ou *cartão de crédito*

━━━━━━━━━━━━━━━━

🛡️ *Fretistas 100% verificados:*
✅ CPF validado
✅ CNH validada
✅ Foto do veículo + placa
✅ Selfie com documento no cadastro
✅ Termos de responsabilidade assinados
✅ Score em cada frete

━━━━━━━━━━━━━━━━

📸 Instagram: *@chamepegue*
🌐 *chamepegue.com.br*
📍 Presidente Altino, Osasco-SP

É o *mesmo modelo do Mercado Livre* — você já conhece e confia nele. 😊

A Pegue garante a segurança do valor pago até a confirmação da entrega. Seu dinheiro não vai direto pro fretista, passa pelo Mercado Pago.`,

  aguardarLinkPagamentoAvulso: `💳 *Pagamento:*

O link de pagamento sera enviado manualmente pela equipe Pegue em alguns minutos. Fique de olho aqui no WhatsApp!

Apos o pagamento, seu frete esta 100% confirmado. 🚚`,

  // === AVALIACAO DE PRECOS PELOS FRETISTAS ===

  avaliarIntro: `🎯 *Avaliacao de Precos - Pegue*

Obrigado por ajudar a Pegue a manter precos justos!

Como funciona:
1. Voce escolhe quais veiculos quer avaliar (pode ser varios)
2. Vou te mostrar varios fretes aleatorios, um por vez
3. Pra cada um, voce me diz quanto cobraria
4. Pode responder quantos quiser! Digite *PARAR* quando cansar

Nao precisa pensar muito - me diga o primeiro valor justo que vier na cabeca.

Vamos la! *Quais veiculos voce quer avaliar?*

Escolha um ou mais (separe por virgula ou espaco):
1️⃣ Carro comum (Kicks, Livina)
2️⃣ Utilitario (Strada, Saveiro)
3️⃣ HR (Hyundai HR, Bongo)
4️⃣ Caminhao Bau

Exemplo: *2* (so utilitario) ou *2 3* (utilitario e HR)`,

  avaliarOpcaoInvalida: `Nao entendi 😅

Escolha um ou mais veiculos separando por espaco ou virgula:

1️⃣ Carro comum
2️⃣ Utilitario
3️⃣ HR
4️⃣ Caminhao Bau

Exemplo: *2 3* (pra avaliar Utilitario e HR)

Ou digite *PARAR* pra sair.`,

  avaliarIniciando: (veiculos: string) =>
    `✅ Otimo! Voce vai avaliar: *${veiculos}*

Vou te mandar o primeiro frete agora...`,

  avaliarPrecoInvalido: `Nao entendi o valor 😅

Me manda *so o numero*, sem "R$" nem ".", nem virgula. Exemplo: *450*

Ou digite:
- *PARAR* pra finalizar
- *PROXIMO* pra pular sem avaliar`,

  avaliarRespostaSalva: (precoPegue: number, precoFretista: number) => {
    const gap = Math.round(((precoFretista - precoPegue) / precoPegue) * 100);
    const sinal = gap > 0 ? `+${gap}%` : `${gap}%`;
    const icone = Math.abs(gap) <= 10 ? "🟢" : Math.abs(gap) <= 25 ? "🟡" : "🔴";
    return `${icone} Registrado! Voce cobraria *R$ ${precoFretista}* (${sinal} vs Pegue)

Proximo frete chegando...`;
  },

  avaliarFinalizado: (total: number) =>
    `🎉 *Obrigado pela ajuda!*

Voce avaliou *${total} frete${total > 1 ? "s" : ""}*.

Seus feedbacks vao me ajudar a calibrar precos pra todos - voces, clientes e a Pegue.

Qualquer hora que quiser avaliar mais, so digitar *AVALIAR* aqui.

Ate mais! 🚚✨`,

  // === ADMIN - APLICAR AJUSTE DE PRECOS ===
  adminPerguntaAjuste: (
    veiculo: string, zona: string, kmMin: number, kmMax: number,
    qtdMin: number, qtdMax: number, comAjudante: boolean, gapPct: number,
    impactoHist: { qtdSimilares: number; faturamentoAntes: number; faturamentoDepois: number }
  ) => {
    const sinal = gapPct > 0 ? `+${gapPct}%` : `${gapPct}%`;
    const diff = impactoHist.faturamentoDepois - impactoHist.faturamentoAntes;
    const diffSinal = diff >= 0 ? `+R$ ${Math.round(diff)}` : `-R$ ${Math.abs(Math.round(diff))}`;

    let impactoTxt = "";
    if (impactoHist.qtdSimilares === 0) {
      impactoTxt = `\n📊 *Impacto historico:* Nenhuma cotacao similar nos ultimos 30 dias. Regra valera pra cotacoes futuras.`;
    } else {
      impactoTxt = `\n📊 *Impacto nos ultimos 30 dias:*
${impactoHist.qtdSimilares} cotacoes similares
Faturamento ANTES: R$ ${Math.round(impactoHist.faturamentoAntes)}
Faturamento DEPOIS: R$ ${Math.round(impactoHist.faturamentoDepois)}
Diferenca: *${diffSinal}*`;
    }

    return `🔧 *Quer JA aplicar esse ajuste nas cotacoes reais?*

A regra criada vai afetar:
🚚 Veiculo: *${veiculo}*
🗺 Zona: *${zona}*
📏 Distancia: *${kmMin}-${kmMax}km*
📦 Itens: *${qtdMin}-${qtdMax}*
🙋 Ajudante: *${comAjudante ? "Sim" : "Nao"}*

Ajuste: *${sinal}* sobre o preco base
${impactoTxt}

1️⃣ SIM, aplicar agora (afeta cotacoes novas)
2️⃣ NAO, so guardar feedback`;
  },

  adminAjusteAplicado: `✅ *Regra aplicada!*

Cotacoes novas que baterem nesse cenario vao levar o ajuste automaticamente.

Pra ver/editar/desativar regras: https://www.chamepegue.com.br/admin/feedback-precos

Proximo frete chegando...`,

  adminAjusteNaoAplicado: `👍 Entendido, so guardei o feedback pra analisar depois.

Proximo frete chegando...`,

  // Mensagem pro cliente quando o preco cai em revisao admin (anomalia detectada)
  precoEmRevisao: `Tudo anotado! 😊

Por se tratar de um servico com *valor mais elevado*, seu pedido passa por uma *segunda camada de analise* da nossa equipe pra garantir o melhor preco e condicoes pra voce.

Isso e rapido: em *poucos minutos* te retornamos com o valor final e os detalhes pra seguir.

Obrigado pela paciencia! Relaxa, a gente resolve tudo direitinho. 🚚✨`,

  // Dispatch para fretistas
  novoFreteDisponivel: (
    origem: string,
    destino: string,
    carga: string,
    data: string,
    valorPrestador: string,
    corridaId: string,
    ajudante: string
  ) =>
    `🚚 *Novo frete disponivel!*

📍 Origem: ${origem}
🏠 Destino: ${destino}
📦 Material: ${carga}
📅 ${data}
🙋 ${ajudante}
💰 Voce recebe: R$ ${valorPrestador}

━━━━━━━━━━━━━━━━
1️⃣ ✅ *PEGAR* - Quero esse frete!
2️⃣ 🙏 *EM ATENDIMENTO* - Estou ocupado no momento`,

  freteAceito: `Voce ganhou o frete! ✅🎉
Este servico ja esta reservado pra voce!

A confirmacao chegara logo apos o pagamento do cliente. Fique atento! 📱

💰 Seu pagamento sera liberado assim que o cliente confirmar o recebimento.`,

  freteJaPego: `Esse frete ja foi pego! 😉
Fica de olho que sempre tem novos aparecendo! 🚚`,

  // Atendimento humano
  transferenciaHumano: `Entendi! Vou acionar nosso especialista agora! 😊

Ele ja foi notificado e entrara em contato com voce em breve.
Fique tranquilo! 🙏`,

  foraHorarioHumano: `Nosso time ta disponivel de segunda a sexta, das 10h as 15h ⏰

Mas fique tranquilo! Nosso especialista foi notificado e entrara em contato no proximo horario util.

Enquanto isso, o bot continua te atendendo 24h! 🚚`,

  // === CADASTRO DE PRESTADOR ===

  cadastroInicio: `Que bom ter voce com a Pegue! 🚚✨

Antes de comecar, algumas informacoes importantes:

✅ Voce precisa ter *18 anos ou mais*
✅ Ter veiculo proprio com no maximo *15 anos de uso*
✅ Documentacao em dia (CNH e documento do veiculo)

Vamos la! Qual seu *nome completo*?`,

  cadastroCpf: `Agora me passa seu *CPF* (somente numeros)`,

  cadastroEmail: `Agora me passa seu *email* 📧
(vamos enviar uma copia dos termos pra voce)`,

  cadastroSelfie: `Agora preciso de uma *selfie sua segurando seu RG ou CNH aberto* 📸

⚠️ O documento precisa estar *aberto e legivel* na foto!
Segure proximo ao rosto pra ficar bem claro.`,

  cadastroFotoDocumento: `Agora manda uma *foto do documento aberto sozinho* (RG ou CNH) 📄

⚠️ Foto bem de perto, com TUDO legivel (nome, CPF, numero do documento).
Se for CNH, mostre a pagina da *foto e dados*.

Pode ser a mesma foto que voce mostrou na selfie, mas agora so o documento - sem o rosto.`,

  cadastroFotoPlaca: `Agora manda uma *foto da placa* do seu veiculo 📸`,

  cadastroFotoVeiculo: `Agora manda uma *foto do veiculo inteiro* 🚗
(de preferencia mostrando o veiculo de lado)`,

  cadastroChavePix: `Agora me passa sua *chave Pix* pra receber os pagamentos 💰

Pode ser CPF, email, telefone ou chave aleatoria.

⚡ Se tiver *Mercado Pago*, informe o email da conta MP pra receber na hora!`,

  cadastroTipoVeiculo: `Qual o tipo do seu veiculo?

1️⃣ *Carro comum* (Kicks, Livina, Renegade, Nivus, etc)
2️⃣ *Utilitario* (Strada, Saveiro, Courier)
3️⃣ *HR* (Hyundai HR, Bongo)
4️⃣ *Caminhao Bau*
5️⃣ *Guincho / Plataforma*`,

  cadastroTermos: `📋 *TERMOS DE PARTICIPACAO - PEGUE*

Leia com atencao antes de prosseguir:

*1. SOBRE A PEGUE*
A Pegue e uma plataforma de intermediacao de servicos de frete e transporte. Nao somos uma empresa de transporte. Conectamos clientes a prestadores de servico independentes.

*2. VOCE COMO PRESTADOR*
- Voce e um prestador *independente*, nao funcionario da Pegue
- Voce decide quais servicos aceitar e quando trabalhar
- E sua responsabilidade manter veiculo e documentacao em dia

*3. PROTOCOLO DE FOTOS (OBRIGATORIO)*
- Fotografar TODOS os materiais na *coleta* antes de carregar
- Fotografar TODOS os materiais na *entrega* apos descarregar
- Sem fotos = pagamento *BLOQUEADO*
- As fotos servem como prova para proteger voce e o cliente

*4. RESPONSABILIDADE POR DANOS E PREJUIZOS*
- O prestador e *responsavel* por qualquer dano, avaria ou extravio de materiais durante o transporte
- Em caso de dano comprovado, o valor sera descontado dos seus recebiveis
- ⚠️ *ATENCAO*: caso o valor do frete *nao seja suficiente* para cobrir os danos e prejuizos causados ao cliente contratante, uma *cobranca adicional sera necessaria* para sanar a ocorrencia
- O pagamento desta cobranca adicional podera ser feito via *Pix* ou *cartao de credito*
- Transporte com cuidado! Proteja os materiais adequadamente

*5. PAGAMENTO*
- Voce recebe *88%* do valor do frete
- O pagamento e liberado *apos o cliente confirmar o recebimento* dos materiais
- Quanto mais rapido a entrega for confirmada, mais rapido voce recebe

*6. CANCELAMENTOS*
- Cancelar um servico ja aceito *afeta seu score* na plataforma
- Cancelamentos recorrentes podem levar a *desativacao* da conta
- Cancele apenas em casos de real impossibilidade

*7. CONDUTA E ATENDIMENTO*
- Trate todos os clientes com *respeito e educacao*
- Seja pontual nos horarios combinados
- Reclamacoes de clientes *reduzem seu score* e suas indicacoes
- Comportamento inadequado resulta em *desativacao imediata*

*8. SISTEMA DE SCORE*
- Bom desempenho = *mais indicacoes* de frete
- Cancelamentos, reclamacoes e danos = *menos indicacoes*
- Score muito baixo = *desativacao da plataforma*

*9. DESATIVACAO*
A Pegue pode desativar sua conta a qualquer momento em caso de:
- Danos recorrentes a materiais de clientes
- Reclamacoes graves ou reincidentes
- Cancelamentos excessivos
- Comportamento inadequado
- Documentacao vencida ou irregular

*10. DADOS E PRIVACIDADE*
- Seus dados pessoais sao usados apenas para o cadastro e operacao da plataforma
- Dados dos clientes sao confidenciais e nao devem ser compartilhados

Para prosseguir com o cadastro, digite:
*eu concordo*`,

  cadastroConcluido: `Suas informacoes entraram em analise! ✅

Em breve voce recebera a confirmacao para iniciarmos nossa grande parceria! 🚚✨

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

  // === GUINCHO - FOTOS COLETA/ENTREGA ===

  guinchoPedirFotosColeta: `📸 *Hora de registrar a coleta do veiculo!*

Manda foto do veiculo *ANTES* de carregar na plataforma:
- Foto frontal
- Foto traseira
- Foto de cada lateral
- Foto de danos visiveis (se houver)

Pode mandar uma por uma.
Quando terminar, digite *PRONTO*

⚠️ Sem fotos de coleta = pagamento bloqueado`,

  guinchoPedirFotosEntrega: `📸 *Hora de registrar a entrega do veiculo!*

Manda foto do veiculo *APOS* descarregar da plataforma:
- Foto frontal
- Foto traseira
- Foto de cada lateral
- Foto mostrando que esta no local correto

Pode mandar uma por uma.
Quando terminar, digite *PRONTO*

⚠️ Sem fotos de entrega = pagamento bloqueado`,

  guinchoClienteConfirmarEntrega: (descricao: string) =>
    `🚗 *Veiculo entregue!*

${descricao}

━━━━━━━━━━━━━━━━

⚠️ *CONFIRA AGORA com o guincheiro ainda no local:*

🚗 O veiculo esta no local correto?
✅ Esta tudo conforme o combinado?

━━━━━━━━━━━━━━━━

⏳ *O guincheiro esta aguardando sua confirmacao para ser liberado.*
Por favor, confira rapidamente.

*Esta tudo certo?*

1️⃣ *SIM* - Tudo certo, servico concluido com sucesso! ✅
2️⃣ *NAO* - Tenho observacoes`,

  fretistaFotoRecebida: (total: number) =>
    `Foto ${total} recebida! ✅ Tem mais? Manda outra ou digite *PRONTO*`,

  fretistaColetaConfirmada: `Fotos de coleta registradas! ✅

Agora e so fazer a entrega com cuidado!
Quando chegar no destino, vou pedir as fotos de entrega 📸

Bom trabalho! 🚚`,

  fretistaEntregaConfirmada: `Fotos de entrega registradas! ✅

Aguardando confirmacao do cliente para liberar seu pagamento 💰
Assim que o cliente confirmar, voce sera notificado!`,

  clienteConfirmarEntrega: (carga: string) =>
    `🎉 *Pegou, Chegou!!*

Seu frete foi entregue! 📦✅

📋 *Material:*
${carga}

━━━━━━━━━━━━━━━━

⚠️ *CONFIRA AGORA com o fretista ainda no local:*

📦 Todos os itens chegaram?
🔍 Algum item com dano ou avaria?
✅ Esta tudo conforme o combinado?

━━━━━━━━━━━━━━━━

⏳ *O fretista esta aguardando sua confirmacao para ser liberado.*
Por favor, confira rapidamente.

*Esta tudo certo?*

1️⃣ *SIM* - Tudo certo, servicos concluidos com sucesso! ✅
2️⃣ *NAO* - Tenho observacoes`,

  fretistaAguardarConfirmacao: `⏳ *Aguarde no local!*

O cliente esta conferindo os materiais.

Assim que ele confirmar, voce sera liberado e seu pagamento processado.

Aguarde ate *20 minutos*. Se o cliente nao confirmar nesse tempo, voce pode se retirar e aguardar o andamento das tratativas.`,

  lembreteConfirmacao: `⏳ *Lembrete!*

Seu fretista ainda esta aguardando no local.
Por favor, confira os materiais e confirme a entrega.

1️⃣ *SIM* - Tudo certo, servicos concluidos com sucesso! ✅
2️⃣ *NAO* - Tenho observacoes`,

  fretistaPagamentoRapido: (valor: string, metodo: string) =>
    `✅ *Liberado! Bom trabalho!* 🚚✨

Seu pagamento esta sendo processado:
💰 *R$ ${valor}*
${metodo === "mp" ? "⚡ Via Mercado Pago - receba em instantes!" : "🏦 Via Pix - receba em ate 1 dia util"}

Obrigado pelo excelente servico!`,

  clienteConfirmouEntrega: `Entrega confirmada! ✅🎉

Pra gente continuar melhorando, me ajuda com uma avaliacao rapida? 😊

De 1 a 5, como foi o *atendimento geral*?
(1 = pessimo, 5 = excelente)`,

  clientePedirNotaPraticidade: `E de 1 a 5, como foi a *praticidade* do servico?
(facilidade de solicitar, rapidez, comunicacao)`,

  clientePedirNotaFretista: `De 1 a 5, o *fretista foi prestativo*?
(educacao, cuidado com os materiais, pontualidade)`,

  clientePedirSugestao: `Tem alguma *sugestao* pra gente melhorar? 😊
Pode falar a vontade! Ou digite *PULAR* se preferir.`,

  clienteAvaliacaoConcluida: `Obrigado pela avaliacao! 🙏

Sua opiniao e muito importante pra gente!

Estamos te aguardando para a proxima juntos com a Pegue! 🚚✨

Siga *@chamepegue* no Instagram pra cupons exclusivos!
👉 instagram.com/chamepegue

Qualquer duvida, e so chamar! 😊`,

  clienteReclamouEntrega: `Sentimos muito pelo problema 😔

Nosso especialista ja foi notificado e entrara em contato pra resolver.
Vamos cuidar disso pra voce!`,

  fretistaPagamentoLiberado: `✅ *Liberado! Bom trabalho!* 🚚✨

O cliente confirmou a entrega.
Seu pagamento esta sendo processado!

Obrigado pelo excelente servico!`,

  fretistaProblemaNaEntrega: `⚠️ O cliente reportou um problema na entrega.

Nosso especialista ja foi notificado e entrara em contato.

Pagamento fica retido ate resolucao.`,

  // === RASTREIO ===

  rastreioLinkFretista: (link: string) =>
    `📍 *Rastreamento ativo!*

Abra este link no celular pra compartilhar sua localizacao com o cliente em tempo real:
👉 ${link}

⚠️ *Mantenha a pagina aberta durante o transporte!*
Quando voce chegar no destino, o sistema detecta automaticamente.`,

  rastreioLinkCliente: (link: string, nomeFretista: string) =>
    `📍 *Acompanhe seu frete em tempo real!*

Veja onde *${nomeFretista}* esta no mapa:
👉 ${link}

🚚 Atualizacoes a cada 30 segundos
Quando chegar no destino, voce recebe uma notificacao aqui!`,

  fretistaChegouDestino: `📍 *O fretista chegou no endereco de entrega!*

Confira se esta tudo certo com os materiais. O fretista esta no local aguardando.

1️⃣ *SIM* - Tudo certo, servicos concluidos! ✅
2️⃣ *NAO* - Tenho observacoes`,

  // === DASHBOARD FRETISTA ===

  dashboardFretista: (
    nome: string,
    score: string,
    totalFretes: number,
    faturamento: string,
    status: string
  ) =>
    `📊 *Seu Painel - Pegue*

👤 *${nome}*
⭐ Score: *${score}/10*
🚚 Fretes realizados: *${totalFretes}*
💰 Faturamento total: *R$ ${faturamento}*
📌 Status: *${status}*

${
  parseFloat(score) >= 8
    ? "🏆 Excelente! Voce esta entre os melhores parceiros!"
    : parseFloat(score) >= 5
    ? "👍 Bom trabalho! Continue assim pra subir no ranking!"
    : "⚠️ Atencao! Melhore seu atendimento pra receber mais indicacoes."
}

📱 Painel completo no site: chamepegue.com.br/parceiro#dashboard
📸 Siga @chamepegue no Instagram pra vagas e novidades!

Pra ver novamente, digite *meu painel* a qualquer momento 😊`,

  // === POS PRIMEIRO FRETE - CLIENTE ===

  primeiroFreteCliente: `🎉 *Parabens! Seu primeiro frete com a Pegue foi concluido!*

Obrigado por confiar em nossas solucoes! 🚚✨`,

  ferramentasCliente: `📋 *SUAS FERRAMENTAS PEGUE*

Agora voce tem acesso ao seu painel pessoal!

━━━━━━━━━━━━━━━━

📊 *SEU HISTORICO*
Acompanhe todos os seus fretes, valores e fretistas.
👉 Digite: *minha conta*

💰 *CONTROLE FINANCEIRO*
Registre seus gastos e tenha controle total!
👉 Digite: *despesa [valor] [descricao]*
Ex: *despesa 50 combustivel*
👉 Para ver resumo: *meus gastos*

⚠️ _As informacoes ficam armazenadas por 30 dias_

━━━━━━━━━━━━━━━━

🌐 *PAINEL NO SITE*
Acesse graficos completos pelo navegador:
👉 chamepegue.com.br/minha-conta

📱 *INSTAGRAM*
Siga *@chamepegue* pra cupons exclusivos!
👉 instagram.com/chamepegue

━━━━━━━━━━━━━━━━

*RESUMO DOS COMANDOS:*
✅ *minha conta* → ver seu historico
✅ *despesa 50 combustivel* → registrar gasto
✅ *meus gastos* → ver resumo financeiro
❓ *esqueci* → ver todos os comandos

Conte com a gente sempre! 🚚✨`,

  orientacoesCliente: `📋 *ORIENTACOES PARA SEU FRETE*

📸📸📸📸📸📸📸📸📸📸
*FOTOGRAFE TODOS os seus itens ANTES da Coleta!*
Isso garante uma excelente experiencia para todos, evitando qualquer transtorno futuro. As fotos servem como registro do estado dos materiais antes do transporte.
📸📸📸📸📸📸📸📸📸📸

📦 *PREPARE SEUS ITENS*
- Tenha tudo pronto e acessivel no momento da coleta
- Desmonte moveis grandes se possivel
- Embale itens frageis com plastico bolha ou cobertor
- Separe parafusos e pecas pequenas em saquinhos

🕐 *EVITE ATRASOS*
Atrasos podem gerar custos extras e ate cancelamento com taxa de locomocao.
- Esteja no local no horario combinado
- Alinhe com a portaria os dias agendados
- Em predios sem interfone, tenha alguem embaixo pra receber o fretista
- Libere elevador de carga com antecedencia

🚫 *NAO ALTERE A COTACAO*
- Nao inclua itens a mais do que o cotado
- Nao altere a quantidade sem comunicar antes
- Precisou incluir algo? Informe pelo WhatsApp antes da coleta
- Itens nao declarados podem ser recusados

🏠 *NO LOCAL DE ENTREGA*
- Confirme que o acesso esta liberado
- Avise a portaria com antecedencia
- Tenha alguem pra receber e conferir

✅ *APOS A ENTREGA*
- Confira se tudo esta bem antes de confirmar
- Apos sua confirmacao o pagamento do fretista sera liberado

Relaxa. A gente leva. 🚚✨`,

  // Erros e fallbacks
  naoEntendi: `Desculpa, nao entendi 😅
Me conta o que voce precisa que eu te ajudo!

Ou digite *4* pra falar com um especialista.`,

  erroInterno: `Ops, tive um probleminha aqui 😅

Ja avisei a equipe Pegue e em breve entramos em contato pra finalizar seu pedido.

Se preferir, digite *oi* pra recomecar ou *4* pra falar com um especialista agora.`,

  obrigado: `Por nada! 😊
Estamos aqui sempre que precisar.
Relaxa. A gente leva. 🚚✨

Qualquer duvida, e so chamar!`,
};
