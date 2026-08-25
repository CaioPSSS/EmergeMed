import { parsePrescriptionDrugs, formatDrugFactsForPrompt } from '../lib/ai/drug-math-validator';

const isascoPrescription = `Realizar a cardioversão com ISASCO:
I - Informar
S - Sedoanalgesia → Cetamina 100mg/2ml, diluir 2 ampolas em 16 ml de AD, aplicar 5 ml da solução em flush
A - Ambu a flush rate, sem fazer pressão positiva, apenas se perda do drive
S - Sincronizar o monitor
C - Cardioversão - Com a pá no peito aplicar 200 J sinconizado
O - Observer → Manter pá no peito, avaliando o ritmo e preparado para aplicar desfibrilação se necessário`;

console.log('--- TESTANDO RESPOSTA ISASCO / CETAMINA ---');
const calcs = parsePrescriptionDrugs(isascoPrescription, 80);
console.log('Calculated drugs count:', calcs.length);
console.log('Prompt format text:\n', formatDrugFactsForPrompt(calcs));
