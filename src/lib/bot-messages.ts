// Mensagens do bot - sem acentos para compatibilidade total

export const MSG = {
  // Menu inicial
  boasVindas: `Oii! 😊 Que bom ter voce aqui no Pegue! 🚚
Estou aqui pra te ajudar com o que precisar.

O que voce precisa?

1️⃣ *Pequenos Fretes ou Mudanca*
2️⃣ *Guincho* (carro ou moto)
3️⃣ *Falar com nosso especialista Santos*`,

  pedirLocalizacao: `Otimo! Vou te ajudar com seu frete! 🚚

De onde vamos retirar o material?

Voce pode:
1️⃣ Mandar sua *localizacao* - clica no 📎 ao lado do campo de mensagem, depois em *Localizacao* 📍
2️⃣ Digitar o *CEP* (ex: 06010-000)
3️⃣ Digitar o *endereco* com rua e bairro

💡 Se a localizacao nao funcionar, verifique se o GPS do celular esta ligado e se o WhatsApp tem permissao de localizacao nas configuracoes do celular.`,

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

  destinoRecebido: (destino: string) =>
    `${destino}! Otimo destino! ✅

Me conta sobre o local de entrega:

1️⃣ *Local terreo*
2️⃣ *Predio com elevador*
3️⃣ *Predio sem elevador / escada*`,

  qualAndar: `Entendi, predio sem elevador! 🏢
Qual andar? Me manda o numero`,

  precisaAjudante: (infoLocal: string) =>
    `${infoLocal}

Vai precisar de ajudante pra carregar? 😊

1️⃣ *Nao*, consigo sozinho
2️⃣ *Sim*, preciso de ajudante`,

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

  freteConfirmadoEnviaPagamento: (linkPagamento: string) =>
    `Agenda confirmada! ✅

Para garantir a data, conclua o pagamento:
💳 ${linkPagamento}

💰 *Pix* sem taxas
💳 *Cartao de credito* taxas adicionais

⏳ A reserva se mantem disponivel por *20 minutos*. Apos esse tempo, sera necessaria uma nova cotacao para verificar e garantir nova agenda.`,

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

Quer pegar? Responda *PEGAR*`,

  freteAceito: `Voce ganhou o frete! ✅🎉
Este servico ja esta reservado pra voce!

A confirmacao chegara logo apos o pagamento do cliente. Fique atento! 📱

💰 Seu pagamento sera liberado assim que o cliente confirmar o recebimento.`,

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

  cadastroFotoPlaca: `Agora manda uma *foto da placa* do seu veiculo 📸`,

  cadastroFotoVeiculo: `Agora manda uma *foto do veiculo inteiro* 🚗
(de preferencia mostrando o veiculo de lado)`,

  cadastroTipoVeiculo: `Qual o tipo do seu veiculo?

1️⃣ *Carro comum* (Kicks, Livina, Renegade, Nivus, etc)
2️⃣ *Utilitario* (Strada, Saveiro, Courier)
3️⃣ *HR* (Hyundai HR)
4️⃣ *Caminhao Bau*`,

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

*4. RESPONSABILIDADE POR DANOS*
- O prestador e *responsavel* por qualquer dano, avaria ou extravio de materiais durante o transporte
- Em caso de dano comprovado, o valor sera descontado dos seus recebiveis
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
    `Seu frete foi entregue! 📦✅

Material: *${carga}*

⚠️ *Antes de confirmar, verifique com atencao:*
- Todos os itens foram entregues?
- Algum item chegou com dano ou avaria?
- Esta tudo conforme o combinado?

Apos sua confirmacao, o pagamento do fretista sera liberado.

Esta tudo certo com a entrega? 😊

1️⃣ *SIM* - Missao cumprida! ✅
2️⃣ *NAO* - Tenho duvidas`,

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

Segue a gente no Instagram pra cupons exclusivos e novidades! 📱
👉 instagram.com/chamepegue

Relaxa. A gente leva. 🚚✨
Qualquer duvida, e so chamar!`,

  clienteReclamouEntrega: `Sentimos muito pelo problema 😔

Nosso especialista *Santos* vai entrar em contato pra resolver:
📱 (11) 97142-9605

Vamos cuidar disso pra voce!`,

  fretistaPagamentoLiberado: `Pagamento liberado! ✅💰

O cliente confirmou a entrega. Seu pagamento sera processado!

Obrigado pelo excelente trabalho! 🚚✨`,

  fretistaProblemaNaEntrega: `⚠️ O cliente reportou um problema na entrega.

Nosso especialista *Santos* vai entrar em contato:
📱 (11) 97142-9605

Pagamento fica retido ate resolucao.`,

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

📱 Painel completo no site: pegue-eta.vercel.app/parceiro#dashboard
📸 Siga @chamepegue no Instagram pra vagas e novidades!

Pra ver novamente, digite *meu painel* a qualquer momento 😊`,

  // === POS PRIMEIRO FRETE - CLIENTE ===

  primeiroFreteCliente: `🎉 *Parabens! Seu primeiro frete com a Pegue!*

Obrigado por confiar em nossas solucoes! Estamos muito felizes em te atender. 🚚✨

📋 *SUAS FERRAMENTAS PEGUE*

Agora voce tem acesso ao seu painel pessoal! Veja o que pode fazer:

━━━━━━━━━━━━━━━━

📊 *SEU HISTORICO*
Acompanhe todos os seus fretes, valores e fretistas.
👉 Digite: *minha conta*

🌐 *PAINEL NO SITE*
Acesse graficos completos pelo navegador:
👉 pegue-eta.vercel.app/minha-conta

━━━━━━━━━━━━━━━━

📱 *INSTAGRAM*
Siga *@chamepegue* pra cupons exclusivos e novidades!
👉 instagram.com/chamepegue

━━━━━━━━━━━━━━━━

*RESUMO DOS COMANDOS:*
✅ *minha conta* → ver seu historico e fretes
❓ *esqueci* → ver todos os comandos

Conte com a gente sempre! 🚚✨`,

  orientacoesCliente: `📋 *ORIENTACOES IMPORTANTES*

Para garantir uma excelente experiencia e evitar transtornos:

━━━━━━━━━━━━━━━━

📸 *ANTES DA COLETA:*
- Tenha *todos os itens prontos e acessiveis* no momento da coleta
- Desmonte moveis grandes se possivel (economiza espaco e tempo)
- Embale itens frageis com plastico bolha ou cobertor
- Separe parafusos e pecas pequenas em saquinhos identificados
- *Fotografe seus itens ANTES do fretista carregar*

━━━━━━━━━━━━━━━━

⚠️ *EVITE ATRASOS (IMPORTANTE):*
Atrasos podem gerar *custos extras* e ate o *cancelamento do servico*, sendo cobrado *taxa de locomoção*.

- *Alinhe com a portaria* os dias agendados para coleta e entrega
- Se for apartamento sem interfone, *tenha alguem na portaria* pra receber e autorizar o fretista
- Libere acesso a elevador de carga (se houver) com antecedencia
- Esteja no local no horario combinado

━━━━━━━━━━━━━━━━

🚫 *NAO ALTERE A COTACAO:*
- *Nao inclua itens a mais* do que o cotado
- *Nao altere a quantidade* de itens sem comunicar antes
- Se precisar incluir mais itens, informe pelo WhatsApp *antes da coleta* pra recalcular o valor
- Itens nao declarados podem ser recusados pelo fretista

━━━━━━━━━━━━━━━━

🏠 *NO LOCAL DE ENTREGA:*
- Confirme que o acesso esta liberado (portaria, elevador, chave)
- Se for predio, avise a portaria com antecedencia
- Tenha alguem no local pra receber e conferir os itens

━━━━━━━━━━━━━━━━

✅ *APOS A ENTREGA:*
- Voce recebera uma mensagem pra confirmar
- *Confira se tudo esta bem no recebimento antes de dar confirmacao de servicos realizados com sucesso*
- Apos sua confirmacao, o pagamento do fretista sera liberado
- Sua avaliacao ajuda a manter a qualidade!

━━━━━━━━━━━━━━━━

❓ *Qualquer problema ou duvida:*
Fale com nosso especialista Santos: (11) 97142-9605

Relaxa. A gente leva. 🚚✨`,

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
