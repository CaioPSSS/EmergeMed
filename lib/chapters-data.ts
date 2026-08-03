export interface Chapter {
  id: number;
  number: number;
  title: string;
  sectionNumber: number;
  sectionTitle: string;
  startPage?: number;
  endPage?: number;
}

export interface Section {
  number: number;
  title: string;
  chapters: Chapter[];
}

export const CHAPTERS_DATA: Chapter[] = [
  {
    "id": 1,
    "number": 1,
    "title": "O paciente grave no departamento de emergência",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 115,
    "endPage": 129
  },
  {
    "id": 2,
    "number": 2,
    "title": "Manejo da via aérea na emergência",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 130,
    "endPage": 155
  },
  {
    "id": 3,
    "number": 3,
    "title": "Suporte Básico de Vida (BLS)",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 156,
    "endPage": 170
  },
  {
    "id": 4,
    "number": 4,
    "title": "Suporte Avançado de Vida",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 171,
    "endPage": 192
  },
  {
    "id": 5,
    "number": 5,
    "title": "Parada cardiorrespiratória na criança",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 193,
    "endPage": 207
  },
  {
    "id": 6,
    "number": 6,
    "title": "Insuficiência respiratória aguda",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 208,
    "endPage": 228
  },
  {
    "id": 7,
    "number": 7,
    "title": "Ventilação mecânica na emergência",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 229,
    "endPage": 253
  },
  {
    "id": 8,
    "number": 8,
    "title": "Choque",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 254,
    "endPage": 279
  },
  {
    "id": 9,
    "number": 9,
    "title": "Sepse",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 280,
    "endPage": 298
  },
  {
    "id": 10,
    "number": 10,
    "title": "Coma e alteração do nível de consciência",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 299,
    "endPage": 321
  },
  {
    "id": 11,
    "number": 11,
    "title": "Anafilaxia e outras alergias",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 322,
    "endPage": 339
  },
  {
    "id": 12,
    "number": 12,
    "title": "Delirium",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 340,
    "endPage": 349
  },
  {
    "id": 13,
    "number": 13,
    "title": "Sedação e analgesia em procedimentos não eletivos",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 350,
    "endPage": 365
  },
  {
    "id": 14,
    "number": 14,
    "title": "Dor e anestesia regional",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 366,
    "endPage": 391
  },
  {
    "id": 15,
    "number": 15,
    "title": "Agitação psicomotora",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 392,
    "endPage": 398
  },
  {
    "id": 16,
    "number": 16,
    "title": "Febre e síndromes hipertérmicas no paciente adulto",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 399,
    "endPage": 413
  },
  {
    "id": 17,
    "number": 17,
    "title": "Hipotermia acidental",
    "sectionNumber": 1,
    "sectionTitle": "Abordagem Inicial do Paciente Grave",
    "startPage": 414,
    "endPage": 428
  },
  {
    "id": 18,
    "number": 18,
    "title": "Abordagem inicial do paciente com dispneia",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 429,
    "endPage": 438
  },
  {
    "id": 19,
    "number": 19,
    "title": "Dor torácica",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 439,
    "endPage": 468
  },
  {
    "id": 20,
    "number": 20,
    "title": "Perda transitória da consciência",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 469,
    "endPage": 488
  },
  {
    "id": 21,
    "number": 21,
    "title": "Náuseas e vômitos",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 489,
    "endPage": 501
  },
  {
    "id": 22,
    "number": 22,
    "title": "Hemoptise",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 502,
    "endPage": 514
  },
  {
    "id": 23,
    "number": 23,
    "title": "Diarreia aguda",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 515,
    "endPage": 525
  },
  {
    "id": 24,
    "number": 24,
    "title": "Icterícia",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 526,
    "endPage": 540
  },
  {
    "id": 25,
    "number": 25,
    "title": "Dor abdominal",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 541,
    "endPage": 559
  },
  {
    "id": 26,
    "number": 26,
    "title": "Cefaleia",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 560,
    "endPage": 574
  },
  {
    "id": 27,
    "number": 27,
    "title": "Ascite",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 575,
    "endPage": 586
  },
  {
    "id": 28,
    "number": 28,
    "title": "Lombalgia",
    "sectionNumber": 2,
    "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
    "startPage": 587,
    "endPage": 602
  },
  {
    "id": 29,
    "number": 29,
    "title": "Síndrome coronariana aguda sem supradesnivelamento do segmento ST",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 603,
    "endPage": 623
  },
  {
    "id": 30,
    "number": 30,
    "title": "Infarto agudo do miocárdio com supradesnivelamento do segmento ST",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 624,
    "endPage": 645
  },
  {
    "id": 31,
    "number": 31,
    "title": "Fibrilação atrial",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 646,
    "endPage": 669
  },
  {
    "id": 32,
    "number": 32,
    "title": "Taquiarritmias",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 670,
    "endPage": 702
  },
  {
    "id": 33,
    "number": 33,
    "title": "Bradicardias",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 703,
    "endPage": 714
  },
  {
    "id": 34,
    "number": 34,
    "title": "Insuficiência cardíaca aguda",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 715,
    "endPage": 738
  },
  {
    "id": 35,
    "number": 35,
    "title": "Emergências hipertensivas",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 739,
    "endPage": 757
  },
  {
    "id": 36,
    "number": 36,
    "title": "Síndromes aórticas agudas",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 758,
    "endPage": 771
  },
  {
    "id": 37,
    "number": 37,
    "title": "Pericardite aguda, derrame pericárdico e tamponamento cardíaco",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 772,
    "endPage": 796
  },
  {
    "id": 38,
    "number": 38,
    "title": "Endocardite infecciosa",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 797,
    "endPage": 819
  },
  {
    "id": 39,
    "number": 39,
    "title": "Trombose venosa profunda",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 820,
    "endPage": 834
  },
  {
    "id": 40,
    "number": 40,
    "title": "Oclusão arterial aguda",
    "sectionNumber": 3,
    "sectionTitle": "Emergências Cardiovasculares",
    "startPage": 835,
    "endPage": 849
  },
  {
    "id": 41,
    "number": 41,
    "title": "Asma",
    "sectionNumber": 4,
    "sectionTitle": "Emergências Pulmonares",
    "startPage": 850,
    "endPage": 861
  },
  {
    "id": 42,
    "number": 42,
    "title": "Doença pulmonar obstrutiva crônica",
    "sectionNumber": 4,
    "sectionTitle": "Emergências Pulmonares",
    "startPage": 862,
    "endPage": 878
  },
  {
    "id": 43,
    "number": 43,
    "title": "Pneumonia adquirida na comunidade (PAC)",
    "sectionNumber": 4,
    "sectionTitle": "Emergências Pulmonares",
    "startPage": 879,
    "endPage": 903
  },
  {
    "id": 44,
    "number": 44,
    "title": "Derrame pleural",
    "sectionNumber": 4,
    "sectionTitle": "Emergências Pulmonares",
    "startPage": 904,
    "endPage": 922
  },
  {
    "id": 45,
    "number": 45,
    "title": "Tromboembolismo pulmonar",
    "sectionNumber": 4,
    "sectionTitle": "Emergências Pulmonares",
    "startPage": 923,
    "endPage": 955
  },
  {
    "id": 46,
    "number": 46,
    "title": "Pneumotórax não traumático",
    "sectionNumber": 4,
    "sectionTitle": "Emergências Pulmonares",
    "startPage": 956,
    "endPage": 965
  },
  {
    "id": 47,
    "number": 47,
    "title": "Infecções de vias aéreas superiores",
    "sectionNumber": 4,
    "sectionTitle": "Emergências Pulmonares",
    "startPage": 966,
    "endPage": 983
  },
  {
    "id": 48,
    "number": 48,
    "title": "Infecção pelo HIV e AIDS",
    "sectionNumber": 5,
    "sectionTitle": "Doenças Infecciosas na Emergência",
    "startPage": 984,
    "endPage": 1008
  },
  {
    "id": 49,
    "number": 49,
    "title": "Infecção do trato urinário",
    "sectionNumber": 5,
    "sectionTitle": "Doenças Infecciosas na Emergência",
    "startPage": 1009,
    "endPage": 1021
  },
  {
    "id": 50,
    "number": 50,
    "title": "Dengue",
    "sectionNumber": 5,
    "sectionTitle": "Doenças Infecciosas na Emergência",
    "startPage": 1022,
    "endPage": 1035
  },
  {
    "id": 51,
    "number": 51,
    "title": "Leptospirose",
    "sectionNumber": 5,
    "sectionTitle": "Doenças Infecciosas na Emergência",
    "startPage": 1036,
    "endPage": 1048
  },
  {
    "id": 52,
    "number": 52,
    "title": "Infecções cutâneas",
    "sectionNumber": 5,
    "sectionTitle": "Doenças Infecciosas na Emergência",
    "startPage": 1049,
    "endPage": 1064
  },
  {
    "id": 53,
    "number": 53,
    "title": "Abordagem do paciente com acidente vascular cerebral isquêmico agudo",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1065,
    "endPage": 1100
  },
  {
    "id": 54,
    "number": 54,
    "title": "Hemorragia subaracnóidea",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1101,
    "endPage": 1113
  },
  {
    "id": 55,
    "number": 55,
    "title": "Hemorragias intracranianas parenquimatosas",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1114,
    "endPage": 1129
  },
  {
    "id": 56,
    "number": 56,
    "title": "Infecções do sistema nervoso central",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1130,
    "endPage": 1148
  },
  {
    "id": 57,
    "number": 57,
    "title": "Paralisias flácidas agudas",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1149,
    "endPage": 1159
  },
  {
    "id": 58,
    "number": 58,
    "title": "Abordagem da primeira crise epiléptica",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1160,
    "endPage": 1174
  },
  {
    "id": 59,
    "number": 59,
    "title": "Síndromes vertiginosas agudas",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1175,
    "endPage": 1187
  },
  {
    "id": 60,
    "number": 60,
    "title": "Emergências neuropsiquiátricas",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1188,
    "endPage": 1205
  },
  {
    "id": 61,
    "number": 61,
    "title": "Hipertensão intracraniana",
    "sectionNumber": 6,
    "sectionTitle": "Emergências Neurológicas",
    "startPage": 1206,
    "endPage": 1223
  },
  {
    "id": 62,
    "number": 62,
    "title": "Atendimento inicial ao paciente politraumatizado",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1224,
    "endPage": 1237
  },
  {
    "id": 63,
    "number": 63,
    "title": "Traumatismo cranioencefálico",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1238,
    "endPage": 1253
  },
  {
    "id": 64,
    "number": 64,
    "title": "Trauma cervical",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1254,
    "endPage": 1274
  },
  {
    "id": 65,
    "number": 65,
    "title": "Trauma torácico",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1275,
    "endPage": 1286
  },
  {
    "id": 66,
    "number": 66,
    "title": "Trauma abdominal",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1287,
    "endPage": 1300
  },
  {
    "id": 67,
    "number": 67,
    "title": "Choque hemorrágico associado ao trauma",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1301,
    "endPage": 1314
  },
  {
    "id": 68,
    "number": 68,
    "title": "Fratura exposta: abordagem na emergência",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1315,
    "endPage": 1324
  },
  {
    "id": 69,
    "number": 69,
    "title": "Queimaduras térmicas",
    "sectionNumber": 7,
    "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
    "startPage": 1325,
    "endPage": 1344
  },
  {
    "id": 70,
    "number": 70,
    "title": "Encefalopatia hepática",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1345,
    "endPage": 1356
  },
  {
    "id": 71,
    "number": 71,
    "title": "Peritonite bacteriana espontânea",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1357,
    "endPage": 1367
  },
  {
    "id": 72,
    "number": 72,
    "title": "Síndrome hepatorrenal",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1368,
    "endPage": 1377
  },
  {
    "id": 73,
    "number": 73,
    "title": "Hepatites graves e insuficiência hepática aguda",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1378,
    "endPage": 1395
  },
  {
    "id": 74,
    "number": 74,
    "title": "Hemorragia digestiva alta",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1396,
    "endPage": 1412
  },
  {
    "id": 75,
    "number": 75,
    "title": "Doença diverticular aguda",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1413,
    "endPage": 1427
  },
  {
    "id": 76,
    "number": 76,
    "title": "Pancreatite aguda",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1428,
    "endPage": 1442
  },
  {
    "id": 77,
    "number": 77,
    "title": "Emergências biliares",
    "sectionNumber": 8,
    "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
    "startPage": 1443,
    "endPage": 1460
  },
  {
    "id": 78,
    "number": 78,
    "title": "Lesão renal aguda",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1461,
    "endPage": 1480
  },
  {
    "id": 79,
    "number": 79,
    "title": "Diálise na emergência",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1481,
    "endPage": 1492
  },
  {
    "id": 80,
    "number": 80,
    "title": "Distúrbios acidobásicos",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1493,
    "endPage": 1517
  },
  {
    "id": 81,
    "number": 81,
    "title": "Hiponatremia",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1518,
    "endPage": 1532
  },
  {
    "id": 82,
    "number": 82,
    "title": "Hipernatremia",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1533,
    "endPage": 1541
  },
  {
    "id": 83,
    "number": 83,
    "title": "Hipocalemia",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1542,
    "endPage": 1554
  },
  {
    "id": 84,
    "number": 84,
    "title": "Hipercalemia",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1555,
    "endPage": 1569
  },
  {
    "id": 85,
    "number": 85,
    "title": "Hipocalcemia",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1570,
    "endPage": 1581
  },
  {
    "id": 86,
    "number": 86,
    "title": "Hipercalcemia",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1582,
    "endPage": 1596
  },
  {
    "id": 87,
    "number": 87,
    "title": "Cólica nefrética",
    "sectionNumber": 9,
    "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "startPage": 1597,
    "endPage": 1608
  },
  {
    "id": 88,
    "number": 88,
    "title": "Hipoglicemia",
    "sectionNumber": 10,
    "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
    "startPage": 1609,
    "endPage": 1616
  },
  {
    "id": 89,
    "number": 89,
    "title": "Hiperglicemias",
    "sectionNumber": 10,
    "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
    "startPage": 1617,
    "endPage": 1631
  },
  {
    "id": 90,
    "number": 90,
    "title": "Crise tireotóxica",
    "sectionNumber": 10,
    "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
    "startPage": 1632,
    "endPage": 1644
  },
  {
    "id": 91,
    "number": 91,
    "title": "Insuficiência adrenal",
    "sectionNumber": 10,
    "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
    "startPage": 1645,
    "endPage": 1655
  },
  {
    "id": 92,
    "number": 92,
    "title": "Avaliação dos distúrbios de hemostasia no departamento de emergência",
    "sectionNumber": 11,
    "sectionTitle": "Emergências Hematológicas e Oncológicas",
    "startPage": 1656,
    "endPage": 1673
  },
  {
    "id": 93,
    "number": 93,
    "title": "Anemia falciforme",
    "sectionNumber": 11,
    "sectionTitle": "Emergências Hematológicas e Oncológicas",
    "startPage": 1674,
    "endPage": 1688
  },
  {
    "id": 94,
    "number": 94,
    "title": "Neutropenia febril",
    "sectionNumber": 11,
    "sectionTitle": "Emergências Hematológicas e Oncológicas",
    "startPage": 1689,
    "endPage": 1709
  },
  {
    "id": 95,
    "number": 95,
    "title": "Transfusão de hemocomponentes e reações transfusionais agudas",
    "sectionNumber": 11,
    "sectionTitle": "Emergências Hematológicas e Oncológicas",
    "startPage": 1710,
    "endPage": 1729
  },
  {
    "id": 96,
    "number": 96,
    "title": "Plaquetopenias",
    "sectionNumber": 11,
    "sectionTitle": "Emergências Hematológicas e Oncológicas",
    "startPage": 1730,
    "endPage": 1742
  },
  {
    "id": 97,
    "number": 97,
    "title": "Emergências oncológicas",
    "sectionNumber": 11,
    "sectionTitle": "Emergências Hematológicas e Oncológicas",
    "startPage": 1743,
    "endPage": 1764
  },
  {
    "id": 98,
    "number": 98,
    "title": "Monoartrite aguda",
    "sectionNumber": 12,
    "sectionTitle": "Emergências Reumatológicas",
    "startPage": 1765,
    "endPage": 1781
  },
  {
    "id": 99,
    "number": 99,
    "title": "Manejo inicial das intoxicações exógenas",
    "sectionNumber": 13,
    "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "startPage": 1782,
    "endPage": 1801
  },
  {
    "id": 100,
    "number": 100,
    "title": "Intoxicações por álcoois e drogas de abuso",
    "sectionNumber": 13,
    "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "startPage": 1802,
    "endPage": 1815
  },
  {
    "id": 101,
    "number": 101,
    "title": "Abordagem específica das intoxicações por fármacos",
    "sectionNumber": 13,
    "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "startPage": 1816,
    "endPage": 1849
  },
  {
    "id": 102,
    "number": 102,
    "title": "Intoxicações ambientais",
    "sectionNumber": 13,
    "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "startPage": 1850,
    "endPage": 1887
  },
  {
    "id": 103,
    "number": 103,
    "title": "Afogamento",
    "sectionNumber": 13,
    "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "startPage": 1888,
    "endPage": 1899
  },
  {
    "id": 104,
    "number": 104,
    "title": "Acidentes relacionados a animais peçonhentos",
    "sectionNumber": 13,
    "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "startPage": 1900,
    "endPage": 1920
  },
  {
    "id": 105,
    "number": 105,
    "title": "Síndrome de abstinência alcoólica",
    "sectionNumber": 13,
    "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "startPage": 1921,
    "endPage": 1933
  },
  {
    "id": 106,
    "number": 106,
    "title": "Dermatoses agudas",
    "sectionNumber": 14,
    "sectionTitle": "Emergências Dermatológicas",
    "startPage": 1934,
    "endPage": 1944
  },
  {
    "id": 107,
    "number": 107,
    "title": "Farmacodermias",
    "sectionNumber": 14,
    "sectionTitle": "Emergências Dermatológicas",
    "startPage": 1945,
    "endPage": 1957
  },
  {
    "id": 108,
    "number": 108,
    "title": "Emergências oftalmológicas",
    "sectionNumber": 15,
    "sectionTitle": "Emergências Oftalmológicas",
    "startPage": 1958,
    "endPage": 2015
  },
  {
    "id": 109,
    "number": 109,
    "title": "Emergências otorrinolaringológicas",
    "sectionNumber": 16,
    "sectionTitle": "Emergências Otorrinolaringológicas",
    "startPage": 2016,
    "endPage": 2035
  },
  {
    "id": 110,
    "number": 110,
    "title": "Saúde LGBTQIA+ no departamento de emergência",
    "sectionNumber": 17,
    "sectionTitle": "Ginecologia, Obstetrícia e Grupos Especiais",
    "startPage": 2036,
    "endPage": 2055
  },
  {
    "id": 111,
    "number": 111,
    "title": "Emergências ginecológicas",
    "sectionNumber": 17,
    "sectionTitle": "Ginecologia, Obstetrícia e Grupos Especiais",
    "startPage": 2056,
    "endPage": 2072
  },
  {
    "id": 112,
    "number": 112,
    "title": "Emergências obstétricas",
    "sectionNumber": 17,
    "sectionTitle": "Ginecologia, Obstetrícia e Grupos Especiais",
    "startPage": 2073,
    "endPage": 2094
  },
  {
    "id": 113,
    "number": 113,
    "title": "Cuidado paliativo na emergência",
    "sectionNumber": 18,
    "sectionTitle": "Cuidados Paliativos na Emergência",
    "startPage": 2095,
    "endPage": 2113
  },
  {
    "id": 114,
    "number": 114,
    "title": "Acesso venoso guiado por ultrassonografia",
    "sectionNumber": 19,
    "sectionTitle": "Ultrassonografia à Beira do Leito (POCUS)",
    "startPage": 2114,
    "endPage": 2130
  },
  {
    "id": 115,
    "number": 115,
    "title": "Avaliação torácica por ultrassom",
    "sectionNumber": 19,
    "sectionTitle": "Ultrassonografia à Beira do Leito (POCUS)",
    "startPage": 2131,
    "endPage": 2145
  },
  {
    "id": 116,
    "number": 116,
    "title": "Ultrassonografia cardíaca focada",
    "sectionNumber": 19,
    "sectionTitle": "Ultrassonografia à Beira do Leito (POCUS)",
    "startPage": 2146,
    "endPage": 2189
  },
  {
    "id": 117,
    "number": 117,
    "title": "Marca-passo e dispositivos implantáveis no departamento de emergência",
    "sectionNumber": 20,
    "sectionTitle": "Procedimentos no Departamento de Emergência",
    "startPage": 2190,
    "endPage": 2201
  },
  {
    "id": 118,
    "number": 118,
    "title": "Acessos vasculares",
    "sectionNumber": 20,
    "sectionTitle": "Procedimentos no Departamento de Emergência",
    "startPage": 2202,
    "endPage": 2222
  },
  {
    "id": 119,
    "number": 119,
    "title": "Toracocentese e drenagem pleural",
    "sectionNumber": 20,
    "sectionTitle": "Procedimentos no Departamento de Emergência",
    "startPage": 2223,
    "endPage": 2514
  }
];

