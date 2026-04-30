import { describe, it, expect } from "vitest";
import { detectarLinkGoogleMaps } from "./google-maps-link";

describe("detectarLinkGoogleMaps", () => {
  describe("detecta links validos", () => {
    it.each([
      ["https://maps.app.goo.gl/QaoRUWZDrfbEB8Fu6", "https://maps.app.goo.gl/QaoRUWZDrfbEB8Fu6"],
      ["https://goo.gl/maps/abc123", "https://goo.gl/maps/abc123"],
      ["https://www.google.com/maps/place/Foo/@-23.5,-46.6,17z/data=...", "https://www.google.com/maps/place/Foo/@-23.5,-46.6,17z/data=..."],
      ["https://maps.google.com/?q=-23.5,-46.6", "https://maps.google.com/?q=-23.5,-46.6"],
      ["maps.app.goo.gl/QaoRUWZDrfbEB8Fu6", "https://maps.app.goo.gl/QaoRUWZDrfbEB8Fu6"], // sem https
      ["olha o local: https://maps.app.goo.gl/abc123 perto da padaria", "https://maps.app.goo.gl/abc123"], // dentro de texto
    ])("detecta '%s'", (input, expected) => {
      expect(detectarLinkGoogleMaps(input)).toBe(expected);
    });
  });

  describe("rejeita textos sem link valido", () => {
    it.each([
      ["Rua Augusta, 100"],
      ["sem link aqui"],
      [""],
      ["https://outraempresa.com/maps"],
      ["https://chamepegue.com.br"],
    ])("retorna null pra '%s'", (input) => {
      expect(detectarLinkGoogleMaps(input)).toBeNull();
    });
  });
});
