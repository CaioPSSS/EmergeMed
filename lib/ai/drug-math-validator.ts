/**
 * Drug Math Validator — Calculates drug infusion parameters from prescription text.
 *
 * Uses the OSID/Roma standardized dilution table as reference. When the doctor uses
 * a non-standard dilution, the parser attempts to extract values from free text.
 * If parsing fails, the drug is marked as "not calculable" so the AI can attempt
 * its own interpretation with full context.
 *
 * Critical:
 * 1. Handles salt-to-base conversions (e.g., norepinephrine hemitartrate ×0.5).
 * 2. Handles time base conversions (per minute vs per hour).
 * 3. Filters out subcutaneous scales and intermittent boluses from continuous BIC math.
 * 4. Supports multi-phase infusions (e.g., Amiodarona Ataque + Manutenção).
 */

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface DrugCalculation {
  drugName: string;
  phaseLabel?: string; // e.g. "ATAQUE", "MANUTENÇÃO"
  rawPrescriptionText: string;
  ampoleContent: string;
  saltToBaseFactor: number;
  activePrinciplePerAmpole_mg: number;
  numberOfAmpoles: number;
  dilutionVolumeMl: number;
  totalVolumeMl: number;
  finalConcentration_mcgPerMl: number;
  flowRate_mlPerH?: number;
  secondaryFlowRate_mlPerH?: number;
  dosePerTimeUnit?: number;
  secondaryDosePerTimeUnit?: number;
  dosePerKgPerTimeUnit?: number;
  secondaryDosePerKgPerTimeUnit?: number;
  patientWeight: number;
  unit: string;
  therapeuticRange: string;
  isWithinRange?: boolean;
  warnings: string[];
  calculable: boolean;
}

export interface DrugDefinition {
  names: string[];
  ampolePresentation: string;
  ampoleTotalDrug_mg: number;
  ampoleVolume_ml: number;
  saltToBaseFactor: number;
  standardDilution: {
    ampoles: number;
    diluentVolumeMl: number;
    diluentType: string;
  };
  concentratedDilutions?: Array<{
    label: string;
    ampoles: number;
    diluentVolumeMl: number;
  }>;
  unit: string;
  therapeuticRange: [number, number];
  therapeuticRangeLabel: string;
  /** If true, the dose is per kg (mcg/kg/min or UI/kg/h). If false, dose is absolute (mcg/min or UI/min). */
  perKg: boolean;
  /** If true, rate is per hour (/h). If false, rate is per minute (/min). */
  isPerHour: boolean;
  /** Conversion factor from mg to the unit used in therapeutic range. E.g., mg→mcg = 1000 */
  mgToUnitFactor: number;
}

// ═══════════════════════════════════════════════════════════
// OSID DRUG TABLE (Complexo Roma — Uniformização de Soluções)
// Source: uniformizacao_solucoes_padrao_UPA.md (Rev. 10.07.2024)
// ═══════════════════════════════════════════════════════════

