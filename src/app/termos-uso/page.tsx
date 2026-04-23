import { Header } from "@/components/header";
import { Footer } from "@/components/footer";

export const metadata = {
  title: "Termos de Uso | Pegue",
  description: "Condições gerais para uso da plataforma Pegue por clientes e fretistas.",
};

export default function TermosUso() {
  return (
    <>
      <Header />
      <main className="flex-1 bg-white py-12">
        <div className="mx-auto max-w-3xl px-4">
          <h1 className="text-3xl font-bold text-[#0A0A0A] mb-2">Termos de Uso</h1>
          <p className="text-sm text-gray-500 mb-8">Última atualização: {new Date().toLocaleDateString("pt-BR")}</p>

          <div className="prose prose-sm max-w-none text-gray-700 space-y-6">
            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">1. O que é a Pegue</h2>
              <p>
                A Pegue é uma plataforma de <strong>intermediação</strong> que
                conecta clientes que precisam de serviços de frete, mudança ou
                guincho com prestadores autônomos cadastrados. A Pegue
                <strong> não é transportadora</strong> e não executa diretamente
                os serviços.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">2. Cadastro</h2>
              <p>
                Ao usar nossos serviços via WhatsApp, você declara ter no mínimo
                18 anos e que todas as informações fornecidas são verdadeiras.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">3. Cotação e preço</h2>
              <p>
                O preço do frete é calculado com base em distância, tipo de
                veículo, quantidade de itens, necessidade de ajudante e outras
                variáveis. O valor final é informado antes da confirmação e tem
                validade de 20 minutos após apresentado.
              </p>
              <p>
                A cotação pode ser recusada caso o preço calculado esteja fora
                de padrões normais (sistema anti-fraude).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">4. Pagamento</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Aceitamos Pix e cartão de crédito/débito via Mercado Pago.</li>
                <li>Cartão tem taxa adicional de 4,98% repassada ao cliente.</li>
                <li>Pagamento só é confirmado após o fretista aceitar o serviço.</li>
                <li>Caso o fretista não seja encontrado, o valor pago é estornado.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">5. Responsabilidades do cliente</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Fornecer informações corretas (endereço, material, data).</li>
                <li>Desmontar móveis que precisam (guarda-roupas, camas, estantes). A Pegue não oferece serviço de montagem/desmontagem.</li>
                <li>Descongelar e secar geladeiras com pelo menos 6h de antecedência.</li>
                <li>Estar presente no horário combinado para coleta e entrega.</li>
                <li>Não transportar itens ilegais, perigosos ou proibidos por lei.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">6. Responsabilidades do fretista</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>Possuir CNH válida e veículo em condições legais de circulação.</li>
                <li>Cumprir o horário combinado.</li>
                <li>Registrar fotos na coleta e entrega (prova digital).</li>
                <li>Cuidar dos itens durante o transporte.</li>
                <li>Em caso de dano por sua responsabilidade, arcar com o custo de reparo ou reposição, que pode ser superior ao valor do frete (cobrança adicional via Pix ou cartão).</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">7. Comissão</h2>
              <p>
                A Pegue retém 12% do valor do frete como comissão de
                intermediação. O fretista recebe 88%.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">8. Cancelamento</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Pelo cliente:</strong> antes do pagamento, sem custo. Após pagamento, pode haver retenção proporcional se o fretista já estiver a caminho.</li>
                <li><strong>Pelo fretista:</strong> sujeito a redução de score e, em caso de reincidência, suspensão da conta.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">9. Limitações de responsabilidade</h2>
              <p>
                Como intermediadora, a Pegue atua para facilitar a conexão entre
                cliente e fretista. A responsabilidade pelo transporte em si é
                do fretista contratado. Em caso de disputas, a Pegue oferece
                mediação com base nas provas digitais registradas.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">10. Privacidade</h2>
              <p>
                O tratamento dos seus dados é regido pela nossa <a href="/politica-privacidade" className="text-[#C9A84C]">Política de Privacidade</a>.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">11. Alterações</h2>
              <p>
                Podemos atualizar estes termos. Alterações relevantes serão
                comunicadas. O uso continuado após mudanças representa aceite
                dos novos termos.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">12. Foro</h2>
              <p>
                Fica eleito o foro da comarca de Osasco/SP para dirimir
                quaisquer questões decorrentes destes termos.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-[#0A0A0A]">13. Contato</h2>
              <p>
                WhatsApp: (11) 97036-3713<br />
                E-mail: <a href="mailto:fretesresgatespg@gmail.com" className="text-[#C9A84C]">fretesresgatespg@gmail.com</a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
