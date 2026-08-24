import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '../lib/ai/drug-math-validator';

console.log('═══════════════════════════════════════════════════════════');
console.log('TESTING DRUG MATH VALIDATOR (OSID / ROMA STANDARDS)');
console.log('═══════════════════════════════════════════════════════════\n');

// Test Case 1: Leito 3 Q4 - Noradrenalina 1 ampola a 12 mL/h em paciente de 80kg
const test1 = `
1. Repouso absoluto no leito, cabeceira elevada a 30 graus.
2. Dieta zero.
3. Hemitartarato de norepinefrina 8mg/4ml, diluir 1 ampola em 246ml de SG5% (16mcg/ml), EV em BIC a 12ml/h.
4. Cloridrato de dobutamina 250mg/20ml, diluir 1 ampola em 230ml de SG5%, EV em BIC.
5. Ceftriaxona 2g EV 24/24h.
`;

const calcs1 = parsePrescriptionDrugs(test1, 80);
console.log('--- TEST 1: Leito 3 Q4 (Noradrenalina 12 mL/h + Dobutamina sem velocidade) ---');
console.log(JSON.stringify(calcs1, null, 2));

console.log('\n--- FORMATTED PROMPT BLOCK FOR TEST 1 ---');
console.log(formatDrugFactsForPrompt(calcs1));

// Test Case 2: Leito 3 Q3 - Noradrenalina a 30 mL/h em paciente de 80kg
const test2 = `Norepinefrina 8mg/4ml: diluir 1 ampola em 246 ml de SG5%, correr a 30 ml/h em BIC`;
const calcs2 = parsePrescriptionDrugs(test2, 80);
console.log('--- TEST 2: Leito 3 Q3 (Noradrenalina 30 mL/h) ---');
console.log(JSON.stringify(calcs2, null, 2));
console.log('\n--- FORMATTED PROMPT BLOCK FOR TEST 2 ---');
console.log(formatDrugFactsForPrompt(calcs2));

// Test Case 3: Insulina Regular em CAD (70 kg)
const test3 = `Insulina Regular 100 UI em 100 ml de SF 0,9%, correr em BIC a 7 ml/h`;
const calcs3 = parsePrescriptionDrugs(test3, 70);
console.log('--- TEST 3: Insulina Regular em CAD (70 kg, 7 mL/h) ---');
console.log(JSON.stringify(calcs3, null, 2));
console.log('\n--- FORMATTED PROMPT BLOCK FOR TEST 3 ---');
console.log(formatDrugFactsForPrompt(calcs3));

// Test Case 4: Nitroglicerina (Tridil) para EAP / SCA
const test4 = `Tridil 25mg/5ml: diluir 2 ampolas em 240 ml de SG5%, iniciar a 15 ml/h em BIC`;
const calcs4 = parsePrescriptionDrugs(test4, 70);
console.log('--- TEST 4: Tridil (Nitroglicerina 50mg em 250mL total a 15 mL/h) ---');
console.log(JSON.stringify(calcs4, null, 2));
console.log('\n--- FORMATTED PROMPT BLOCK FOR TEST 4 ---');
console.log(formatDrugFactsForPrompt(calcs4));

// Assertions check
let allPassed = true;

// Check Test 1: Nora concentration = 16 mcg/mL (base), dose = 0.04 mcg/kg/min
const nora1 = calcs1.find(c => c.drugName === 'norepinefrina');
if (!nora1 || Math.abs(nora1.finalConcentration_mcgPerMl - 16) > 0.1 || Math.abs(nora1.dosePerKgPerTimeUnit! - 0.04) > 0.01) {
  console.error('❌ FAILED Test 1 Nora calculation! Expected conc=16, dose=0.04. Got:', nora1?.finalConcentration_mcgPerMl, nora1?.dosePerKgPerTimeUnit);
  allPassed = false;
} else {
  console.log('✅ PASSED Test 1: Noradrenalina conc=16 mcg/mL base, dose=0.04 mcg/kg/min (DENTRO DA FAIXA)');
}

// Check Test 1: Dobutamine speed warning
const dobuta1 = calcs1.find(c => c.drugName === 'dobutamina');
if (!dobuta1 || dobuta1.flowRate_mlPerH !== undefined) {
  console.error('❌ FAILED Test 1 Dobuta speed warning! Expected no speed specified.');
  allPassed = false;
} else {
  console.log('✅ PASSED Test 1: Dobutamina identificada com alerta de velocidade não especificada');
}

// Check Test 2: Nora at 30 mL/h = 0.1 mcg/kg/min
const nora2 = calcs2.find(c => c.drugName === 'norepinefrina');
if (!nora2 || Math.abs(nora2.dosePerKgPerTimeUnit! - 0.1) > 0.01) {
  console.error('❌ FAILED Test 2 Nora calculation! Expected dose=0.1. Got:', nora2?.dosePerKgPerTimeUnit);
  allPassed = false;
} else {
  console.log('✅ PASSED Test 2: Noradrenalina a 30 mL/h = 0.1 mcg/kg/min (DENTRO DA FAIXA)');
}

// Check Test 3: Insulin 7 mL/h for 70 kg = 0.1 UI/kg/h
const ins3 = calcs3.find(c => c.drugName === 'insulina regular');
if (!ins3 || Math.abs(ins3.dosePerKgPerTimeUnit! - 0.1) > 0.01) {
  console.error('❌ FAILED Test 3 Insulin calculation! Expected dose=0.1. Got:', ins3?.dosePerKgPerTimeUnit);
  allPassed = false;
} else {
  console.log('✅ PASSED Test 3: Insulina Regular = 0.1 UI/kg/h (DENTRO DA FAIXA CAD)');
}

console.log('\n═══════════════════════════════════════════════════════════');
if (allPassed) {
  console.log('🎉 ALL CLINICAL MATH TESTS PASSED PERFECTLY!');
} else {
  console.log('❌ SOME TESTS FAILED');
}
console.log('═══════════════════════════════════════════════════════════');