export const OSID_DRUG_TABLE: DrugDefinition[] = [
  {
    names: ['norepinefrina', 'noradrenalina', 'hemitartarato de norepinefrina', 'hemitartarato de noradrenalina', 'nora'],
    ampolePresentation: '8mg/4mL (hemitartarato) = 4mg norepinefrina base',
    ampoleTotalDrug_mg: 8,
    ampoleVolume_ml: 4,
    saltToBaseFactor: 0.5, // hemitartarato → base
    standardDilution: { ampoles: 1, diluentVolumeMl: 246, diluentType: 'SG5%' },
    concentratedDilutions: [
      { label: 'concentrada', ampoles: 2, diluentVolumeMl: 242 },
      { label: '2x concentrada', ampoles: 4, diluentVolumeMl: 234 },
      { label: '4x concentrada', ampoles: 8, diluentVolumeMl: 218 },
    ],
    unit: 'mcg/kg/min',
    therapeuticRange: [0.02, 2.0],
    therapeuticRangeLabel: '0.02–2.0 mcg/kg/min',
    perKg: true,
    isPerHour: false,
    mgToUnitFactor: 1000,
  },
  {
    names: ['dobutamina', 'cloridrato de dobutamina', 'dobuta'],
    ampolePresentation: '250mg/20mL',
    ampoleTotalDrug_mg: 250,
    ampoleVolume_ml: 20,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 1, diluentVolumeMl: 230, diluentType: 'SG5%' },
    concentratedDilutions: [
      { label: 'concentrada', ampoles: 2, diluentVolumeMl: 210 },
      { label: '2x concentrada', ampoles: 4, diluentVolumeMl: 170 },
    ],
    unit: 'mcg/kg/min',
    therapeuticRange: [2.5, 20],
    therapeuticRangeLabel: '2.5–20 mcg/kg/min',
    perKg: true,
    isPerHour: false,
    mgToUnitFactor: 1000,
  },
  {
    names: ['dopamina', 'cloridrato de dopamina'],
    ampolePresentation: '50mg/10mL',
    ampoleTotalDrug_mg: 50,
    ampoleVolume_ml: 10,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 5, diluentVolumeMl: 200, diluentType: 'SG5%' },
    concentratedDilutions: [
      { label: 'concentrada', ampoles: 10, diluentVolumeMl: 150 },
    ],
    unit: 'mcg/kg/min',
    therapeuticRange: [2, 20],
    therapeuticRangeLabel: '2–20 mcg/kg/min',
    perKg: true,
    isPerHour: false,
    mgToUnitFactor: 1000,
  },
  {
    names: ['epinefrina', 'adrenalina'],
    ampolePresentation: '1mg/1mL',
    ampoleTotalDrug_mg: 1,
    ampoleVolume_ml: 1,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 1, diluentVolumeMl: 250, diluentType: 'SG5%' },
    unit: 'mcg/kg/min',
    therapeuticRange: [0.01, 0.5],
    therapeuticRangeLabel: '0.01–0.5 mcg/kg/min',
    perKg: true,
    isPerHour: false,
    mgToUnitFactor: 1000,
  },
  {
    names: ['nitroglicerina', 'tridil', 'ntg'],
    ampolePresentation: '25mg/5mL',
    ampoleTotalDrug_mg: 25,
    ampoleVolume_ml: 5,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 2, diluentVolumeMl: 240, diluentType: 'SG5%' },
    unit: 'mcg/min',
    therapeuticRange: [5, 200],
    therapeuticRangeLabel: '5–200 mcg/min',
    perKg: false,
    isPerHour: false,
    mgToUnitFactor: 1000,
  },
  {
    names: ['nitroprussiato', 'nitroprussiato de sódio', 'nipride'],
    ampolePresentation: '50mg/2mL',
    ampoleTotalDrug_mg: 50,
    ampoleVolume_ml: 2,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 1, diluentVolumeMl: 250, diluentType: 'SG5%' },
    concentratedDilutions: [
      { label: 'concentrada', ampoles: 2, diluentVolumeMl: 250 },
    ],
    unit: 'mcg/kg/min',
    therapeuticRange: [0.3, 10],
    therapeuticRangeLabel: '0.3–10 mcg/kg/min',
    perKg: true,
    isPerHour: false,
    mgToUnitFactor: 1000,
  },
  {
    names: ['vasopressina', 'encrise'],
    ampolePresentation: '20UI/1mL',
    ampoleTotalDrug_mg: 20,
    ampoleVolume_ml: 1,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 1, diluentVolumeMl: 200, diluentType: 'SF0.9%' },
    unit: 'UI/min',
    therapeuticRange: [0.01, 0.04],
    therapeuticRangeLabel: '0.01–0.04 UI/min',
    perKg: false,
    isPerHour: false,
    mgToUnitFactor: 1,
  },
  {
    names: ['insulina regular', 'insulina humana regular', 'insulina reg'],
    ampolePresentation: '100UI/mL (frasco 10mL)',
    ampoleTotalDrug_mg: 100,
    ampoleVolume_ml: 1, // 100 UI = 1 mL
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 1, diluentVolumeMl: 100, diluentType: 'SF0.9%' },
    unit: 'UI/kg/h',
    therapeuticRange: [0.05, 0.2],
    therapeuticRangeLabel: '0.05–0.2 UI/kg/h (CAD/EHH)',
    perKg: true,
    isPerHour: true,
    mgToUnitFactor: 1,
  },
  {
    names: ['amiodarona', 'cloridrato de amiodarona', 'ancoron'],
    ampolePresentation: '150mg/3mL',
    ampoleTotalDrug_mg: 150,
    ampoleVolume_ml: 3,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 4, diluentVolumeMl: 238, diluentType: 'SG5%' },
    unit: 'mg/min',
    therapeuticRange: [0.5, 1.0],
    therapeuticRangeLabel: 'Ataque: 150mg em 10-20min | Manutenção: 1mg/min × 6h (16 mL/h) → 0.5mg/min × 18h (8 mL/h)',
    perKg: false,
    isPerHour: false,
    mgToUnitFactor: 1,
  },
  {
    names: ['midazolam', 'dormonid'],
    ampolePresentation: '50mg/10mL',
    ampoleTotalDrug_mg: 50,
    ampoleVolume_ml: 10,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 5, diluentVolumeMl: 200, diluentType: 'SG5%' },
    concentratedDilutions: [
      { label: 'concentrada', ampoles: 10, diluentVolumeMl: 150 },
      { label: '2x concentrada', ampoles: 20, diluentVolumeMl: 50 },
    ],
    unit: 'mg/kg/h',
    therapeuticRange: [0.02, 0.1],
    therapeuticRangeLabel: '0.02–0.1 mg/kg/h',
    perKg: true,
    isPerHour: true,
    mgToUnitFactor: 1,
  },
  {
    names: ['fentanila', 'fentanil', 'citrato de fentanila'],
    ampolePresentation: '0.5mg/10mL (0.05mg/mL)',
    ampoleTotalDrug_mg: 0.5,
    ampoleVolume_ml: 10,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 4, diluentVolumeMl: 210, diluentType: 'SG5%' },
    concentratedDilutions: [
      { label: 'concentrada', ampoles: 8, diluentVolumeMl: 170 },
    ],
    unit: 'mcg/h',
    therapeuticRange: [25, 200],
    therapeuticRangeLabel: '25–200 mcg/h',
    perKg: false,
    isPerHour: true,
    mgToUnitFactor: 1000,
  },
  {
    names: ['heparina', 'heparina sódica'],
    ampolePresentation: '25000UI/5mL',
    ampoleTotalDrug_mg: 25000,
    ampoleVolume_ml: 5,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 1, diluentVolumeMl: 245, diluentType: 'SG5%' },
    unit: 'UI/kg/h',
    therapeuticRange: [12, 18],
    therapeuticRangeLabel: '12–18 UI/kg/h',
    perKg: true,
    isPerHour: true,
    mgToUnitFactor: 1,
  },
  {
    names: ['furosemida', 'lasix'],
    ampolePresentation: '20mg/2mL',
    ampoleTotalDrug_mg: 20,
    ampoleVolume_ml: 2,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 25, diluentVolumeMl: 200, diluentType: 'SG5%' },
    unit: 'mg/h',
    therapeuticRange: [1, 40],
    therapeuticRangeLabel: '1–40 mg/h (infusão contínua em BIC)',
    perKg: false,
    isPerHour: true,
    mgToUnitFactor: 1,
  },
  {
    names: ['clonidina', 'cloridrato de clonidina', 'atensina'],
    ampolePresentation: '150mcg/1mL',
    ampoleTotalDrug_mg: 0.15,
    ampoleVolume_ml: 1,
    saltToBaseFactor: 1.0,
    standardDilution: { ampoles: 10, diluentVolumeMl: 240, diluentType: 'SG5%' },
    unit: 'mcg/kg/h',
    therapeuticRange: [0.5, 2],
    therapeuticRangeLabel: '0.5–2 mcg/kg/h',
    perKg: true,
    isPerHour: true,
    mgToUnitFactor: 1000,
  },
];

