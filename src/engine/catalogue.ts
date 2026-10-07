import type { CrateDefinition } from "./types";

// Transcription exacte du catalogue utilisateur dans DockersSpecs.
export const CATALOGUE: CrateDefinition[] = [
  {
    "id": 1,
    "name": "Boston",
    "faces": [
      null,
      "bleu",
      "jaune",
      "jaune",
      "vert",
      "bleu"
    ]
  },
  {
    "id": 2,
    "name": "Veracruz",
    "faces": [
      null,
      "jaune",
      "rouge",
      "bleu",
      "bleu",
      "rouge"
    ]
  },
  {
    "id": 3,
    "name": "Panama",
    "faces": [
      null,
      "rouge",
      "jaune",
      "vert",
      "vert",
      "jaune"
    ]
  },
  {
    "id": 4,
    "name": "La Habana",
    "faces": [
      null,
      "vert",
      "rouge",
      "rouge",
      "bleu",
      "vert"
    ]
  },
  {
    "id": 5,
    "name": "Bahia",
    "faces": [
      null,
      "vert",
      "jaune",
      "bleu",
      "rouge",
      null
    ]
  },
  {
    "id": 6,
    "name": "Valpariso",
    "faces": [
      null,
      "jaune",
      "vert",
      "bleu",
      "jaune",
      "bleu"
    ]
  },
  {
    "id": 7,
    "name": "Seatle",
    "faces": [
      null,
      "bleu",
      "bleu",
      "jaune",
      "rouge",
      "rouge"
    ]
  },
  {
    "id": 8,
    "name": "Vancouver",
    "faces": [
      null,
      "vert",
      "vert",
      "rouge",
      "jaune",
      "jaune"
    ]
  },
  {
    "id": 9,
    "name": "Yokohama",
    "faces": [
      null,
      "rouge",
      "bleu",
      "vert",
      "rouge",
      "vert"
    ]
  },
  {
    "id": 10,
    "name": "Vladivostok",
    "faces": [
      null,
      "vert",
      "rouge",
      "rouge",
      "jaune",
      "vert"
    ]
  },
  {
    "id": 11,
    "name": "Shanghai",
    "faces": [
      null,
      "rouge",
      "bleu",
      "vert",
      "vert",
      "bleu"
    ]
  },
  {
    "id": 12,
    "name": "Sydney",
    "faces": [
      null,
      "bleu",
      "rouge",
      "jaune",
      "jaune",
      "rouge"
    ]
  },
  {
    "id": 13,
    "name": "Hong-Kong",
    "faces": [
      null,
      "jaune",
      "bleu",
      "bleu",
      "vert",
      "jaune"
    ]
  },
  {
    "id": 14,
    "name": "Singapour",
    "faces": [
      null,
      "bleu",
      "vert",
      "rouge",
      "jaune",
      null
    ]
  },
  {
    "id": 15,
    "name": "Rangoon",
    "faces": [
      null,
      "rouge",
      "jaune",
      "vert",
      "rouge",
      "vert"
    ]
  },
  {
    "id": 16,
    "name": "Calcutta",
    "faces": [
      null,
      "vert",
      "vert",
      "rouge",
      "bleu",
      "bleu"
    ]
  },
  {
    "id": 17,
    "name": "Bombay",
    "faces": [
      null,
      "jaune",
      "jaune",
      "bleu",
      "rouge",
      "rouge"
    ]
  },
  {
    "id": 18,
    "name": "Karachi",
    "faces": [
      null,
      "bleu",
      "vert",
      "jaune",
      "bleu",
      "jaune"
    ]
  },
  {
    "id": 19,
    "name": "Zanzibar",
    "faces": [
      null,
      "rouge",
      "vert",
      "vert",
      "bleu",
      "rouge"
    ]
  },
  {
    "id": 20,
    "name": "Durban",
    "faces": [
      null,
      "vert",
      "jaune",
      "rouge",
      "rouge",
      "jaune"
    ]
  },
  {
    "id": 21,
    "name": "Lagos",
    "faces": [
      null,
      "jaune",
      "vert",
      "bleu",
      "bleu",
      "vert"
    ]
  },
  {
    "id": 22,
    "name": "Dakar",
    "faces": [
      null,
      "bleu",
      "jaune",
      "jaune",
      "rouge",
      "bleu"
    ]
  },
  {
    "id": 23,
    "name": "Tanger",
    "faces": [
      null,
      "jaune",
      "bleu",
      "vert",
      "rouge",
      null
    ]
  },
  {
    "id": 24,
    "name": "Odessa",
    "faces": [
      null,
      "vert",
      "bleu",
      "rouge",
      "vert",
      "rouge"
    ]
  },
  {
    "id": 25,
    "name": "Genova",
    "faces": [
      null,
      "rouge",
      "rouge",
      "vert",
      "jaune",
      "jaune"
    ]
  },
  {
    "id": 26,
    "name": "Le Havre",
    "faces": [
      null,
      "bleu",
      "bleu",
      "jaune",
      "vert",
      "vert"
    ]
  },
  {
    "id": 27,
    "name": "Rotterdam",
    "faces": [
      null,
      "jaune",
      "rouge",
      "bleu",
      "jaune",
      "bleu"
    ]
  }
];
export const definition = (id: number) => { const entry = CATALOGUE.find(c => c.id === id); if (!entry) throw new Error("Caisse inconnue."); return entry; };
