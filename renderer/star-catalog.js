// ═══════════════════════════════════════════════════════════
// REAL STAR CATALOG — Brightest stars visible to naked eye
// Source: HYG Database (public domain), curated subset
// Fields: name, ra (hours), dec (degrees), mag (apparent),
//         bv (B-V color index for Planck color), spectral
//
// B-V color mapping:
//   < -0.1  → blue-white (O/B stars)
//   -0.1–0.3 → white (A stars)
//   0.3–0.6  → yellow-white (F stars)
//   0.6–0.8  → yellow (G stars, like our Sun)
//   0.8–1.2  → orange (K stars)
//   > 1.2    → red (M stars)
// ═══════════════════════════════════════════════════════════
const STAR_CATALOG = [
  // ─── Orion & surroundings ────────────────────────────────
  { name: "Betelgeuse",     ra: 5.919, dec: 7.407,   mag: 0.42, bv: 1.85 },
  { name: "Rigel",          ra: 5.242, dec: -8.202,  mag: 0.13, bv: -0.03 },
  { name: "Bellatrix",      ra: 5.419, dec: 6.350,   mag: 1.64, bv: -0.22 },
  { name: "Mintaka",        ra: 5.533, dec: -0.299,  mag: 2.23, bv: -0.21 },
  { name: "Alnilam",        ra: 5.603, dec: -1.202,  mag: 1.69, bv: -0.19 },
  { name: "Alnitak",        ra: 5.679, dec: -1.943,  mag: 1.77, bv: -0.21 },
  { name: "Saiph",          ra: 5.796, dec: -9.670,  mag: 2.06, bv: -0.18 },
  { name: "Meissa",         ra: 5.585, dec: 9.934,   mag: 3.33, bv: -0.19 },

  // ─── Canis Major ─────────────────────────────────────────
  { name: "Sirius",         ra: 6.752, dec: -16.716, mag: -1.46, bv: 0.00 },
  { name: "Adhara",         ra: 6.977, dec: -28.972, mag: 1.50, bv: -0.21 },
  { name: "Wezen",          ra: 7.140, dec: -26.393, mag: 1.84, bv: 0.67 },
  { name: "Mirzam",         ra: 6.378, dec: -17.956, mag: 1.98, bv: -0.24 },
  { name: "Aludra",         ra: 7.402, dec: -29.303, mag: 2.45, bv: -0.08 },
  { name: "Furud",          ra: 6.338, dec: -30.063, mag: 3.02, bv: -0.19 },

  // ─── Canis Minor ─────────────────────────────────────────
  { name: "Procyon",        ra: 7.655, dec: 5.225,   mag: 0.34, bv: 0.42 },
  { name: "Gomeisa",        ra: 7.453, dec: 8.289,   mag: 2.90, bv: -0.09 },

  // ─── Taurus ──────────────────────────────────────────────
  { name: "Aldebaran",      ra: 4.599, dec: 16.509,  mag: 0.85, bv: 1.54 },
  { name: "Elnath",         ra: 5.438, dec: 28.608,  mag: 1.65, bv: -0.13 },
  { name: "Alcyone",        ra: 3.791, dec: 24.105,  mag: 2.87, bv: -0.09 },
  { name: "Atlas",          ra: 3.819, dec: 24.053,  mag: 3.63, bv: -0.07 },
  { name: "Electra",        ra: 3.748, dec: 24.114,  mag: 3.70, bv: -0.11 },
  { name: "Maia",           ra: 3.770, dec: 24.368,  mag: 3.87, bv: -0.07 },
  { name: "Merope",         ra: 3.772, dec: 23.948,  mag: 4.18, bv: -0.06 },
  { name: "Taygeta",        ra: 3.753, dec: 24.467,  mag: 4.30, bv: -0.11 },

  // ─── Gemini ──────────────────────────────────────────────
  { name: "Pollux",         ra: 7.755, dec: 28.026,  mag: 1.14, bv: 1.00 },
  { name: "Castor",         ra: 7.577, dec: 31.888,  mag: 1.58, bv: 0.03 },
  { name: "Alhena",         ra: 6.629, dec: 16.399,  mag: 1.93, bv: 0.00 },
  { name: "Wasat",          ra: 7.335, dec: 21.982,  mag: 3.53, bv: 0.34 },
  { name: "Mebsuta",        ra: 6.732, dec: 25.131,  mag: 3.06, bv: 1.40 },
  { name: "Tejat",          ra: 6.383, dec: 22.514,  mag: 2.88, bv: 1.64 },

  // ─── Ursa Major (Big Dipper) ─────────────────────────────
  { name: "Dubhe",          ra: 11.062, dec: 61.751, mag: 1.79, bv: 1.07 },
  { name: "Merak",          ra: 11.031, dec: 56.382, mag: 2.37, bv: 0.03 },
  { name: "Phecda",         ra: 11.897, dec: 53.695, mag: 2.44, bv: 0.04 },
  { name: "Megrez",         ra: 12.257, dec: 57.033, mag: 3.31, bv: 0.07 },
  { name: "Alioth",         ra: 12.900, dec: 55.960, mag: 1.77, bv: -0.02 },
  { name: "Mizar",          ra: 13.399, dec: 54.925, mag: 2.27, bv: 0.02 },
  { name: "Alkaid",         ra: 13.792, dec: 49.313, mag: 1.86, bv: -0.19 },

  // ─── Ursa Minor ──────────────────────────────────────────
  { name: "Polaris",        ra: 2.530, dec: 89.264,  mag: 1.98, bv: 0.60 },
  { name: "Kochab",         ra: 14.845, dec: 74.156, mag: 2.08, bv: 1.47 },
  { name: "Pherkad",        ra: 15.346, dec: 71.834, mag: 3.05, bv: 0.06 },

  // ─── Lyra ────────────────────────────────────────────────
  { name: "Vega",           ra: 18.616, dec: 38.784, mag: 0.03, bv: 0.00 },
  { name: "Sheliak",        ra: 18.835, dec: 33.363, mag: 3.45, bv: -0.05 },
  { name: "Sulafat",        ra: 18.982, dec: 32.690, mag: 3.24, bv: -0.05 },
  { name: "Epsilon Lyrae",  ra: 18.739, dec: 39.670, mag: 4.67, bv: 0.02 },

  // ─── Cygnus ──────────────────────────────────────────────
  { name: "Deneb",          ra: 20.690, dec: 45.280, mag: 1.25, bv: 0.09 },
  { name: "Sadr",           ra: 20.370, dec: 40.257, mag: 2.20, bv: 0.68 },
  { name: "Albireo",        ra: 19.512, dec: 27.960, mag: 3.08, bv: 0.99 },
  { name: "Gienah Cyg",     ra: 20.770, dec: 33.970, mag: 2.46, bv: -0.03 },
  { name: "Fawaris",        ra: 19.750, dec: 45.131, mag: 2.87, bv: -0.02 },

  // ─── Aquila ──────────────────────────────────────────────
  { name: "Altair",         ra: 19.846, dec: 8.868,  mag: 0.77, bv: 0.22 },
  { name: "Tarazed",        ra: 19.771, dec: 10.613, mag: 2.72, bv: 1.52 },
  { name: "Alshain",        ra: 19.922, dec: 6.407,  mag: 3.71, bv: 0.86 },

  // ─── Scorpius ────────────────────────────────────────────
  { name: "Antares",        ra: 16.490, dec: -26.432, mag: 0.96, bv: 1.83 },
  { name: "Shaula",         ra: 17.560, dec: -37.104, mag: 1.63, bv: -0.22 },
  { name: "Sargas",         ra: 17.622, dec: -42.998, mag: 1.87, bv: 0.40 },
  { name: "Dschubba",       ra: 16.005, dec: -22.622, mag: 2.32, bv: -0.12 },
  { name: "Acrab",          ra: 16.091, dec: -19.806, mag: 2.62, bv: -0.07 },
  { name: "Wei",            ra: 16.836, dec: -34.293, mag: 2.29, bv: 1.15 },
  { name: "Lesath",         ra: 17.544, dec: -37.296, mag: 2.69, bv: -0.22 },
  { name: "Girtab",         ra: 17.708, dec: -39.030, mag: 2.41, bv: -0.18 },

  // ─── Leo ─────────────────────────────────────────────────
  { name: "Regulus",        ra: 10.140, dec: 11.967, mag: 1.35, bv: -0.11 },
  { name: "Denebola",       ra: 11.818, dec: 14.572, mag: 2.14, bv: 0.09 },
  { name: "Algieba",        ra: 10.333, dec: 19.842, mag: 2.28, bv: 1.14 },
  { name: "Zosma",          ra: 11.235, dec: 20.524, mag: 2.56, bv: 0.12 },
  { name: "Chertan",        ra: 11.237, dec: 15.430, mag: 3.34, bv: 0.03 },
  { name: "Ras Elased Aus", ra: 9.764, dec: 23.774,  mag: 2.98, bv: 0.80 },

  // ─── Virgo ───────────────────────────────────────────────
  { name: "Spica",          ra: 13.420, dec: -11.161, mag: 0.97, bv: -0.23 },
  { name: "Porrima",        ra: 12.694, dec: -1.449,  mag: 2.74, bv: 0.36 },
  { name: "Vindemiatrix",   ra: 13.036, dec: 10.959,  mag: 2.83, bv: 0.94 },

  // ─── Bootes ──────────────────────────────────────────────
  { name: "Arcturus",       ra: 14.261, dec: 19.183, mag: -0.05, bv: 1.23 },
  { name: "Izar",           ra: 14.750, dec: 27.074, mag: 2.37, bv: 0.97 },
  { name: "Muphrid",        ra: 13.911, dec: 18.398, mag: 2.68, bv: 0.58 },
  { name: "Nekkar",         ra: 15.032, dec: 40.391, mag: 3.50, bv: 0.95 },
  { name: "Seginus",        ra: 14.535, dec: 38.308, mag: 3.03, bv: 0.19 },

  // ─── Corona Borealis ─────────────────────────────────────
  { name: "Alphecca",       ra: 15.578, dec: 26.715, mag: 2.23, bv: 0.03 },

  // ─── Centaurus ───────────────────────────────────────────
  { name: "Alpha Centauri",  ra: 14.660, dec: -60.835, mag: -0.27, bv: 0.71 },
  { name: "Hadar",           ra: 14.064, dec: -60.373, mag: 0.61, bv: -0.23 },
  { name: "Menkent",         ra: 14.111, dec: -36.370, mag: 2.06, bv: 1.01 },

  // ─── Crux (Southern Cross) ───────────────────────────────
  { name: "Acrux",          ra: 12.443, dec: -63.099, mag: 0.76, bv: -0.24 },
  { name: "Mimosa",         ra: 12.795, dec: -59.689, mag: 1.25, bv: -0.23 },
  { name: "Gacrux",         ra: 12.519, dec: -57.113, mag: 1.63, bv: 1.59 },
  { name: "Imai",           ra: 12.252, dec: -58.749, mag: 2.80, bv: -0.23 },

  // ─── Carina ──────────────────────────────────────────────
  { name: "Canopus",        ra: 6.399, dec: -52.696, mag: -0.74, bv: 0.15 },
  { name: "Avior",          ra: 8.375, dec: -59.510, mag: 1.86, bv: 1.18 },
  { name: "Miaplacidus",    ra: 9.220, dec: -69.717, mag: 1.68, bv: 0.07 },
  { name: "Aspidiske",      ra: 9.285, dec: -59.275, mag: 2.25, bv: 0.18 },

  // ─── Eridanus ────────────────────────────────────────────
  { name: "Achernar",       ra: 1.629, dec: -57.237, mag: 0.46, bv: -0.16 },
  { name: "Cursa",          ra: 5.131, dec: -5.086,  mag: 2.79, bv: 0.17 },
  { name: "Zaurak",         ra: 3.967, dec: -13.509, mag: 2.95, bv: 1.59 },

  // ─── Piscis Austrinus ────────────────────────────────────
  { name: "Fomalhaut",      ra: 22.961, dec: -29.622, mag: 1.16, bv: 0.09 },

  // ─── Pegasus ─────────────────────────────────────────────
  { name: "Enif",           ra: 21.736, dec: 9.875,   mag: 2.39, bv: 1.52 },
  { name: "Markab",         ra: 23.079, dec: 15.205,  mag: 2.49, bv: -0.04 },
  { name: "Scheat",         ra: 23.063, dec: 28.083,  mag: 2.42, bv: 1.67 },
  { name: "Algenib",        ra: 0.220, dec: 15.183,   mag: 2.83, bv: -0.11 },

  // ─── Andromeda ───────────────────────────────────────────
  { name: "Alpheratz",      ra: 0.140, dec: 29.091,   mag: 2.06, bv: -0.11 },
  { name: "Mirach",         ra: 1.163, dec: 35.621,   mag: 2.06, bv: 1.57 },
  { name: "Almach",         ra: 2.065, dec: 42.330,   mag: 2.17, bv: 1.37 },

  // ─── Perseus ─────────────────────────────────────────────
  { name: "Mirfak",         ra: 3.405, dec: 49.861,   mag: 1.79, bv: 0.48 },
  { name: "Algol",          ra: 3.136, dec: 40.957,   mag: 2.12, bv: -0.05 },

  // ─── Auriga ──────────────────────────────────────────────
  { name: "Capella",        ra: 5.278, dec: 45.998,   mag: 0.08, bv: 0.80 },
  { name: "Menkalinan",     ra: 5.992, dec: 44.948,   mag: 1.90, bv: 0.08 },
  { name: "Hassaleh",       ra: 4.950, dec: 33.166,   mag: 2.69, bv: 1.53 },

  // ─── Cassiopeia ──────────────────────────────────────────
  { name: "Schedar",        ra: 0.675, dec: 56.537,   mag: 2.23, bv: 1.17 },
  { name: "Caph",           ra: 0.153, dec: 59.150,   mag: 2.27, bv: 0.34 },
  { name: "Gamma Cas",      ra: 0.945, dec: 60.717,   mag: 2.47, bv: -0.15 },
  { name: "Ruchbah",        ra: 1.430, dec: 60.235,   mag: 2.68, bv: 0.13 },
  { name: "Segin",          ra: 1.907, dec: 63.670,   mag: 3.38, bv: -0.15 },

  // ─── Cepheus ─────────────────────────────────────────────
  { name: "Alderamin",      ra: 21.310, dec: 62.586,  mag: 2.51, bv: 0.22 },
  { name: "Errai",          ra: 23.656, dec: 77.632,  mag: 3.21, bv: 1.03 },
  { name: "Alfirk",         ra: 21.478, dec: 70.561,  mag: 3.23, bv: -0.09 },

  // ─── Draco ───────────────────────────────────────────────
  { name: "Eltanin",        ra: 17.943, dec: 51.489,  mag: 2.23, bv: 1.52 },
  { name: "Rastaban",       ra: 17.507, dec: 52.301,  mag: 2.79, bv: 0.96 },
  { name: "Thuban",         ra: 14.073, dec: 64.376,  mag: 3.65, bv: -0.05 },

  // ─── Sagittarius ─────────────────────────────────────────
  { name: "Kaus Australis",  ra: 18.403, dec: -34.385, mag: 1.85, bv: -0.03 },
  { name: "Nunki",           ra: 18.921, dec: -26.297, mag: 2.02, bv: -0.13 },
  { name: "Ascella",         ra: 19.043, dec: -29.880, mag: 2.59, bv: 0.03 },
  { name: "Kaus Media",      ra: 18.350, dec: -29.828, mag: 2.70, bv: 1.38 },
  { name: "Kaus Borealis",   ra: 18.466, dec: -25.422, mag: 2.81, bv: 0.77 },
  { name: "Alnasi",          ra: 18.097, dec: -30.424, mag: 2.99, bv: 0.99 },

  // ─── Capricornus ─────────────────────────────────────────
  { name: "Deneb Algedi",   ra: 21.784, dec: -16.127, mag: 2.87, bv: 0.08 },
  { name: "Dabih",          ra: 20.350, dec: -14.781, mag: 3.08, bv: 0.79 },

  // ─── Aquarius ────────────────────────────────────────────
  { name: "Sadalsuud",      ra: 21.526, dec: -5.571,  mag: 2.91, bv: 1.04 },
  { name: "Sadalmelik",     ra: 22.096, dec: -0.320,  mag: 2.96, bv: 1.04 },
  { name: "Skat",           ra: 22.911, dec: -15.821, mag: 3.27, bv: 0.05 },

  // ─── Pisces ──────────────────────────────────────────────
  { name: "Eta Piscium",    ra: 1.525, dec: 15.346,   mag: 3.62, bv: 0.97 },

  // ─── Aries ───────────────────────────────────────────────
  { name: "Hamal",          ra: 2.120, dec: 23.462,   mag: 2.00, bv: 1.15 },
  { name: "Sheratan",       ra: 1.911, dec: 20.808,   mag: 2.64, bv: 0.17 },

  // ─── Libra ───────────────────────────────────────────────
  { name: "Zubeneschamali",  ra: 15.283, dec: -9.383, mag: 2.61, bv: -0.11 },
  { name: "Zubenelgenubi",   ra: 14.848, dec: -16.042, mag: 2.75, bv: 0.15 },

  // ─── Ophiuchus ───────────────────────────────────────────
  { name: "Rasalhague",     ra: 17.582, dec: 12.560,  mag: 2.07, bv: 0.15 },
  { name: "Sabik",          ra: 17.173, dec: -15.725, mag: 2.43, bv: 0.06 },
  { name: "Cebalrai",       ra: 17.724, dec: 4.567,   mag: 2.77, bv: 1.17 },
  { name: "Yed Prior",      ra: 16.239, dec: -3.694,  mag: 2.74, bv: 1.59 },

  // ─── Hercules ────────────────────────────────────────────
  { name: "Kornephoros",    ra: 16.504, dec: 21.490,  mag: 2.77, bv: 0.94 },
  { name: "Zeta Herculis",  ra: 16.688, dec: 31.603,  mag: 2.81, bv: 0.65 },
  { name: "Sarin",          ra: 17.251, dec: 24.839,  mag: 3.14, bv: 0.07 },
  { name: "Pi Herculis",    ra: 17.251, dec: 36.809,  mag: 3.16, bv: 1.35 },
  { name: "Rasalgethi",     ra: 17.244, dec: 14.390,  mag: 3.37, bv: 1.44 },

  // ─── Hydra ───────────────────────────────────────────────
  { name: "Alphard",        ra: 9.460, dec: -8.659,   mag: 1.98, bv: 1.44 },

  // ─── Corvus ──────────────────────────────────────────────
  { name: "Gienah",         ra: 12.263, dec: -17.542, mag: 2.59, bv: -0.11 },
  { name: "Kraz",           ra: 12.573, dec: -23.397, mag: 2.65, bv: 0.89 },
  { name: "Algorab",        ra: 12.498, dec: -16.516, mag: 2.95, bv: -0.05 },
  { name: "Minkar",         ra: 12.169, dec: -22.620, mag: 3.00, bv: 1.33 },

  // ─── Cancer ──────────────────────────────────────────────
  { name: "Tarf",           ra: 8.275, dec: 9.186,    mag: 3.52, bv: 1.48 },
  { name: "Acubens",        ra: 8.975, dec: 11.858,   mag: 4.26, bv: 0.14 },

  // ─── Lupus ───────────────────────────────────────────────
  { name: "Men",            ra: 14.699, dec: -47.388, mag: 2.30, bv: -0.20 },
  { name: "Ke Kouan",       ra: 14.976, dec: -43.134, mag: 2.68, bv: -0.22 },

  // ─── Puppis ──────────────────────────────────────────────
  { name: "Naos",           ra: 8.060, dec: -40.003,  mag: 2.25, bv: -0.27 },
  { name: "Tureis",         ra: 8.126, dec: -24.304,  mag: 2.70, bv: 0.05 },

  // ─── Vela ────────────────────────────────────────────────
  { name: "Regor",          ra: 8.159, dec: -47.337,  mag: 1.78, bv: -0.22 },
  { name: "Alsephina",      ra: 8.745, dec: -54.709,  mag: 1.96, bv: 0.04 },
  { name: "Suhail",         ra: 9.133, dec: -43.433,  mag: 2.21, bv: 1.67 },
  { name: "Markeb",         ra: 9.368, dec: -55.011,  mag: 2.50, bv: -0.18 },

  // ─── Pavo ────────────────────────────────────────────────
  { name: "Peacock",        ra: 20.428, dec: -56.735, mag: 1.94, bv: -0.20 },

  // ─── Grus  ───────────────────────────────────────────────
  { name: "Alnair",         ra: 22.137, dec: -46.961, mag: 1.74, bv: -0.07 },
  { name: "Gruid",          ra: 22.712, dec: -46.885, mag: 2.10, bv: 1.62 },

  // ─── Phoenix ─────────────────────────────────────────────
  { name: "Ankaa",          ra: 0.438, dec: -42.306,  mag: 2.38, bv: 1.09 },

  // ─── Triangulum Australe ─────────────────────────────────
  { name: "Atria",          ra: 16.811, dec: -69.028, mag: 1.92, bv: 1.44 },

  // ─── Ara ── ──────────────────────────────────────────────
  { name: "Choo",           ra: 17.531, dec: -49.876, mag: 2.85, bv: -0.17 },

  // ─── Columba ─────────────────────────────────────────────
  { name: "Phact",          ra: 5.661, dec: -34.074,  mag: 2.64, bv: -0.12 },
  { name: "Wazn",           ra: 5.849, dec: -35.768,  mag: 3.12, bv: 1.16 },

  // ─── Monoceros ───────────────────────────────────────────
  { name: "Alpha Mon",      ra: 7.687, dec: -9.551,   mag: 3.94, bv: 1.02 },

  // ─── Lepus ───────────────────────────────────────────────
  { name: "Arneb",          ra: 5.545, dec: -17.822,  mag: 2.58, bv: 0.21 },
  { name: "Nihal",          ra: 5.471, dec: -20.759,  mag: 2.84, bv: 0.81 },

  // ─── Crater ──────────────────────────────────────────────
  { name: "Alkes",          ra: 10.996, dec: -18.299, mag: 4.08, bv: 1.12 },

  // ─── Serpens ─────────────────────────────────────────────
  { name: "Unukalhai",      ra: 15.738, dec: 6.426,   mag: 2.65, bv: 1.17 },

  // ─── Triangulum ──────────────────────────────────────────
  { name: "Mothallah",      ra: 1.885, dec: 29.579,   mag: 3.41, bv: 0.14 },

  // ─── Cetus ───────────────────────────────────────────────
  { name: "Diphda",         ra: 0.726, dec: -17.987,  mag: 2.02, bv: 1.02 },
  { name: "Menkar",         ra: 3.038, dec: 4.090,    mag: 2.53, bv: 1.64 },
  { name: "Mira",           ra: 2.322, dec: -2.978,   mag: 3.04, bv: 1.42 },

  // ─── Tucana ──────────────────────────────────────────────
  { name: "Alpha Tucanae",  ra: 22.309, dec: -60.260, mag: 2.86, bv: 1.39 },

  // ─── Additional bright stars ─────────────────────────────
  { name: "Eta Carinae",    ra: 10.752, dec: -59.684, mag: 1.0, bv: 0.20 },
  { name: "Achenar B",      ra: 1.933, dec: -51.609,  mag: 3.89, bv: 0.04 },
  { name: "Wega",           ra: 18.616, dec: 38.783,  mag: 3.0, bv: 0.00 },  // duplicate filtered below

  // ─── Delphinus ───────────────────────────────────────────
  { name: "Rotanev",        ra: 20.626, dec: 14.595,  mag: 3.63, bv: 0.40 },
  { name: "Sualocin",       ra: 20.660, dec: 15.912,  mag: 3.77, bv: -0.07 },

  // ─── Sagitta ─────────────────────────────────────────────
  { name: "Gamma Sagittae", ra: 19.979, dec: 19.492,  mag: 3.47, bv: 1.57 },

  // ─── Vulpecula ───────────────────────────────────────────
  { name: "Anser",          ra: 19.478, dec: 24.665,  mag: 4.44, bv: 1.50 },

  // ─── Scutum ──────────────────────────────────────────────
  { name: "Ioannina",       ra: 18.587, dec: -8.244,  mag: 3.85, bv: 1.33 },

  // ─── Corona Australis ────────────────────────────────────
  { name: "Meridiana",      ra: 19.167, dec: -37.905, mag: 4.10, bv: 0.04 },
];

// Remove duplicate Wega (Vega already listed)
// Filter ensures clean data
const STAR_CATALOG_CLEAN = STAR_CATALOG.filter((s, i, arr) =>
  arr.findIndex(x => Math.abs(x.ra - s.ra) < 0.01 && Math.abs(x.dec - s.dec) < 0.01) === i
);