// ═══════════════════════════════════════════════════════════
// PARSER HELPERS
// ═══════════════════════════════════════════════════════════

export function findDrugMatch(text: string): DrugDefinition | null {
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const drug of OSID_DRUG_TABLE) {
    for (const name of drug.names) {
      const normalizedName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (lower.includes(normalizedName)) {
        return drug;
      }
    }
  }
  return null;
}

/** Returns true if the line is strictly a subcutaneous scale / bolus (not continuous IV). */
function isSubcutaneousNonContinuous(text: string): boolean {
  const isSc = /\b(?:subcut[aâá]neo?|subcut[aâá]nea|sc|s\.c\.)\b/i.test(text);
  const isContinuous = /\b(?:bic|cont[ií]nu[oa]|ml\/h|bomba)\b/i.test(text);
  return isSc && !isContinuous;
}

/** Returns true if the line is an intermittent bolus without continuous infusion intent. */
function isIntermittentBolus(text: string): boolean {
  const hasInterval = /\b(?:\d+\/\d+\s*h(?:oras)?|de\s+\d+\/\d+\s*h(?:oras)?|de\s+\d+\s+(?:em\s+)?\d+\s*h(?:oras)?|se\s+(?:dor|febre|n[aá]usea|v[oô]mito|necess[aá]rio)|dose\s+[uú]nica)\b/i.test(text);
  const hasContinuous = /\b(?:bic|cont[ií]nu[oa]|ml\/h|infus[aã]o\s+cont[ií]nua|bomba)\b/i.test(text);
  return hasInterval && !hasContinuous;
}

