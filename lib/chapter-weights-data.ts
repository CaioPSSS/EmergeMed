export interface ChapterWeight {
  chapterId: number;
  frequencyScore: number; // 1-10 (Frequência no Plantão)
  importanceScore: number; // 1-10 (Importância Médica)
  category: string;
}

export const DEFAULT_CHAPTER_WEIGHTS: ChapterWeight[] = [
  // SEÇÃO I - ABORDAGEM INICIAL DO PACIENTE GRAVE
  { chapterId: 1, frequencyScore: 7, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 2, frequencyScore: 6, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 3, frequencyScore: 5, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 4, frequencyScore: 5, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 5, frequencyScore: 2, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 6, frequencyScore: 8, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 7, frequencyScore: 7, importanceScore: 9, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 8, frequencyScore: 7, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 9, frequencyScore: 8, importanceScore: 10, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 10, frequencyScore: 7, importanceScore: 9, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 11, frequencyScore: 6, importanceScore: 9, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 12, frequencyScore: 7, importanceScore: 7, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 13, frequencyScore: 7, importanceScore: 8, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 14, frequencyScore: 6, importanceScore: 7, category: 'Abordagem Inicial do Paciente Grave' },
  { chapterId: 15, frequencyScore: 7, importanceScore: 8, category: 'Abordagem Inicial do Paciente Grave' },

  // SEÇÃO II - SINAIS E SINTOMAS NO DEPARTAMENTO DE EMERGÊNCIA
  { chapterId: 16, frequencyScore: 9, importanceScore: 7, category: 'Sinais e Sintomas' },
  { chapterId: 17, frequencyScore: 2, importanceScore: 8, category: 'Sinais e Sintomas' },
  { chapterId: 18, frequencyScore: 9, importanceScore: 9, category: 'Sinais e Sintomas' },
  { chapterId: 19, frequencyScore: 10, importanceScore: 9, category: 'Sinais e Sintomas' },
  { chapterId: 20, frequencyScore: 7, importanceScore: 8, category: 'Sinais e Sintomas' },
  { chapterId: 21, frequencyScore: 10, importanceScore: 6, category: 'Sinais e Sintomas' },
  { chapterId: 22, frequencyScore: 3, importanceScore: 8, category: 'Sinais e Sintomas' },
  { chapterId: 23, frequencyScore: 9, importanceScore: 6, category: 'Sinais e Sintomas' },
  { chapterId: 24, frequencyScore: 4, importanceScore: 7, category: 'Sinais e Sintomas' },
  { chapterId: 25, frequencyScore: 10, importanceScore: 8, category: 'Sinais e Sintomas' },
  { chapterId: 26, frequencyScore: 9, importanceScore: 7, category: 'Sinais e Sintomas' },
  { chapterId: 27, frequencyScore: 4, importanceScore: 6, category: 'Sinais e Sintomas' },
  { chapterId: 28, frequencyScore: 9, importanceScore: 5, category: 'Sinais e Sintomas' },

  // SEÇÃO III - EMERGÊNCIAS CARDIOVASCULARES
  { chapterId: 29, frequencyScore: 8, importanceScore: 10, category: 'Cardiovascular' },
  { chapterId: 30, frequencyScore: 7, importanceScore: 10, category: 'Cardiovascular' },
  { chapterId: 31, frequencyScore: 8, importanceScore: 8, category: 'Cardiovascular' },
  { chapterId: 32, frequencyScore: 7, importanceScore: 9, category: 'Cardiovascular' },
  { chapterId: 33, frequencyScore: 6, importanceScore: 9, category: 'Cardiovascular' },
  { chapterId: 34, frequencyScore: 8, importanceScore: 9, category: 'Cardiovascular' },
  { chapterId: 35, frequencyScore: 9, importanceScore: 8, category: 'Cardiovascular' },
  { chapterId: 36, frequencyScore: 2, importanceScore: 10, category: 'Cardiovascular' },
  { chapterId: 37, frequencyScore: 3, importanceScore: 9, category: 'Cardiovascular' },
  { chapterId: 38, frequencyScore: 2, importanceScore: 9, category: 'Cardiovascular' },
  { chapterId: 39, frequencyScore: 5, importanceScore: 7, category: 'Cardiovascular' },
  { chapterId: 40, frequencyScore: 3, importanceScore: 9, category: 'Cardiovascular' },

  // SEÇÃO IV - EMERGÊNCIAS RESPIRATÓRIAS
  { chapterId: 41, frequencyScore: 8, importanceScore: 8, category: 'Respiratória' },
  { chapterId: 42, frequencyScore: 8, importanceScore: 8, category: 'Respiratória' },
  { chapterId: 43, frequencyScore: 9, importanceScore: 8, category: 'Respiratória' },
  { chapterId: 44, frequencyScore: 5, importanceScore: 7, category: 'Respiratória' },
  { chapterId: 45, frequencyScore: 4, importanceScore: 10, category: 'Respiratória' },
  { chapterId: 46, frequencyScore: 3, importanceScore: 8, category: 'Respiratória' },

  // SEÇÃO V - EMERGÊNCIAS INFECCIOSAS
  { chapterId: 47, frequencyScore: 10, importanceScore: 4, category: 'Infecciosa' },
  { chapterId: 48, frequencyScore: 4, importanceScore: 8, category: 'Infecciosa' },
  { chapterId: 49, frequencyScore: 10, importanceScore: 6, category: 'Infecciosa' },
  { chapterId: 50, frequencyScore: 8, importanceScore: 7, category: 'Infecciosa' },
  { chapterId: 51, frequencyScore: 3, importanceScore: 9, category: 'Infecciosa' },
  { chapterId: 52, frequencyScore: 8, importanceScore: 6, category: 'Infecciosa' },

  // SEÇÃO VI - EMERGÊNCIAS NEUROPSIQUIÁTRICAS
  { chapterId: 53, frequencyScore: 8, importanceScore: 10, category: 'Neuropsiquiatria' },
  { chapterId: 54, frequencyScore: 3, importanceScore: 10, category: 'Neuropsiquiatria' },
  { chapterId: 55, frequencyScore: 5, importanceScore: 10, category: 'Neuropsiquiatria' },
  { chapterId: 56, frequencyScore: 3, importanceScore: 9, category: 'Neuropsiquiatria' },
  { chapterId: 57, frequencyScore: 1, importanceScore: 8, category: 'Neuropsiquiatria' },
  { chapterId: 58, frequencyScore: 7, importanceScore: 8, category: 'Neuropsiquiatria' },
  { chapterId: 59, frequencyScore: 8, importanceScore: 6, category: 'Neuropsiquiatria' },
  { chapterId: 60, frequencyScore: 7, importanceScore: 7, category: 'Neuropsiquiatria' },
  { chapterId: 61, frequencyScore: 4, importanceScore: 9, category: 'Neuropsiquiatria' },

  // SEÇÃO VII - EMERGÊNCIAS RELACIONADAS AO TRAUMA
  { chapterId: 62, frequencyScore: 7, importanceScore: 10, category: 'Trauma' },
  { chapterId: 63, frequencyScore: 8, importanceScore: 9, category: 'Trauma' },
  { chapterId: 64, frequencyScore: 5, importanceScore: 9, category: 'Trauma' },
  { chapterId: 65, frequencyScore: 6, importanceScore: 9, category: 'Trauma' },
  { chapterId: 66, frequencyScore: 6, importanceScore: 9, category: 'Trauma' },
  { chapterId: 67, frequencyScore: 5, importanceScore: 10, category: 'Trauma' },
  { chapterId: 68, frequencyScore: 5, importanceScore: 8, category: 'Trauma' },
  { chapterId: 69, frequencyScore: 4, importanceScore: 8, category: 'Trauma' },

  // SEÇÃO VIII - EMERGÊNCIAS HEPÁTICAS E GASTROINTESTINAIS
  { chapterId: 70, frequencyScore: 4, importanceScore: 8, category: 'Gastroenterologia & Hepatologia' },
  { chapterId: 71, frequencyScore: 3, importanceScore: 8, category: 'Gastroenterologia & Hepatologia' },
  { chapterId: 72, frequencyScore: 2, importanceScore: 9, category: 'Gastroenterologia & Hepatologia' },
  { chapterId: 73, frequencyScore: 2, importanceScore: 9, category: 'Gastroenterologia & Hepatologia' },
  { chapterId: 74, frequencyScore: 7, importanceScore: 9, category: 'Gastroenterologia & Hepatologia' },
  { chapterId: 75, frequencyScore: 5, importanceScore: 7, category: 'Gastroenterologia & Hepatologia' },
  { chapterId: 76, frequencyScore: 6, importanceScore: 8, category: 'Gastroenterologia & Hepatologia' },
  { chapterId: 77, frequencyScore: 7, importanceScore: 7, category: 'Gastroenterologia & Hepatologia' },

  // SEÇÃO IX - EMERGÊNCIAS NEFROLÓGICAS E UROLÓGICAS
  { chapterId: 78, frequencyScore: 7, importanceScore: 8, category: 'Nefrologia & Urologia' },
  { chapterId: 79, frequencyScore: 4, importanceScore: 9, category: 'Nefrologia & Urologia' },
  { chapterId: 80, frequencyScore: 7, importanceScore: 8, category: 'Nefrologia & Urologia' },
  { chapterId: 81, frequencyScore: 6, importanceScore: 7, category: 'Nefrologia & Urologia' },
  { chapterId: 82, frequencyScore: 4, importanceScore: 7, category: 'Nefrologia & Urologia' },
  { chapterId: 83, frequencyScore: 6, importanceScore: 7, category: 'Nefrologia & Urologia' },
  { chapterId: 84, frequencyScore: 7, importanceScore: 9, category: 'Nefrologia & Urologia' },
  { chapterId: 85, frequencyScore: 3, importanceScore: 6, category: 'Nefrologia & Urologia' },
  { chapterId: 86, frequencyScore: 3, importanceScore: 7, category: 'Nefrologia & Urologia' },
  { chapterId: 87, frequencyScore: 9, importanceScore: 6, category: 'Nefrologia & Urologia' },

  // SEÇÃO X - EMERGÊNCIAS METABÓLICAS
  { chapterId: 88, frequencyScore: 8, importanceScore: 9, category: 'Metabólica' },
  { chapterId: 89, frequencyScore: 8, importanceScore: 8, category: 'Metabólica' },
  { chapterId: 90, frequencyScore: 1, importanceScore: 9, category: 'Metabólica' },
  { chapterId: 91, frequencyScore: 2, importanceScore: 9, category: 'Metabólica' },

  // SEÇÃO XI - EMERGÊNCIAS HEMATOLÓGICAS E ONCOLÓGICAS
  { chapterId: 92, frequencyScore: 4, importanceScore: 8, category: 'Hematologia & Oncologia' },
  { chapterId: 93, frequencyScore: 4, importanceScore: 8, category: 'Hematologia & Oncologia' },
  { chapterId: 94, frequencyScore: 3, importanceScore: 9, category: 'Hematologia & Oncologia' },
  { chapterId: 95, frequencyScore: 6, importanceScore: 8, category: 'Hematologia & Oncologia' },
  { chapterId: 96, frequencyScore: 4, importanceScore: 7, category: 'Hematologia & Oncologia' },
  { chapterId: 97, frequencyScore: 4, importanceScore: 8, category: 'Hematologia & Oncologia' },

  // SEÇÃO XII - EMERGÊNCIAS REUMATOLÓGICAS
  { chapterId: 98, frequencyScore: 5, importanceScore: 7, category: 'Reumatologia' },

  // SEÇÃO XIII - CAUSAS EXTERNAS
  { chapterId: 99, frequencyScore: 6, importanceScore: 8, category: 'Causas Externas & Toxicologia' },
  { chapterId: 100, frequencyScore: 7, importanceScore: 7, category: 'Causas Externas & Toxicologia' },
  { chapterId: 101, frequencyScore: 6, importanceScore: 8, category: 'Causas Externas & Toxicologia' },
  { chapterId: 102, frequencyScore: 3, importanceScore: 8, category: 'Causas Externas & Toxicologia' },
  { chapterId: 103, frequencyScore: 2, importanceScore: 9, category: 'Causas Externas & Toxicologia' },
  { chapterId: 104, frequencyScore: 6, importanceScore: 8, category: 'Causas Externas & Toxicologia' },
  { chapterId: 105, frequencyScore: 7, importanceScore: 8, category: 'Causas Externas & Toxicologia' },

  // SEÇÃO XIV - EMERGÊNCIAS DERMATOLÓGICAS
  { chapterId: 106, frequencyScore: 6, importanceScore: 4, category: 'Dermatologia' },
  { chapterId: 107, frequencyScore: 3, importanceScore: 8, category: 'Dermatologia' },

  // SEÇÃO XV - EMERGÊNCIAS OFTALMOLÓGICAS E OTORRINOLARINGOLÓGICAS
  { chapterId: 108, frequencyScore: 6, importanceScore: 5, category: 'Oftalmo & Otorrino' },
  { chapterId: 109, frequencyScore: 7, importanceScore: 5, category: 'Oftalmo & Otorrino' },

  // SEÇÃO XVI - EMERGÊNCIAS EM LGBTQIA+
  { chapterId: 110, frequencyScore: 3, importanceScore: 6, category: 'Saúde LGBTQIA+' },

  // SEÇÃO XVII - EMERGÊNCIAS GINECOLÓGICAS E OBSTÉTRICAS
  { chapterId: 111, frequencyScore: 7, importanceScore: 7, category: 'Ginecologia & Obstetrícia' },
  { chapterId: 112, frequencyScore: 6, importanceScore: 9, category: 'Ginecologia & Obstetrícia' },

  // SEÇÃO XVIII - CUIDADOS PALIATIVOS NO DEPARTAMENTO DE EMERGÊNCIA
  { chapterId: 113, frequencyScore: 6, importanceScore: 8, category: 'Cuidados Paliativos' },

  // SEÇÃO XIX - ULTRASSONOGRAFIA À BEIRA DO LEITO
  { chapterId: 114, frequencyScore: 8, importanceScore: 8, category: 'POCUS & Procedimentos' },
  { chapterId: 115, frequencyScore: 8, importanceScore: 9, category: 'POCUS & Procedimentos' },
  { chapterId: 116, frequencyScore: 7, importanceScore: 9, category: 'POCUS & Procedimentos' },

  // SEÇÃO XX - PROCEDIMENTOS
  { chapterId: 117, frequencyScore: 3, importanceScore: 9, category: 'POCUS & Procedimentos' },
  { chapterId: 118, frequencyScore: 9, importanceScore: 8, category: 'POCUS & Procedimentos' },
  { chapterId: 119, frequencyScore: 5, importanceScore: 9, category: 'POCUS & Procedimentos' },
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
