export interface ChapterWeight {
  chapterId: number;
  frequencyScore: number; // 1-10 (Frequência no Plantão)
  importanceScore: number; // 1-10 (Importância Médica)
  category: string;
}

export const DEFAULT_CHAPTER_WEIGHTS: ChapterWeight[] = [
  {
    "chapterId": 1,
    "frequencyScore": 7,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 2,
    "frequencyScore": 6,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 3,
    "frequencyScore": 5,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 4,
    "frequencyScore": 5,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 5,
    "frequencyScore": 2,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 6,
    "frequencyScore": 8,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 7,
    "frequencyScore": 7,
    "importanceScore": 9,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 8,
    "frequencyScore": 7,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 9,
    "frequencyScore": 8,
    "importanceScore": 10,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 10,
    "frequencyScore": 7,
    "importanceScore": 9,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 11,
    "frequencyScore": 2,
    "importanceScore": 6,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 12,
    "frequencyScore": 6,
    "importanceScore": 9,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 13,
    "frequencyScore": 7,
    "importanceScore": 7,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 14,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 15,
    "frequencyScore": 6,
    "importanceScore": 7,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 16,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Abordagem Inicial do Paciente Grave"
  },
  {
    "chapterId": 17,
    "frequencyScore": 9,
    "importanceScore": 7,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 18,
    "frequencyScore": 2,
    "importanceScore": 8,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 19,
    "frequencyScore": 9,
    "importanceScore": 9,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 20,
    "frequencyScore": 10,
    "importanceScore": 9,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 21,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 22,
    "frequencyScore": 10,
    "importanceScore": 6,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 23,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 24,
    "frequencyScore": 9,
    "importanceScore": 6,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 25,
    "frequencyScore": 4,
    "importanceScore": 7,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 26,
    "frequencyScore": 10,
    "importanceScore": 8,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 27,
    "frequencyScore": 9,
    "importanceScore": 7,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 28,
    "frequencyScore": 4,
    "importanceScore": 6,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 29,
    "frequencyScore": 9,
    "importanceScore": 5,
    "category": "Sinais e Sintomas"
  },
  {
    "chapterId": 30,
    "frequencyScore": 8,
    "importanceScore": 10,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 31,
    "frequencyScore": 7,
    "importanceScore": 10,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 32,
    "frequencyScore": 8,
    "importanceScore": 8,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 33,
    "frequencyScore": 7,
    "importanceScore": 9,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 34,
    "frequencyScore": 6,
    "importanceScore": 9,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 35,
    "frequencyScore": 8,
    "importanceScore": 9,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 36,
    "frequencyScore": 9,
    "importanceScore": 8,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 37,
    "frequencyScore": 2,
    "importanceScore": 10,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 38,
    "frequencyScore": 3,
    "importanceScore": 9,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 39,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 40,
    "frequencyScore": 5,
    "importanceScore": 7,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 41,
    "frequencyScore": 3,
    "importanceScore": 9,
    "category": "Cardiovascular"
  },
  {
    "chapterId": 42,
    "frequencyScore": 8,
    "importanceScore": 8,
    "category": "Respiratória"
  },
  {
    "chapterId": 43,
    "frequencyScore": 8,
    "importanceScore": 8,
    "category": "Respiratória"
  },
  {
    "chapterId": 44,
    "frequencyScore": 9,
    "importanceScore": 8,
    "category": "Respiratória"
  },
  {
    "chapterId": 45,
    "frequencyScore": 5,
    "importanceScore": 7,
    "category": "Respiratória"
  },
  {
    "chapterId": 46,
    "frequencyScore": 4,
    "importanceScore": 10,
    "category": "Respiratória"
  },
  {
    "chapterId": 47,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Respiratória"
  },
  {
    "chapterId": 48,
    "frequencyScore": 10,
    "importanceScore": 4,
    "category": "Infecciosa"
  },
  {
    "chapterId": 49,
    "frequencyScore": 4,
    "importanceScore": 8,
    "category": "Infecciosa"
  },
  {
    "chapterId": 50,
    "frequencyScore": 10,
    "importanceScore": 6,
    "category": "Infecciosa"
  },
  {
    "chapterId": 51,
    "frequencyScore": 8,
    "importanceScore": 7,
    "category": "Infecciosa"
  },
  {
    "chapterId": 52,
    "frequencyScore": 3,
    "importanceScore": 9,
    "category": "Infecciosa"
  },
  {
    "chapterId": 53,
    "frequencyScore": 8,
    "importanceScore": 6,
    "category": "Infecciosa"
  },
  {
    "chapterId": 54,
    "frequencyScore": 8,
    "importanceScore": 10,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 55,
    "frequencyScore": 3,
    "importanceScore": 10,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 56,
    "frequencyScore": 5,
    "importanceScore": 10,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 57,
    "frequencyScore": 3,
    "importanceScore": 9,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 58,
    "frequencyScore": 1,
    "importanceScore": 8,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 59,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 60,
    "frequencyScore": 8,
    "importanceScore": 6,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 61,
    "frequencyScore": 7,
    "importanceScore": 7,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 62,
    "frequencyScore": 4,
    "importanceScore": 9,
    "category": "Neuropsiquiatria"
  },
  {
    "chapterId": 63,
    "frequencyScore": 7,
    "importanceScore": 10,
    "category": "Trauma"
  },
  {
    "chapterId": 64,
    "frequencyScore": 8,
    "importanceScore": 9,
    "category": "Trauma"
  },
  {
    "chapterId": 65,
    "frequencyScore": 5,
    "importanceScore": 9,
    "category": "Trauma"
  },
  {
    "chapterId": 66,
    "frequencyScore": 6,
    "importanceScore": 9,
    "category": "Trauma"
  },
  {
    "chapterId": 67,
    "frequencyScore": 6,
    "importanceScore": 9,
    "category": "Trauma"
  },
  {
    "chapterId": 68,
    "frequencyScore": 5,
    "importanceScore": 10,
    "category": "Trauma"
  },
  {
    "chapterId": 69,
    "frequencyScore": 5,
    "importanceScore": 8,
    "category": "Trauma"
  },
  {
    "chapterId": 70,
    "frequencyScore": 4,
    "importanceScore": 8,
    "category": "Trauma"
  },
  {
    "chapterId": 71,
    "frequencyScore": 4,
    "importanceScore": 8,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 72,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 73,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 74,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 75,
    "frequencyScore": 7,
    "importanceScore": 9,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 76,
    "frequencyScore": 5,
    "importanceScore": 7,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 77,
    "frequencyScore": 6,
    "importanceScore": 8,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 78,
    "frequencyScore": 7,
    "importanceScore": 7,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 79,
    "frequencyScore": 8,
    "importanceScore": 9,
    "category": "Gastroenterologia & Hepatologia"
  },
  {
    "chapterId": 80,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 81,
    "frequencyScore": 4,
    "importanceScore": 9,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 82,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 83,
    "frequencyScore": 6,
    "importanceScore": 7,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 84,
    "frequencyScore": 4,
    "importanceScore": 7,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 85,
    "frequencyScore": 6,
    "importanceScore": 7,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 86,
    "frequencyScore": 7,
    "importanceScore": 9,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 87,
    "frequencyScore": 3,
    "importanceScore": 6,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 88,
    "frequencyScore": 3,
    "importanceScore": 7,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 89,
    "frequencyScore": 9,
    "importanceScore": 6,
    "category": "Nefrologia & Urologia"
  },
  {
    "chapterId": 90,
    "frequencyScore": 8,
    "importanceScore": 9,
    "category": "Metabólica"
  },
  {
    "chapterId": 91,
    "frequencyScore": 9,
    "importanceScore": 8,
    "category": "Metabólica"
  },
  {
    "chapterId": 92,
    "frequencyScore": 1,
    "importanceScore": 9,
    "category": "Metabólica"
  },
  {
    "chapterId": 93,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Metabólica"
  },
  {
    "chapterId": 94,
    "frequencyScore": 4,
    "importanceScore": 8,
    "category": "Hematologia & Oncologia"
  },
  {
    "chapterId": 95,
    "frequencyScore": 4,
    "importanceScore": 8,
    "category": "Hematologia & Oncologia"
  },
  {
    "chapterId": 96,
    "frequencyScore": 3,
    "importanceScore": 9,
    "category": "Hematologia & Oncologia"
  },
  {
    "chapterId": 97,
    "frequencyScore": 6,
    "importanceScore": 8,
    "category": "Hematologia & Oncologia"
  },
  {
    "chapterId": 98,
    "frequencyScore": 4,
    "importanceScore": 7,
    "category": "Hematologia & Oncologia"
  },
  {
    "chapterId": 99,
    "frequencyScore": 4,
    "importanceScore": 9,
    "category": "Hematologia & Oncologia"
  },
  {
    "chapterId": 100,
    "frequencyScore": 4,
    "importanceScore": 8,
    "category": "Hematologia & Oncologia"
  },
  {
    "chapterId": 101,
    "frequencyScore": 5,
    "importanceScore": 7,
    "category": "Reumatologia"
  },
  {
    "chapterId": 102,
    "frequencyScore": 6,
    "importanceScore": 8,
    "category": "Causas Externas & Toxicologia"
  },
  {
    "chapterId": 103,
    "frequencyScore": 7,
    "importanceScore": 7,
    "category": "Causas Externas & Toxicologia"
  },
  {
    "chapterId": 104,
    "frequencyScore": 6,
    "importanceScore": 8,
    "category": "Causas Externas & Toxicologia"
  },
  {
    "chapterId": 105,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Causas Externas & Toxicologia"
  },
  {
    "chapterId": 106,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Causas Externas & Toxicologia"
  },
  {
    "chapterId": 107,
    "frequencyScore": 6,
    "importanceScore": 8,
    "category": "Causas Externas & Toxicologia"
  },
  {
    "chapterId": 108,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Causas Externas & Toxicologia"
  },
  {
    "chapterId": 109,
    "frequencyScore": 6,
    "importanceScore": 4,
    "category": "Dermatologia"
  },
  {
    "chapterId": 110,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Dermatologia"
  },
  {
    "chapterId": 111,
    "frequencyScore": 6,
    "importanceScore": 5,
    "category": "Oftalmo & Otorrino"
  },
  {
    "chapterId": 112,
    "frequencyScore": 7,
    "importanceScore": 5,
    "category": "Oftalmo & Otorrino"
  },
  {
    "chapterId": 113,
    "frequencyScore": 3,
    "importanceScore": 6,
    "category": "Saúde LGBTQIA+"
  },
  {
    "chapterId": 114,
    "frequencyScore": 7,
    "importanceScore": 7,
    "category": "Ginecologia & Obstetrícia"
  },
  {
    "chapterId": 115,
    "frequencyScore": 6,
    "importanceScore": 9,
    "category": "Ginecologia & Obstetrícia"
  },
  {
    "chapterId": 116,
    "frequencyScore": 6,
    "importanceScore": 8,
    "category": "Cuidados Paliativos"
  },
  {
    "chapterId": 117,
    "frequencyScore": 8,
    "importanceScore": 8,
    "category": "POCUS & Procedimentos"
  },
  {
    "chapterId": 118,
    "frequencyScore": 8,
    "importanceScore": 9,
    "category": "POCUS & Procedimentos"
  },
  {
    "chapterId": 119,
    "frequencyScore": 7,
    "importanceScore": 9,
    "category": "POCUS & Procedimentos"
  },
  {
    "chapterId": 120,
    "frequencyScore": 3,
    "importanceScore": 9,
    "category": "POCUS & Procedimentos"
  },
  {
    "chapterId": 121,
    "frequencyScore": 9,
    "importanceScore": 8,
    "category": "POCUS & Procedimentos"
  },
  {
    "chapterId": 122,
    "frequencyScore": 5,
    "importanceScore": 9,
    "category": "POCUS & Procedimentos"
  },
  {
    "chapterId": 123,
    "frequencyScore": 5,
    "importanceScore": 10,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 124,
    "frequencyScore": 8,
    "importanceScore": 7,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 125,
    "frequencyScore": 9,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 126,
    "frequencyScore": 4,
    "importanceScore": 6,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 127,
    "frequencyScore": 4,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 128,
    "frequencyScore": 2,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 129,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 130,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 131,
    "frequencyScore": 8,
    "importanceScore": 7,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 132,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 133,
    "frequencyScore": 6,
    "importanceScore": 6,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 134,
    "frequencyScore": 4,
    "importanceScore": 6,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 135,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 136,
    "frequencyScore": 1,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 137,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 138,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 139,
    "frequencyScore": 4,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 140,
    "frequencyScore": 6,
    "importanceScore": 10,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 141,
    "frequencyScore": 3,
    "importanceScore": 10,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 142,
    "frequencyScore": 3,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 143,
    "frequencyScore": 7,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 144,
    "frequencyScore": 6,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 145,
    "frequencyScore": 2,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 146,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 147,
    "frequencyScore": 2,
    "importanceScore": 7,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 148,
    "frequencyScore": 5,
    "importanceScore": 9,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 149,
    "frequencyScore": 3,
    "importanceScore": 8,
    "category": "Conteúdo Complementar"
  },
  {
    "chapterId": 150,
    "frequencyScore": 4,
    "importanceScore": 7,
    "category": "Conteúdo Complementar"
  }
];

export function getChapterWeight(chapterId: number): ChapterWeight {
  return (
    DEFAULT_CHAPTER_WEIGHTS.find((w) => w.chapterId === chapterId) || {
      chapterId,
      frequencyScore: 5.0,
      importanceScore: 5.0,
      category: 'Geral',
    }
  );
}