/** Returns true if line is just a diluent descriptor (e.g. "SF0,9% 100ml para diluir...") */
function isDiluentLine(text: string): boolean {
  return /^\s*(?:SF|SG|SRL|Soro|Solu[cç][aã]o|Água|AD)/i.test(text) && /\b(?:para\s+diluir|diluente|dilui[cç][aã]o)\b/i.test(text);
}

function extractNumber(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const val = parseFloat(match[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return null;
}

function extractAmpoles(text: string): number | null {
  return extractNumber(text, [
    /(\d+)\s*(?:amp(?:ola)?s?|ampola)/i,
    /diluir\s+(\d+)\s*(?:amp|ml)/i,
  ]);
}

function extractDiluteAmount(text: string): number | null {
  const mgMatch = text.match(/diluir\s+(\d+(?:[.,]\d+)?)\s*mg\b/i);
  if (mgMatch) return parseFloat(mgMatch[1].replace(',', '.'));
  const uiMatch = text.match(/diluir\s+(\d+(?:[.,]\d+)?)\s*UI\b/i);
  if (uiMatch) return parseFloat(uiMatch[1].replace(',', '.'));
  return null;
}

function extractDrugAmount(text: string): { amount: number; volume: number } | null {
  const mvMatch = text.match(/(\d+(?:[.,]\d+)?)\s*mg\s*\/\s*(\d+(?:[.,]\d+)?)\s*ml/i);
  if (mvMatch) {
    return {
      amount: parseFloat(mvMatch[1].replace(',', '.')),
      volume: parseFloat(mvMatch[2].replace(',', '.')),
    };
  }
  const mgMatch = text.match(/diluir\s+(\d+(?:[.,]\d+)?)\s*mg/i);
  if (mgMatch) {
    return {
      amount: parseFloat(mgMatch[1].replace(',', '.')),
      volume: 0,
    };
  }
  const uiMatch = text.match(/(\d+(?:[.,]\d+)?)\s*UI/i);
  if (uiMatch) {
    return {
      amount: parseFloat(uiMatch[1].replace(',', '.')),
      volume: 0,
    };
  }
  return null;
}

function extractDilutionVolume(text: string): number | null {
  return extractNumber(text, [
    /(?:diluir|diluído?|em)\s+(?:\d+\s*(?:amp(?:ola)?s?|ml|mg)\s+em\s+)?(\d+(?:[.,]\d+)?)\s*ml/i,
    /(\d+(?:[.,]\d+)?)\s*ml\s*(?:de\s+)?(?:SG|SF|soro|solução)/i,
    /(?:SG|SF|soro)\s*\d*%?\s*(\d+(?:[.,]\d+)?)\s*ml/i,
  ]);
}

function extractFlowRates(text: string): { primary: number | null; secondary: number | null } {
  // Pattern: "a 16 ml/h por 6 horas, após, a 8 ml/h por 18 horas"
  const multiMatches = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*ml\s*\/\s*h/gi));
  if (multiMatches.length >= 2) {
    return {
      primary: parseFloat(multiMatches[0][1].replace(',', '.')),
      secondary: parseFloat(multiMatches[1][1].replace(',', '.')),
    };
  }
  if (multiMatches.length === 1) {
    return {
      primary: parseFloat(multiMatches[0][1].replace(',', '.')),
      secondary: null,
    };
  }

  // Fallback single extraction
  const single = extractNumber(text, [
    /(\d+(?:[.,]\d+)?)\s*ml\s*\/\s*h/i,
    /(?:correr|infundir|velocidade|vazão|bic)\s+(?:a|em|de)?\s*(\d+(?:[.,]\d+)?)\s*ml/i,
  ]);
  return { primary: single, secondary: null };
}

