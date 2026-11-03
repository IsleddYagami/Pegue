import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Travas regressivas de SEO. Nascem de erros que estiveram NO AR em
// 01-02/Nov/2026 (caderno ~/.claude/antidoto/erros.jsonl):
//
//  1. cinco paginas serviam canonical da HOME (herdado do layout raiz):
//     /carreto, /guincho, /jogo, /termos-uso, /politica-privacidade.
//     As duas landings de Osasco mandavam o Google descartar elas mesmas.
//  2. o H1 da home dizia "em Sao Paulo" e o <title> dizia "em Osasco" —
//     visitante lendo uma coisa, robo lendo outra.
//  3. o botao flutuante do WhatsApp (toda pagina) usava 5511999999999.
//  4. canonical e JSON-LD apontavam pra chamepegue.com.br, que da 307
//     pra www — canonical tem que ser a URL FINAL.
//
// Sao checagens de ARQUIVO, sem rede: rodam no mesmo `npm test` de sempre
// e falham antes do deploy, nao depois.

const APP = path.join(__dirname, "..", "app");
const SRC = path.join(__dirname, "..");

function ler(p: string): string {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : "";
}

// Rotas publicas = indexaveis. Fora: admin (Disallow no robots.txt),
// api, teste-* (404 em producao pelo middleware) e rotas dinamicas
// (/rastrear/[codigo] e afins nao devem ser indexadas uma por uma).
function rotasPublicas(): { rota: string; dir: string }[] {
  const achadas: { rota: string; dir: string }[] = [];
  function anda(dir: string, rota: string) {
    for (const nome of fs.readdirSync(dir)) {
      const cheio = path.join(dir, nome);
      if (!fs.statSync(cheio).isDirectory()) continue;
      if (nome === "admin" || nome === "api") continue;
      if (nome.startsWith("teste-") || nome.startsWith("[") || nome.startsWith("_")) continue;
      if (fs.existsSync(path.join(cheio, "page.tsx"))) {
        achadas.push({ rota: `${rota}/${nome}`, dir: cheio });
      }
      anda(cheio, `${rota}/${nome}`);
    }
  }
  anda(APP, "");
  return achadas;
}

describe("canonical: nenhuma pagina publica pode herdar o da home", () => {
  const rotas = rotasPublicas();

  it("acha as rotas publicas (se der 0, o teste virou decoracao)", () => {
    expect(rotas.length).toBeGreaterThanOrEqual(8);
  });

  it.each(rotas.map((r) => [r.rota, r.dir] as const))(
    "%s declara canonical proprio",
    (rota, dir) => {
      const fonte = ler(path.join(dir, "page.tsx")) + ler(path.join(dir, "layout.tsx"));
      // Aceita canonical proprio OU noindex explicito (pagina de conta
      // logada nao precisa de canonical porque nao entra no indice).
      const temCanonical = new RegExp(`canonical:\\s*["'\`]${rota}["'\`]`).test(fonte);
      const temNoindex = /index:\s*false|noindex/.test(fonte);
      expect(
        temCanonical || temNoindex,
        `${rota}: sem canonical proprio e sem noindex — vai herdar "/" do layout raiz e se declarar copia da home`,
      ).toBe(true);
    },
  );
});

describe("home: o que o visitante le e o que o Google le tem que bater", () => {
  const page = ler(path.join(APP, "page.tsx"));
  const layout = ler(path.join(APP, "layout.tsx"));

  // Regioes que a Pegue pode nomear. Se o H1 cita uma, o titulo tambem tem.
  const REGIOES = ["São Paulo", "Osasco", "Zona Oeste", "Litoral", "Interior"];

  function textoDoH1(src: string): string {
    const m = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    return m ? m[1].replace(/<[^>]+>/g, "") : "";
  }

  it("o H1 da home existe (se nao, o resto do teste nao prova nada)", () => {
    expect(textoDoH1(page).trim().length).toBeGreaterThan(10);
  });

  it("toda regiao citada no H1 aparece no title da home", () => {
    const h1 = textoDoH1(page);
    const titulo = (layout.match(/default:\s*"([^"]+)"/) || ["", ""])[1];
    expect(titulo.length).toBeGreaterThan(10);
    const noH1 = REGIOES.filter((r) => h1.includes(r));
    expect(noH1.length, "o H1 da home nao cita regiao nenhuma").toBeGreaterThan(0);
    for (const r of noH1) {
      expect(
        titulo.includes(r),
        `H1 diz "${r}" e o <title> nao: "${titulo}". Visitante le uma regiao, robo le outra.`,
      ).toBe(true);
    }
  });
});

describe("placeholders e dominio errado nao passam", () => {
  function arquivosFonte(dir: string, achados: string[] = []): string[] {
    for (const nome of fs.readdirSync(dir)) {
      const cheio = path.join(dir, nome);
      if (fs.statSync(cheio).isDirectory()) arquivosFonte(cheio, achados);
      else if (/\.(ts|tsx)$/.test(cheio) && !cheio.endsWith(".test.ts")) achados.push(cheio);
    }
    return achados;
  }

  const fontes = arquivosFonte(SRC);

  it("acha os arquivos de fonte", () => {
    expect(fontes.length).toBeGreaterThan(50);
  });

  // So' LINK: texto de ajuda do Pix ("ex: +5511999999999"), placeholder de
  // formulario e fixture de smoke citam numeros de exemplo de proposito.
  it("nenhum link wa.me pra numero de exemplo", () => {
    const culpados = fontes.filter((f) =>
      /wa\.me\/\d*9{7,}/.test(fs.readFileSync(f, "utf-8")),
    );
    expect(culpados.map((c) => path.relative(SRC, c))).toEqual([]);
  });

  // Vale pras superficies que o ROBO le: canonical, sitemap, OG. O dominio
  // pelado da 307 pra www, e canonical tem que ser a URL final.
  //
  // Fora daqui o dominio pelado ainda existe e NAO e' coberto por esta
  // trava (02/Nov): lib/mercadopago.ts e api/pagamento/teste (notification_url
  // e back_urls do Mercado Pago) e api/whatsapp/webhook (baseUrl dos links
  // mandados pro cliente). Mexer em URL de pagamento e' decisao do Fabio,
  // nao minha — esta' no relatorio, nao escondido num teste.
  it("superficie de SEO usa www (o dominio pelado da 307)", () => {
    const seo = fontes.filter((f) =>
      /app\/(layout\.tsx|sitemap\.ts|og-image|[a-z-]+\/page\.tsx)$|app\/page\.tsx$/.test(
        f.replace(/\\/g, "/"),
      ),
    );
    expect(seo.length, "a lista de superficies de SEO ficou vazia").toBeGreaterThan(5);
    const culpados = seo.filter((f) =>
      /https:\/\/chamepegue\.com\.br/.test(fs.readFileSync(f, "utf-8")),
    );
    expect(culpados.map((c) => path.relative(SRC, c))).toEqual([]);
  });
});
