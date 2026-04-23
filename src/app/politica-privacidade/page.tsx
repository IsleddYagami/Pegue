import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata = {
  title: "Política de Privacidade | Pegue",
  description: "Como a Pegue coleta, usa e protege seus dados pessoais conforme a LGPD.",
};

export default function PoliticaPrivacidade() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white py-12">
        <div className="mx-auto max-w-3xl px-4">
          <h1 className="text-3xl font-bold text-[#0A0A0A] mb-2">Política de Privacidade</h1>
          <p className="text-sm text-gray-500 mb-8">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

          <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">1. Quem somos</h2>
              <p>
                A <strong>Pegue</strong> é uma plataforma intermediadora de fretes,
                mudanças e guinchos que conecta clientes a fretistas autônomos
                verificados, atuando principalmente em Osasco e grande São Paulo.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">2. Dados que coletamos</h2>
              <p>Para prestar nosso serviço, coletamos:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>De clientes:</strong> telefone (WhatsApp), nome, endereço de origem e destino do frete, foto do material a transportar, descrição do serviço, histórico de corridas e avaliações.</li>
                <li><strong>De fretistas:</strong> nome, CPF, CNH, foto de documentos, foto do veículo, placa, chave Pix, histórico de corridas e avaliações.</li>
                <li><strong>Dados técnicos:</strong> endereço IP, horário de acesso, dispositivo, navegador.</li>
                <li><strong>Localização:</strong> compartilhada pelo cliente no WhatsApp (apenas no momento da cotação) e pelo fretista durante o rastreamento do frete ativo.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">3. Para que usamos seus dados</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Processar sua cotação e conectar você ao fretista adequado.</li>
                <li>Processar pagamentos via Mercado Pago.</li>
                <li>Enviar notificações sobre o status do seu frete.</li>
                <li>Verificar identidade e reputação dos fretistas.</li>
                <li>Resolver disputas com base em registros (fotos, horários, localização).</li>
                <li>Cumprir obrigações legais e fiscais.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">4. Com quem compartilhamos</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Fretistas cadastrados:</strong> recebem seu nome, telefone, endereço de origem/destino e descrição da carga (necessário pra executar o serviço).</li>
                <li><strong>Mercado Pago:</strong> dados de pagamento (processador financeiro).</li>
                <li><strong>ChatPro:</strong> provedor de API WhatsApp que intermedia as mensagens.</li>
                <li><strong>OpenAI:</strong> análise de foto do material via IA (sem identificação pessoal).</li>
                <li><strong>Supabase:</strong> hospedagem de banco de dados (Brasil/EUA).</li>
                <li><strong>Vercel:</strong> hospedagem do site.</li>
              </ul>
              <p className="mt-2">
                Não vendemos seus dados para terceiros.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">5. Seus direitos (LGPD)</h2>
              <p>Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Confirmar que tratamos seus dados.</li>
                <li>Acessar seus dados.</li>
                <li>Corrigir dados incompletos ou desatualizados.</li>
                <li>Solicitar a eliminação de dados (exceto quando obrigação legal exigir retenção).</li>
                <li>Revogar consentimento a qualquer momento.</li>
                <li>Solicitar portabilidade dos dados.</li>
              </ul>
              <p className="mt-2">
                Para exercer esses direitos, entre em contato pelo WhatsApp (11) 97036-3713 ou e-mail <a href="mailto:fretesresgatespg@gmail.com" className="text-[#C9A84C]">fretesresgatespg@gmail.com</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">6. Retenção de dados</h2>
              <p>
                Mantemos seus dados enquanto sua conta estiver ativa, durante o
                tempo necessário para cumprir obrigações legais (ex: 5 anos para
                registros fiscais) e até que você solicite exclusão.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">7. Segurança</h2>
              <p>
                Usamos criptografia em trânsito (HTTPS), controle de acesso a
                sistemas administrativos e validação de identidade em webhooks.
                Secrets não são armazenados em código. Ainda assim, nenhum sistema
                é 100% seguro — em caso de incidente relevante, você será notificado.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">8. Cookies</h2>
              <p>
                Usamos cookies técnicos essenciais para o funcionamento do site.
                Não usamos cookies de terceiros para publicidade direcionada.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">9. Transferência e sucessão empresarial</h2>
              <p>
                Em caso de fusão, aquisição, venda de ativos ou sucessão
                empresarial, seus dados podem ser transferidos ao sucessor, que
                ficará igualmente obrigado a cumprir esta política.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">10. Contato do DPO</h2>
              <p>
                Encarregado de Proteção de Dados: <a href="mailto:fretesresgatespg@gmail.com" className="text-[#C9A84C]">fretesresgatespg@gmail.com</a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">11. Alterações</h2>
              <p>
                Podemos atualizar esta política. A data da última atualização
                está no topo. Alterações significativas serão comunicadas pelo
                WhatsApp.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