function extractMinutesDuration(text: string): number | null {
  return extractNumber(text, [
    /(?:em|por)\s+(\d+(?:[.,]\d+)?)\s*min(?:uto)?s?/i,
  ]);
}

// ═══════════════════════════════════════════════════════════
// MAIN CALCULATOR
// ═══════════════════════════════════════════════════════════

export function parsePrescriptionDrugs(
  prescriptionText: string,
  patientWeight: number
): DrugCalculation[] {
  if (!prescriptionText || patientWeight <= 0) return [];

  const results: DrugCalculation[] = [];
  const lines = prescriptionText.split(/(?:\n|\d+\.\s+)/).filter(Boolean);
  const processedKeys = new Set<string>();

  for (const line of lines) {
    const drug = findDrugMatch(line);
    if (!drug) continue;

    // Skip diluent descriptor lines (e.g. "SF0,9% 100ml para diluir...")
    if (isDiluentLine(line)) {
      continue;
    }

    // Skip subcutaneous sliding scales and intermittent boluses (not continuous IV)
    if (isSubcutaneousNonContinuous(line) || isIntermittentBolus(line)) {
      continue;
    }

    // Determine phase label (e.g. ATAQUE vs MANUTENÇÃO)
    const isManutencao = /\b(?:manuten[cç][aã]o|cont[ií]nu[oa])\b/i.test(line);
    const isAtaque = !isManutencao && /\b(?:ataque|bolus|r[aá]pido)\b/i.test(line);
    const phaseLabel = isAtaque ? 'ATAQUE' : isManutencao ? 'MANUTENÇÃO' : undefined;

    const uniqueKey = phaseLabel ? `${drug.names[0]}_${phaseLabel}` : drug.names[0];
    if (processedKeys.has(uniqueKey)) continue;
    processedKeys.add(uniqueKey);

    const calc: DrugCalculation = {
      drugName: drug.names[0],
      phaseLabel,
      rawPrescriptionText: line.trim(),
      ampoleContent: drug.ampolePresentation,
      saltToBaseFactor: drug.saltToBaseFactor,
      activePrinciplePerAmpole_mg: drug.ampoleTotalDrug_mg * drug.saltToBaseFactor,
      numberOfAmpoles: 1,
      dilutionVolumeMl: 0,
      totalVolumeMl: 0,
      finalConcentration_mcgPerMl: 0,
      patientWeight,
      unit: drug.unit,
      therapeuticRange: drug.therapeuticRangeLabel,
      warnings: [],
      calculable: false,
    };

    const ampoles = extractAmpoles(line);
    if (ampoles) {
      calc.numberOfAmpoles = ampoles;
    }

    const diluteAmount = extractDiluteAmount(line);
    const drugAmount = extractDrugAmount(line);
    const dilutionVol = extractDilutionVolume(line);

    let totalDrug_mg: number;
    if (diluteAmount) {
      totalDrug_mg = diluteAmount;
      if (drug.ampoleTotalDrug_mg > 0) {
        calc.numberOfAmpoles = Math.max(1, Math.round(diluteAmount / drug.ampoleTotalDrug_mg));
      }
    } else if (drugAmount) {
      totalDrug_mg = drugAmount.amount * (drugAmount.volume > 0 ? calc.numberOfAmpoles : 1);
    } else {
      totalDrug_mg = drug.ampoleTotalDrug_mg * calc.numberOfAmpoles;
    }

    const activePrinciple_mg = totalDrug_mg * drug.saltToBaseFactor;
    calc.activePrinciplePerAmpole_mg = drug.ampoleTotalDrug_mg * drug.saltToBaseFactor;

    if (dilutionVol) {
      const ampoleVol = drug.ampoleVolume_ml * calc.numberOfAmpoles;
      calc.dilutionVolumeMl = dilutionVol;
      calc.totalVolumeMl = dilutionVol + ampoleVol;
      calc.finalConcentration_mcgPerMl =
        (activePrinciple_mg * drug.mgToUnitFactor) / calc.totalVolumeMl;
      calc.calculable = true;
    } else {
      const stdDilution = drug.standardDilution;
      if (calc.numberOfAmpoles === stdDilution.ampoles) {
        const ampoleVol = drug.ampoleVolume_ml * stdDilution.ampoles;
        calc.dilutionVolumeMl = stdDilution.diluentVolumeMl;
        calc.totalVolumeMl = stdDilution.diluentVolumeMl + ampoleVol;
        calc.finalConcentration_mcgPerMl =
          (activePrinciple_mg * drug.mgToUnitFactor) / calc.totalVolumeMl;
        calc.calculable = true;
        calc.warnings.push('Diluição não especificada pelo médico; usando diluição padrão OSID.');
      } else if (drug.concentratedDilutions) {
        const match = drug.concentratedDilutions.find(
          (d) => d.ampoles === calc.numberOfAmpoles
        );
        if (match) {
          const ampoleVol = drug.ampoleVolume_ml * match.ampoles;
          calc.dilutionVolumeMl = match.diluentVolumeMl;
          calc.totalVolumeMl = match.diluentVolumeMl + ampoleVol;
          calc.finalConcentration_mcgPerMl =
            (activePrinciple_mg * drug.mgToUnitFactor) / calc.totalVolumeMl;
          calc.calculable = true;
          calc.warnings.push(`Usando diluição ${match.label} OSID (${match.ampoles} ampolas).`);
        }
      }

      if (!calc.calculable) {
        calc.warnings.push(
          `Diluição não especificada e número de ampolas (${calc.numberOfAmpoles}) não corresponde a nenhuma diluição padrão OSID. Valor não calculável — IA deve interpretar.`
        );
      }
    }

    const { primary: flowRate, secondary: secFlowRate } = extractFlowRates(line);
    const durationMinutes = extractMinutesDuration(line);

    if (flowRate) {
      calc.flowRate_mlPerH = flowRate;

      if (calc.calculable && calc.finalConcentration_mcgPerMl > 0) {
        const unitPerHour = calc.finalConcentration_mcgPerMl * flowRate;

        if (drug.isPerHour) {
          calc.dosePerTimeUnit = Math.round(unitPerHour * 100) / 100;
          if (drug.perKg) {
            calc.dosePerKgPerTimeUnit = Math.round((unitPerHour / patientWeight) * 1000) / 1000;
            calc.isWithinRange =
              calc.dosePerKgPerTimeUnit >= drug.therapeuticRange[0] &&
              calc.dosePerKgPerTimeUnit <= drug.therapeuticRange[1];
          } else {
            calc.isWithinRange =
              unitPerHour >= drug.therapeuticRange[0] &&
              unitPerHour <= drug.therapeuticRange[1];
          }
        } else {
          const unitPerMin = unitPerHour / 60;
          calc.dosePerTimeUnit = Math.round(unitPerMin * 100) / 100;
          if (drug.perKg) {
            calc.dosePerKgPerTimeUnit = Math.round((unitPerMin / patientWeight) * 1000) / 1000;
            calc.isWithinRange =
              calc.dosePerKgPerTimeUnit >= drug.therapeuticRange[0] &&
              calc.dosePerKgPerTimeUnit <= drug.therapeuticRange[1];
          } else {
            calc.isWithinRange =
              unitPerMin >= drug.therapeuticRange[0] &&
              unitPerMin <= drug.therapeuticRange[1];
          }
        }

        // Secondary flow rate (e.g. maintenance step 2: 8 mL/h for 18h)
        if (secFlowRate) {
          calc.secondaryFlowRate_mlPerH = secFlowRate;
          const secUnitPerHour = calc.finalConcentration_mcgPerMl * secFlowRate;
          if (drug.isPerHour) {
            calc.secondaryDosePerTimeUnit = Math.round(secUnitPerHour * 100) / 100;
            if (drug.perKg) {
              calc.secondaryDosePerKgPerTimeUnit = Math.round((secUnitPerHour / patientWeight) * 1000) / 1000;
            }
          } else {
            const secUnitPerMin = secUnitPerHour / 60;
            calc.secondaryDosePerTimeUnit = Math.round(secUnitPerMin * 100) / 100;
            if (drug.perKg) {
              calc.secondaryDosePerKgPerTimeUnit = Math.round((secUnitPerMin / patientWeight) * 1000) / 1000;
            }
          }
        }
      }
    } else if (durationMinutes && calc.calculable) {
      // Dose given over X minutes (e.g. Amiodarona 150mg in 10 min)
      const doseGiven = activePrinciple_mg * drug.mgToUnitFactor;
      const ratePerMin = doseGiven / durationMinutes;
      calc.dosePerTimeUnit = Math.round(ratePerMin * 100) / 100;
      calc.warnings.push(`Infundir em ${durationMinutes} minutos (dose: ${activePrinciple_mg} mg / ${durationMinutes} min = ${calc.dosePerTimeUnit} ${drug.unit.includes('mg') ? 'mg' : 'mcg'}/min).`);
      calc.isWithinRange = true;
    } else {
      calc.warnings.push('Velocidade de infusão (mL/h) não especificada pelo médico.');
    }

    results.push(calc);
  }

  return results;
}