export const SECTIONS: Section[] = [
  {
    "number": 1,
    "title": "Abordagem Inicial do Paciente Grave",
    "chapters": [
      {
        "id": 1,
        "number": 1,
        "title": "O paciente grave no departamento de emergência",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 115,
        "endPage": 129
      },
      {
        "id": 2,
        "number": 2,
        "title": "Manejo da via aérea na emergência",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 130,
        "endPage": 155
      },
      {
        "id": 3,
        "number": 3,
        "title": "Suporte Básico de Vida (BLS)",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 156,
        "endPage": 170
      },
      {
        "id": 4,
        "number": 4,
        "title": "Suporte Avançado de Vida",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 171,
        "endPage": 192
      },
      {
        "id": 5,
        "number": 5,
        "title": "Parada cardiorrespiratória na criança",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 193,
        "endPage": 207
      },
      {
        "id": 6,
        "number": 6,
        "title": "Insuficiência respiratória aguda",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 208,
        "endPage": 228
      },
      {
        "id": 7,
        "number": 7,
        "title": "Ventilação mecânica na emergência",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 229,
        "endPage": 253
      },
      {
        "id": 8,
        "number": 8,
        "title": "Choque",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 254,
        "endPage": 279
      },
      {
        "id": 9,
        "number": 9,
        "title": "Sepse",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 280,
        "endPage": 298
      },
      {
        "id": 10,
        "number": 10,
        "title": "Coma e alteração do nível de consciência",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 299,
        "endPage": 321
      },
      {
        "id": 11,
        "number": 11,
        "title": "Anafilaxia e outras alergias",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 322,
        "endPage": 339
      },
      {
        "id": 12,
        "number": 12,
        "title": "Delirium",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 340,
        "endPage": 349
      },
      {
        "id": 13,
        "number": 13,
        "title": "Sedação e analgesia em procedimentos não eletivos",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 350,
        "endPage": 365
      },
      {
        "id": 14,
        "number": 14,
        "title": "Dor e anestesia regional",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 366,
        "endPage": 391
      },
      {
        "id": 15,
        "number": 15,
        "title": "Agitação psicomotora",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 392,
        "endPage": 398
      },
      {
        "id": 16,
        "number": 16,
        "title": "Febre e síndromes hipertérmicas no paciente adulto",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 399,
        "endPage": 413
      },
      {
        "id": 17,
        "number": 17,
        "title": "Hipotermia acidental",
        "sectionNumber": 1,
        "sectionTitle": "Abordagem Inicial do Paciente Grave",
        "startPage": 414,
        "endPage": 428
      }
    ]
  },
  {
    "number": 2,
    "title": "Sinais e Sintomas Sintomáticos na Emergência",
    "chapters": [
      {
        "id": 18,
        "number": 18,
        "title": "Abordagem inicial do paciente com dispneia",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 429,
        "endPage": 438
      },
      {
        "id": 19,
        "number": 19,
        "title": "Dor torácica",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 439,
        "endPage": 468
      },
      {
        "id": 20,
        "number": 20,
        "title": "Perda transitória da consciência",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 469,
        "endPage": 488
      },
      {
        "id": 21,
        "number": 21,
        "title": "Náuseas e vômitos",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 489,
        "endPage": 501
      },
      {
        "id": 22,
        "number": 22,
        "title": "Hemoptise",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 502,
        "endPage": 514
      },
      {
        "id": 23,
        "number": 23,
        "title": "Diarreia aguda",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 515,
        "endPage": 525
      },
      {
        "id": 24,
        "number": 24,
        "title": "Icterícia",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 526,
        "endPage": 540
      },
      {
        "id": 25,
        "number": 25,
        "title": "Dor abdominal",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 541,
        "endPage": 559
      },
      {
        "id": 26,
        "number": 26,
        "title": "Cefaleia",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 560,
        "endPage": 574
      },
      {
        "id": 27,
        "number": 27,
        "title": "Ascite",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 575,
        "endPage": 586
      },
      {
        "id": 28,
        "number": 28,
        "title": "Lombalgia",
        "sectionNumber": 2,
        "sectionTitle": "Sinais e Sintomas Sintomáticos na Emergência",
        "startPage": 587,
        "endPage": 602
      }
    ]
  },
  {
    "number": 3,
    "title": "Emergências Cardiovasculares",
    "chapters": [
      {
        "id": 29,
        "number": 29,
        "title": "Síndrome coronariana aguda sem supradesnivelamento do segmento ST",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 603,
        "endPage": 623
      },
      {
        "id": 30,
        "number": 30,
        "title": "Infarto agudo do miocárdio com supradesnivelamento do segmento ST",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 624,
        "endPage": 645
      },
      {
        "id": 31,
        "number": 31,
        "title": "Fibrilação atrial",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 646,
        "endPage": 669
      },
      {
        "id": 32,
        "number": 32,
        "title": "Taquiarritmias",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 670,
        "endPage": 702
      },
      {
        "id": 33,
        "number": 33,
        "title": "Bradicardias",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 703,
        "endPage": 714
      },
      {
        "id": 34,
        "number": 34,
        "title": "Insuficiência cardíaca aguda",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 715,
        "endPage": 738
      },
      {
        "id": 35,
        "number": 35,
        "title": "Emergências hipertensivas",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 739,
        "endPage": 757
      },
      {
        "id": 36,
        "number": 36,
        "title": "Síndromes aórticas agudas",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 758,
        "endPage": 771
      },
      {
        "id": 37,
        "number": 37,
        "title": "Pericardite aguda, derrame pericárdico e tamponamento cardíaco",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 772,
        "endPage": 796
      },
      {
        "id": 38,
        "number": 38,
        "title": "Endocardite infecciosa",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 797,
        "endPage": 819
      },
      {
        "id": 39,
        "number": 39,
        "title": "Trombose venosa profunda",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 820,
        "endPage": 834
      },
      {
        "id": 40,
        "number": 40,
        "title": "Oclusão arterial aguda",
        "sectionNumber": 3,
        "sectionTitle": "Emergências Cardiovasculares",
        "startPage": 835,
        "endPage": 849
      }
    ]
  },
  {
    "number": 4,
    "title": "Emergências Pulmonares",
    "chapters": [
      {
        "id": 41,
        "number": 41,
        "title": "Asma",
        "sectionNumber": 4,
        "sectionTitle": "Emergências Pulmonares",
        "startPage": 850,
        "endPage": 861
      },
      {
        "id": 42,
        "number": 42,
        "title": "Doença pulmonar obstrutiva crônica",
        "sectionNumber": 4,
        "sectionTitle": "Emergências Pulmonares",
        "startPage": 862,
        "endPage": 878
      },
      {
        "id": 43,
        "number": 43,
        "title": "Pneumonia adquirida na comunidade (PAC)",
        "sectionNumber": 4,
        "sectionTitle": "Emergências Pulmonares",
        "startPage": 879,
        "endPage": 903
      },
      {
        "id": 44,
        "number": 44,
        "title": "Derrame pleural",
        "sectionNumber": 4,
        "sectionTitle": "Emergências Pulmonares",
        "startPage": 904,
        "endPage": 922
      },
      {
        "id": 45,
        "number": 45,
        "title": "Tromboembolismo pulmonar",
        "sectionNumber": 4,
        "sectionTitle": "Emergências Pulmonares",
        "startPage": 923,
        "endPage": 955
      },
      {
        "id": 46,
        "number": 46,
        "title": "Pneumotórax não traumático",
        "sectionNumber": 4,
        "sectionTitle": "Emergências Pulmonares",
        "startPage": 956,
        "endPage": 965
      },
      {
        "id": 47,
        "number": 47,
        "title": "Infecções de vias aéreas superiores",
        "sectionNumber": 4,
        "sectionTitle": "Emergências Pulmonares",
        "startPage": 966,
        "endPage": 983
      }
    ]
  },
  {
    "number": 5,
    "title": "Doenças Infecciosas na Emergência",
    "chapters": [
      {
        "id": 48,
        "number": 48,
        "title": "Infecção pelo HIV e AIDS",
        "sectionNumber": 5,
        "sectionTitle": "Doenças Infecciosas na Emergência",
        "startPage": 984,
        "endPage": 1008
      },
      {
        "id": 49,
        "number": 49,
        "title": "Infecção do trato urinário",
        "sectionNumber": 5,
        "sectionTitle": "Doenças Infecciosas na Emergência",
        "startPage": 1009,
        "endPage": 1021
      },
      {
        "id": 50,
        "number": 50,
        "title": "Dengue",
        "sectionNumber": 5,
        "sectionTitle": "Doenças Infecciosas na Emergência",
        "startPage": 1022,
        "endPage": 1035
      },
      {
        "id": 51,
        "number": 51,
        "title": "Leptospirose",
        "sectionNumber": 5,
        "sectionTitle": "Doenças Infecciosas na Emergência",
        "startPage": 1036,
        "endPage": 1048
      },
      {
        "id": 52,
        "number": 52,
        "title": "Infecções cutâneas",
        "sectionNumber": 5,
        "sectionTitle": "Doenças Infecciosas na Emergência",
        "startPage": 1049,
        "endPage": 1064
      }
    ]
  },
  {
    "number": 6,
    "title": "Emergências Neurológicas",
    "chapters": [
      {
        "id": 53,
        "number": 53,
        "title": "Abordagem do paciente com acidente vascular cerebral isquêmico agudo",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1065,
        "endPage": 1100
      },
      {
        "id": 54,
        "number": 54,
        "title": "Hemorragia subaracnóidea",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1101,
        "endPage": 1113
      },
      {
        "id": 55,
        "number": 55,
        "title": "Hemorragias intracranianas parenquimatosas",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1114,
        "endPage": 1129
      },
      {
        "id": 56,
        "number": 56,
        "title": "Infecções do sistema nervoso central",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1130,
        "endPage": 1148
      },
      {
        "id": 57,
        "number": 57,
        "title": "Paralisias flácidas agudas",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1149,
        "endPage": 1159
      },
      {
        "id": 58,
        "number": 58,
        "title": "Abordagem da primeira crise epiléptica",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1160,
        "endPage": 1174
      },
      {
        "id": 59,
        "number": 59,
        "title": "Síndromes vertiginosas agudas",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1175,
        "endPage": 1187
      },
      {
        "id": 60,
        "number": 60,
        "title": "Emergências neuropsiquiátricas",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1188,
        "endPage": 1205
      },
      {
        "id": 61,
        "number": 61,
        "title": "Hipertensão intracraniana",
        "sectionNumber": 6,
        "sectionTitle": "Emergências Neurológicas",
        "startPage": 1206,
        "endPage": 1223
      }
    ]
  },
  {
    "number": 7,
    "title": "Abordagem do Paciente Vítima de Trauma",
    "chapters": [
      {
        "id": 62,
        "number": 62,
        "title": "Atendimento inicial ao paciente politraumatizado",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1224,
        "endPage": 1237
      },
      {
        "id": 63,
        "number": 63,
        "title": "Traumatismo cranioencefálico",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1238,
        "endPage": 1253
      },
      {
        "id": 64,
        "number": 64,
        "title": "Trauma cervical",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1254,
        "endPage": 1274
      },
      {
        "id": 65,
        "number": 65,
        "title": "Trauma torácico",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1275,
        "endPage": 1286
      },
      {
        "id": 66,
        "number": 66,
        "title": "Trauma abdominal",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1287,
        "endPage": 1300
      },
      {
        "id": 67,
        "number": 67,
        "title": "Choque hemorrágico associado ao trauma",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1301,
        "endPage": 1314
      },
      {
        "id": 68,
        "number": 68,
        "title": "Fratura exposta: abordagem na emergência",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1315,
        "endPage": 1324
      },
      {
        "id": 69,
        "number": 69,
        "title": "Queimaduras térmicas",
        "sectionNumber": 7,
        "sectionTitle": "Abordagem do Paciente Vítima de Trauma",
        "startPage": 1325,
        "endPage": 1344
      }
    ]
  },
  {
    "number": 8,
    "title": "Emergências Gastrointestinais e Hepáticas",
    "chapters": [
      {
        "id": 70,
        "number": 70,
        "title": "Encefalopatia hepática",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1345,
        "endPage": 1356
      },
      {
        "id": 71,
        "number": 71,
        "title": "Peritonite bacteriana espontânea",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1357,
        "endPage": 1367
      },
      {
        "id": 72,
        "number": 72,
        "title": "Síndrome hepatorrenal",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1368,
        "endPage": 1377
      },
      {
        "id": 73,
        "number": 73,
        "title": "Hepatites graves e insuficiência hepática aguda",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1378,
        "endPage": 1395
      },
      {
        "id": 74,
        "number": 74,
        "title": "Hemorragia digestiva alta",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1396,
        "endPage": 1412
      },
      {
        "id": 75,
        "number": 75,
        "title": "Doença diverticular aguda",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1413,
        "endPage": 1427
      },
      {
        "id": 76,
        "number": 76,
        "title": "Pancreatite aguda",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1428,
        "endPage": 1442
      },
      {
        "id": 77,
        "number": 77,
        "title": "Emergências biliares",
        "sectionNumber": 8,
        "sectionTitle": "Emergências Gastrointestinais e Hepáticas",
        "startPage": 1443,
        "endPage": 1460
      }
    ]
  },
  {
    "number": 9,
    "title": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
    "chapters": [
      {
        "id": 78,
        "number": 78,
        "title": "Lesão renal aguda",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1461,
        "endPage": 1480
      },
      {
        "id": 79,
        "number": 79,
        "title": "Diálise na emergência",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1481,
        "endPage": 1492
      },
      {
        "id": 80,
        "number": 80,
        "title": "Distúrbios acidobásicos",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1493,
        "endPage": 1517
      },
      {
        "id": 81,
        "number": 81,
        "title": "Hiponatremia",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1518,
        "endPage": 1532
      },
      {
        "id": 82,
        "number": 82,
        "title": "Hipernatremia",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1533,
        "endPage": 1541
      },
      {
        "id": 83,
        "number": 83,
        "title": "Hipocalemia",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1542,
        "endPage": 1554
      },
      {
        "id": 84,
        "number": 84,
        "title": "Hipercalemia",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1555,
        "endPage": 1569
      },
      {
        "id": 85,
        "number": 85,
        "title": "Hipocalcemia",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1570,
        "endPage": 1581
      },
      {
        "id": 86,
        "number": 86,
        "title": "Hipercalcemia",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1582,
        "endPage": 1596
      },
      {
        "id": 87,
        "number": 87,
        "title": "Cólica nefrética",
        "sectionNumber": 9,
        "sectionTitle": "Emergências Renais e Distúrbios Hidroeletrolíticos e Acidobásicos",
        "startPage": 1597,
        "endPage": 1608
      }
    ]
  },
  {
    "number": 10,
    "title": "Emergências Endocrinológicas e Metabólicas",
    "chapters": [
      {
        "id": 88,
        "number": 88,
        "title": "Hipoglicemia",
        "sectionNumber": 10,
        "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
        "startPage": 1609,
        "endPage": 1616
      },
      {
        "id": 89,
        "number": 89,
        "title": "Hiperglicemias",
        "sectionNumber": 10,
        "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
        "startPage": 1617,
        "endPage": 1631
      },
      {
        "id": 90,
        "number": 90,
        "title": "Crise tireotóxica",
        "sectionNumber": 10,
        "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
        "startPage": 1632,
        "endPage": 1644
      },
      {
        "id": 91,
        "number": 91,
        "title": "Insuficiência adrenal",
        "sectionNumber": 10,
        "sectionTitle": "Emergências Endocrinológicas e Metabólicas",
        "startPage": 1645,
        "endPage": 1655
      }
    ]
  },
  {
    "number": 11,
    "title": "Emergências Hematológicas e Oncológicas",
    "chapters": [
      {
        "id": 92,
        "number": 92,
        "title": "Avaliação dos distúrbios de hemostasia no departamento de emergência",
        "sectionNumber": 11,
        "sectionTitle": "Emergências Hematológicas e Oncológicas",
        "startPage": 1656,
        "endPage": 1673
      },
      {
        "id": 93,
        "number": 93,
        "title": "Anemia falciforme",
        "sectionNumber": 11,
        "sectionTitle": "Emergências Hematológicas e Oncológicas",
        "startPage": 1674,
        "endPage": 1688
      },
      {
        "id": 94,
        "number": 94,
        "title": "Neutropenia febril",
        "sectionNumber": 11,
        "sectionTitle": "Emergências Hematológicas e Oncológicas",
        "startPage": 1689,
        "endPage": 1709
      },
      {
        "id": 95,
        "number": 95,
        "title": "Transfusão de hemocomponentes e reações transfusionais agudas",
        "sectionNumber": 11,
        "sectionTitle": "Emergências Hematológicas e Oncológicas",
        "startPage": 1710,
        "endPage": 1729
      },
      {
        "id": 96,
        "number": 96,
        "title": "Plaquetopenias",
        "sectionNumber": 11,
        "sectionTitle": "Emergências Hematológicas e Oncológicas",
        "startPage": 1730,
        "endPage": 1742
      },
      {
        "id": 97,
        "number": 97,
        "title": "Emergências oncológicas",
        "sectionNumber": 11,
        "sectionTitle": "Emergências Hematológicas e Oncológicas",
        "startPage": 1743,
        "endPage": 1764
      }
    ]
  },
  {
    "number": 12,
    "title": "Emergências Reumatológicas",
    "chapters": [
      {
        "id": 98,
        "number": 98,
        "title": "Monoartrite aguda",
        "sectionNumber": 12,
        "sectionTitle": "Emergências Reumatológicas",
        "startPage": 1765,
        "endPage": 1781
      }
    ]
  },
  {
    "number": 13,
    "title": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
    "chapters": [
      {
        "id": 99,
        "number": 99,
        "title": "Manejo inicial das intoxicações exógenas",
        "sectionNumber": 13,
        "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
        "startPage": 1782,
        "endPage": 1801
      },
      {
        "id": 100,
        "number": 100,
        "title": "Intoxicações por álcoois e drogas de abuso",
        "sectionNumber": 13,
        "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
        "startPage": 1802,
        "endPage": 1815
      },
      {
        "id": 101,
        "number": 101,
        "title": "Abordagem específica das intoxicações por fármacos",
        "sectionNumber": 13,
        "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
        "startPage": 1816,
        "endPage": 1849
      },
      {
        "id": 102,
        "number": 102,
        "title": "Intoxicações ambientais",
        "sectionNumber": 13,
        "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
        "startPage": 1850,
        "endPage": 1887
      },
      {
        "id": 103,
        "number": 103,
        "title": "Afogamento",
        "sectionNumber": 13,
        "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
        "startPage": 1888,
        "endPage": 1899
      },
      {
        "id": 104,
        "number": 104,
        "title": "Acidentes relacionados a animais peçonhentos",
        "sectionNumber": 13,
        "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
        "startPage": 1900,
        "endPage": 1920
      },
      {
        "id": 105,
        "number": 105,
        "title": "Síndrome de abstinência alcoólica",
        "sectionNumber": 13,
        "sectionTitle": "Intoxicações Exógenas e Acidentes por Animais Peçonhentos",
        "startPage": 1921,
        "endPage": 1933
      }
    ]
  },
  {
    "number": 14,
    "title": "Emergências Dermatológicas",
    "chapters": [
      {
        "id": 106,
        "number": 106,
        "title": "Dermatoses agudas",
        "sectionNumber": 14,
        "sectionTitle": "Emergências Dermatológicas",
        "startPage": 1934,
        "endPage": 1944
      },
      {
        "id": 107,
        "number": 107,
        "title": "Farmacodermias",
        "sectionNumber": 14,
        "sectionTitle": "Emergências Dermatológicas",
        "startPage": 1945,
        "endPage": 1957
      }
    ]
  },
  {
    "number": 15,
    "title": "Emergências Oftalmológicas",
    "chapters": [
      {
        "id": 108,
        "number": 108,
        "title": "Emergências oftalmológicas",
        "sectionNumber": 15,
        "sectionTitle": "Emergências Oftalmológicas",
        "startPage": 1958,
        "endPage": 2015
      }
    ]
  },
  {
    "number": 16,
    "title": "Emergências Otorrinolaringológicas",
    "chapters": [
      {
        "id": 109,
        "number": 109,
        "title": "Emergências otorrinolaringológicas",
        "sectionNumber": 16,
        "sectionTitle": "Emergências Otorrinolaringológicas",
        "startPage": 2016,
        "endPage": 2035
      }
    ]
  },
  {
    "number": 17,
    "title": "Ginecologia, Obstetrícia e Grupos Especiais",
    "chapters": [
      {
        "id": 110,
        "number": 110,
        "title": "Saúde LGBTQIA+ no departamento de emergência",
        "sectionNumber": 17,
        "sectionTitle": "Ginecologia, Obstetrícia e Grupos Especiais",
        "startPage": 2036,
        "endPage": 2055
      },
      {
        "id": 111,
        "number": 111,
        "title": "Emergências ginecológicas",
        "sectionNumber": 17,
        "sectionTitle": "Ginecologia, Obstetrícia e Grupos Especiais",
        "startPage": 2056,
        "endPage": 2072
      },
      {
        "id": 112,
        "number": 112,
        "title": "Emergências obstétricas",
        "sectionNumber": 17,
        "sectionTitle": "Ginecologia, Obstetrícia e Grupos Especiais",
        "startPage": 2073,
        "endPage": 2094
      }
    ]
  },
  {
    "number": 18,
    "title": "Cuidados Paliativos na Emergência",
    "chapters": [
      {
        "id": 113,
        "number": 113,
        "title": "Cuidado paliativo na emergência",
        "sectionNumber": 18,
        "sectionTitle": "Cuidados Paliativos na Emergência",
        "startPage": 2095,
        "endPage": 2113
      }
    ]
  },
  {
    "number": 19,
    "title": "Ultrassonografia à Beira do Leito (POCUS)",
    "chapters": [
      {
        "id": 114,
        "number": 114,
        "title": "Acesso venoso guiado por ultrassonografia",
        "sectionNumber": 19,
        "sectionTitle": "Ultrassonografia à Beira do Leito (POCUS)",
        "startPage": 2114,
        "endPage": 2130
      },
      {
        "id": 115,
        "number": 115,
        "title": "Avaliação torácica por ultrassom",
        "sectionNumber": 19,
        "sectionTitle": "Ultrassonografia à Beira do Leito (POCUS)",
        "startPage": 2131,
        "endPage": 2145
      },
      {
        "id": 116,
        "number": 116,
        "title": "Ultrassonografia cardíaca focada",
        "sectionNumber": 19,
        "sectionTitle": "Ultrassonografia à Beira do Leito (POCUS)",
        "startPage": 2146,
        "endPage": 2189
      }
    ]
  },
  {
    "number": 20,
    "title": "Procedimentos no Departamento de Emergência",
    "chapters": [
      {
        "id": 117,
        "number": 117,
        "title": "Marca-passo e dispositivos implantáveis no departamento de emergência",
        "sectionNumber": 20,
        "sectionTitle": "Procedimentos no Departamento de Emergência",
        "startPage": 2190,
        "endPage": 2201
      },
      {
        "id": 118,
        "number": 118,
        "title": "Acessos vasculares",
        "sectionNumber": 20,
        "sectionTitle": "Procedimentos no Departamento de Emergência",
        "startPage": 2202,
        "endPage": 2222
      },
      {
        "id": 119,
        "number": 119,
        "title": "Toracocentese e drenagem pleural",
        "sectionNumber": 20,
        "sectionTitle": "Procedimentos no Departamento de Emergência",
        "startPage": 2223,
        "endPage": 2514
      }
    ]
  }
];
