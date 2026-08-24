import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '../lib/ai/drug-math-validator';

const case1 = `
1. Repouso absoluto com cabeceira elevada 60° + Monitorização multiparamétrica contínua + Quantificação de Débito urinário e balanço hídrico
2. Dieta branda hipossódica
3. Cateter nasal, 3 ml/h, se SatO2 < 92%
4. Furosemida 40mg/2ml, aplicar 2 ampolas, EV, de 12/12 horas
5. Enoxaparina 86 mg, aplicar subcutâneo, 12/12 horas
6. Dipirona 1g, EV lento, 6/6h se dor ou febre 
7. Ondasetrona 8 mg, EV, se nausea ou vomito
8. Insulina regular, subcutâneo, se HGT > 180, aplicação conforme protocolo institucional
9. SG25%, aplicar 8 ampolas EV, se HGT < 70
`;

const case2 = `
Prescrição do dia na UPA:
1. Repouso relativo no leito + Monitorização multiparamétrica + glicemia de 1/1h + Solicito potássio e gasometria a cada 2-4 horas + eletrolitos 12/12
2. Dieta zero, até resulução da CAD, após, dieta branda para diabético
3. SRL 1000 ml, correr EV em BIC a 250ml/h, contínuo, até HGT < 300
4. Insulina regular 100 UI, diluir 100 UI em 100 ml de SF0,9%, correr EV em BIC a 7ml/h, contínuo até resolução da CAD.
5. SF0,9% 100 ml, para diluir insulina regular 100UI
6. KCl19,1% 10ml, diluir 10 ml em 100ml de SF0 0,9%, correr EV em BIC a 25ml/h, contínuo durante tratamento, suspender se K > 5
7. SF0,9% 100 ml, para diluir KCl19,1% 10 ml
8. Dipirona 1g, EV lento, 6/6h se dor ou febre 
9. Ondasetrona 8 mg, EV, se nausea ou vomito
10. Insulina regular, subcutâneo, se HGT > 180, aplicação conforme protocolo institucional
11. SG25%, aplicar 8 ampolas EV, se HGT < 70
12. SG5% 1000 ml, correr EV em BIC a 250ml/h, contínuo, iniciar quanto HGT < 300
13. Insulina regular, subcutâneo, 6 UI após o café, após o almoço e após o jantar, inciar após resolução da CAD
14. Insulina NPH, subcutâneo, 12 UI 6:00 e 6 UI 22:00, inciar após resolução da CAD
`;

const case3 = `
1. Repouso relativo no leito + Monitorização multiparamétrica contínua + eletrólitos diários
2. Dieta branda conforme aceitação
3. SRL 250 ml, a critério médico
4. Dipirona 1g, EV lento, 6/6h se dor ou febre 
5. Ondasetrona 8 mg, EV, se nausea ou vomito
6. Insulina regular, subcutâneo, se HGT > 180, aplicação conforme protocolo institucional
7. SG25%, aplicar 8 ampolas EV, se HGT < 70
8. Amiodarona 150mg/3ml, diluir 150 mg em 100 ml de SG5%, correr em BIC em 10 minutos - ATAQUE
9. Amiodarona 150mg/3ml, diluir 900 mg em 250 ml de SG5%, correr em BIC em a 16 ml/h por 6 horas, após, a 8 ml/h por 18 horas, iniciar após término do Ataque - MANUTENÇÃO
`;

console.log('=== CASO 1: LEITO 1 (FA / Insuficiência Cardíaca, 86 kg) ===');
const calcs1 = parsePrescriptionDrugs(case1, 86);
console.log(formatDrugFactsForPrompt(calcs1));

console.log('=== CASO 2: LEITO 2 (CAD, 70 kg) ===');
const calcs2 = parsePrescriptionDrugs(case2, 70);
console.log(formatDrugFactsForPrompt(calcs2));

console.log('=== CASO 3: LEITO 4 (Taquiarritmia / Amiodarona, 75 kg) ===');
const calcs3 = parsePrescriptionDrugs(case3, 75);
console.log(formatDrugFactsForPrompt(calcs3));