// ═══════════════════════════════════════════════════════════
// PROMPT FORMATTER — Generates "VERIFIED MATH FACTS" section
// ═══════════════════════════════════════════════════════════

export function formatDrugFactsForPrompt(calculations: DrugCalculation[]): string {
  if (calculations.length === 0) {
    return '';
  }

  let output = `
═══════════════════════════════════════════════════════════
FATOS MATEMÁTICOS PRÉ-CALCULADOS (VALORES VERIFICADOS PELO SISTEMA)
═══════════════════════════════════════════════════════════
ATENÇÃO: Os valores abaixo foram calculados automaticamente pelo sistema com precisão aritmética.
NÃO recalcule estes valores. Use-os diretamente como fonte de verdade na sua avaliação.
Se houver discrepância entre o que o médico declarou e o valor calculado, sinalize na avaliação.

`;

  for (const calc of calculations) {
    const title = calc.phaseLabel
      ? `${calc.drugName.toUpperCase()} [${calc.phaseLabel}]`
      : calc.drugName.toUpperCase();

    output += `• ${title}:\n`;
    output += `  - Prescrição do médico: "${calc.rawPrescriptionText}"\n`;
    output += `  - Apresentação: ${calc.ampoleContent}\n`;

    if (calc.saltToBaseFactor < 1.0) {
      output += `  - FATOR SAL→BASE: ×${calc.saltToBaseFactor} (${calc.numberOfAmpoles} amp = ${(calc.activePrinciplePerAmpole_mg * calc.numberOfAmpoles).toFixed(1)} mg princípio ativo)\n`;
    }

    if (calc.calculable) {
      output += `  - Volume total da solução: ${calc.totalVolumeMl.toFixed(0)} mL\n`;
      output += `  - Concentração REAL: ${calc.finalConcentration_mcgPerMl.toFixed(2)} ${calc.unit.includes('UI') ? 'UI' : (calc.unit.includes('mg') ? 'mg' : 'mcg')}/mL\n`;

      if (calc.flowRate_mlPerH !== undefined) {
        output += `  - Velocidade: ${calc.flowRate_mlPerH} mL/h\n`;

        if (calc.dosePerTimeUnit !== undefined) {
          const timeSuffix = calc.unit.includes('/h') ? '/h' : '/min';
          const baseUnit = calc.unit.includes('UI') ? 'UI' : (calc.unit.includes('mg') ? 'mg' : 'mcg');
          output += `  - Dose calculada: ${calc.dosePerTimeUnit} ${baseUnit}${timeSuffix}`;
          if (calc.dosePerKgPerTimeUnit !== undefined) {
            output += ` = ${calc.dosePerKgPerTimeUnit} ${calc.unit} (para ${calc.patientWeight} kg)`;
          }
          output += '\n';
        }

        // Secondary flow rate (e.g. maintenance phase 2)
        if (calc.secondaryFlowRate_mlPerH !== undefined && calc.secondaryDosePerTimeUnit !== undefined) {
          const timeSuffix = calc.unit.includes('/h') ? '/h' : '/min';
          const baseUnit = calc.unit.includes('UI') ? 'UI' : (calc.unit.includes('mg') ? 'mg' : 'mcg');
          output += `  - Segunda fase (${calc.secondaryFlowRate_mlPerH} mL/h): ${calc.secondaryDosePerTimeUnit} ${baseUnit}${timeSuffix}`;
          if (calc.secondaryDosePerKgPerTimeUnit !== undefined) {
            output += ` = ${calc.secondaryDosePerKgPerTimeUnit} ${calc.unit}`;
          }
          output += '\n';
        }

        output += `  - Faixa terapêutica: ${calc.therapeuticRange}\n`;

        if (calc.isWithinRange !== undefined) {
          output += `  - Status: ${calc.isWithinRange ? 'DENTRO DA FAIXA ✅' : 'FORA DA FAIXA ⚠️'}\n`;
        }
      } else {
        output += `  - Faixa terapêutica: ${calc.therapeuticRange}\n`;
      }
    } else {
      output += `  - ⚠️ NÃO CALCULÁVEL pelo sistema — use seu julgamento clínico para avaliar a dose.\n`;
      output += `  - Faixa terapêutica de referência: ${calc.therapeuticRange}\n`;
    }

    if (calc.warnings.length > 0) {
      output += `  - Alertas: ${calc.warnings.join('; ')}\n`;
    }

    output += '\n';
  }

  return output;
}
