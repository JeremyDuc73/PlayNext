import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleanSteamCategories, formatSteamPriceLabel, stripHtml } from "./catalog.js";

describe("formatSteamPriceLabel", () => {
  it("formats a euro price", () => {
    const label = formatSteamPriceLabel({ currency: "EUR", finalCents: 1999 });
    assert.match(label, /19,99/);
    assert.match(label, /€/);
  });

  it("marks a free title", () => {
    assert.equal(formatSteamPriceLabel({ isFree: true }), "gratuit");
    assert.equal(formatSteamPriceLabel({ finalCents: 0 }), "gratuit");
  });

  it("marks an unknown price", () => {
    assert.equal(formatSteamPriceLabel({}), "—");
    assert.equal(formatSteamPriceLabel({ finalCents: null }), "—");
  });
});

describe("stripHtml", () => {
  it("strips html tags and decodes entities", () => {
    const raw = "<p>Un jeu d&#39;aventure &amp; d&#39;action.<br>Multijoueur &quot;en ligne&quot; !</p>";
    const clean = stripHtml(raw);
    assert.equal(clean, "Un jeu d'aventure & d'action.\nMultijoueur \"en ligne\" !");
  });

  it("handles empty or null values", () => {
    assert.equal(stripHtml(null), null);
    assert.equal(stripHtml(undefined), null);
    assert.equal(stripHtml("   "), null);
  });
});

describe("cleanSteamCategories", () => {
  it("filters out noisy Steam accessibility, audio and duplicate tags", () => {
    const raw = [
      "Solo",
      "Multijoueur",
      "Coopération",
      "Coopération en ligne",
      "Coop en LAN",
      "Multijoueur multiplateforme",
      "Succès Steam",
      "Compat. contrôleurs complète",
      "Cartes à échanger Steam",
      "Taille de texte réglable",
      "Caméra et confort de vue",
      "Contrôle du volume différencié",
      "Difficulté ajustable",
      "Jouable sans saisie en temps imparti",
      "Prise en charge des manettes DualShock 4",
      "Prise en charge des manettes DualShock 4",
      "Prise en charge des manettes DualSense",
      "Prise en charge des manettes DualSense",
      "Sauvegarde à tout moment",
      "Son stéréo",
      "Options de sous-titres",
      "Son multicanal",
      "Partage familial",
    ];

    const cleaned = cleanSteamCategories(raw);

    // Kept useful gameplay tags
    assert.ok(cleaned.includes("Coop en ligne"));
    assert.ok(cleaned.includes("Multijoueur"));
    assert.ok(cleaned.includes("Crossplay"));
    assert.ok(cleaned.includes("Coop LAN"));
    assert.ok(cleaned.includes("Solo"));
    assert.ok(cleaned.includes("Compatible manette"));

    // Filtered out noise
    assert.ok(!cleaned.includes("Cartes à échanger Steam"));
    assert.ok(!cleaned.includes("Succès Steam"));
    assert.ok(!cleaned.includes("Taille de texte réglable"));
    assert.ok(!cleaned.includes("Caméra et confort de vue"));
    assert.ok(!cleaned.includes("Son stéréo"));
    assert.ok(!cleaned.includes("Partage familial"));
    assert.ok(!cleaned.includes("Prise en charge des manettes DualShock 4"));
    assert.ok(!cleaned.includes("Prise en charge des manettes DualSense"));
  });

  it("handles custom competitive modes", () => {
    const raw = ["Multijoueur", "JcJ en ligne", "5c5 compétitif", "Coopération contre bots"];
    const cleaned = cleanSteamCategories(raw);
    assert.ok(cleaned.includes("5c5 compétitif"));
    assert.ok(cleaned.includes("Coopération contre bots"));
    assert.ok(cleaned.includes("Multijoueur"));
    assert.ok(cleaned.includes("JcJ en ligne"));
  });
});
