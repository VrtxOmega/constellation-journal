// ═══════════════════════════════════════════════════════════
// CONSTELLATION LINES — IAU stick figures for major constellations
// Each constellation connects named stars from STAR_CATALOG
// by star name pairs. Only includes recognizable constellations.
// ═══════════════════════════════════════════════════════════
const CONSTELLATION_LINES = {
  // ─── Orion ─────────────────────────────────────────────
  "Orion": [
    ["Betelgeuse", "Meissa"],
    ["Meissa", "Bellatrix"],
    ["Bellatrix", "Mintaka"],
    ["Mintaka", "Alnilam"],
    ["Alnilam", "Alnitak"],
    ["Alnitak", "Saiph"],
    ["Betelgeuse", "Alnitak"],
    ["Bellatrix", "Rigel"],
    ["Mintaka", "Rigel"],
    ["Rigel", "Saiph"],
  ],

  // ─── Ursa Major (Big Dipper) ───────────────────────────
  "Ursa Major": [
    ["Dubhe", "Merak"],
    ["Merak", "Phecda"],
    ["Phecda", "Megrez"],
    ["Megrez", "Alioth"],
    ["Alioth", "Mizar"],
    ["Mizar", "Alkaid"],
    ["Megrez", "Dubhe"],
  ],

  // ─── Ursa Minor ────────────────────────────────────────
  "Ursa Minor": [
    ["Polaris", "Kochab"],
    ["Kochab", "Pherkad"],
  ],

  // ─── Cassiopeia ────────────────────────────────────────
  "Cassiopeia": [
    ["Caph", "Schedar"],
    ["Schedar", "Gamma Cas"],
    ["Gamma Cas", "Ruchbah"],
    ["Ruchbah", "Segin"],
  ],

  // ─── Cygnus (Northern Cross) ───────────────────────────
  "Cygnus": [
    ["Deneb", "Sadr"],
    ["Sadr", "Albireo"],
    ["Sadr", "Gienah Cyg"],
    ["Sadr", "Fawaris"],
  ],

  // ─── Lyra ──────────────────────────────────────────────
  "Lyra": [
    ["Vega", "Sheliak"],
    ["Sheliak", "Sulafat"],
    ["Sulafat", "Vega"],
  ],

  // ─── Leo ───────────────────────────────────────────────
  "Leo": [
    ["Regulus", "Algieba"],
    ["Algieba", "Zosma"],
    ["Zosma", "Denebola"],
    ["Regulus", "Chertan"],
    ["Algieba", "Ras Elased Aus"],
  ],

  // ─── Scorpius ──────────────────────────────────────────
  "Scorpius": [
    ["Acrab", "Dschubba"],
    ["Dschubba", "Antares"],
    ["Antares", "Wei"],
    ["Wei", "Shaula"],
    ["Shaula", "Lesath"],
    ["Lesath", "Girtab"],
  ],

  // ─── Gemini ────────────────────────────────────────────
  "Gemini": [
    ["Castor", "Pollux"],
    ["Castor", "Mebsuta"],
    ["Mebsuta", "Tejat"],
    ["Pollux", "Wasat"],
    ["Wasat", "Alhena"],
  ],

  // ─── Taurus ────────────────────────────────────────────
  "Taurus": [
    ["Aldebaran", "Elnath"],
  ],

  // ─── Canis Major ───────────────────────────────────────
  "Canis Major": [
    ["Sirius", "Mirzam"],
    ["Sirius", "Adhara"],
    ["Adhara", "Wezen"],
    ["Wezen", "Aludra"],
  ],

  // ─── Aquila ────────────────────────────────────────────
  "Aquila": [
    ["Altair", "Tarazed"],
    ["Altair", "Alshain"],
  ],

  // ─── Sagittarius (Teapot) ─────────────────────────────
  "Sagittarius": [
    ["Kaus Australis", "Ascella"],
    ["Ascella", "Nunki"],
    ["Nunki", "Kaus Borealis"],
    ["Kaus Borealis", "Kaus Media"],
    ["Kaus Media", "Kaus Australis"],
    ["Kaus Borealis", "Alnasi"],
    ["Kaus Media", "Alnasi"],
  ],

  // ─── Andromeda ─────────────────────────────────────────
  "Andromeda": [
    ["Alpheratz", "Mirach"],
    ["Mirach", "Almach"],
  ],

  // ─── Pegasus (Great Square) ────────────────────────────
  "Pegasus": [
    ["Alpheratz", "Scheat"],
    ["Scheat", "Markab"],
    ["Markab", "Algenib"],
    ["Algenib", "Alpheratz"],
    ["Markab", "Enif"],
  ],

  // ─── Perseus ───────────────────────────────────────────
  "Perseus": [
    ["Mirfak", "Algol"],
  ],

  // ─── Auriga ────────────────────────────────────────────
  "Auriga": [
    ["Capella", "Menkalinan"],
    ["Capella", "Hassaleh"],
    ["Menkalinan", "Elnath"],
  ],

  // ─── Crux (Southern Cross) ─────────────────────────────
  "Crux": [
    ["Acrux", "Gacrux"],
    ["Mimosa", "Imai"],
  ],

  // ─── Bootes ────────────────────────────────────────────
  "Bootes": [
    ["Arcturus", "Izar"],
    ["Arcturus", "Muphrid"],
    ["Izar", "Seginus"],
    ["Seginus", "Nekkar"],
  ],

  // ─── Corvus ────────────────────────────────────────────
  "Corvus": [
    ["Gienah", "Kraz"],
    ["Kraz", "Minkar"],
    ["Minkar", "Algorab"],
    ["Algorab", "Gienah"],
  ],

  // ─── Hercules ──────────────────────────────────────────
  "Hercules": [
    ["Kornephoros", "Zeta Herculis"],
    ["Zeta Herculis", "Sarin"],
    ["Sarin", "Pi Herculis"],
  ],

  // ─── Draco (partial) ──────────────────────────────────
  "Draco": [
    ["Eltanin", "Rastaban"],
    ["Rastaban", "Thuban"],
  ],

  // ─── Summer Triangle (asterism) ────────────────────────
  "Summer Triangle": [
    ["Vega", "Deneb"],
    ["Deneb", "Altair"],
    ["Altair", "Vega"],
  ],

  // ─── Canis Minor ───────────────────────────────────────
  "Canis Minor": [
    ["Procyon", "Gomeisa"],
  ],
};
