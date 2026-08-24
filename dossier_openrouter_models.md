# Dossiê Técnico: Modelos, Sistemas e Precificação OpenRouter
## EmergeMed — Guia Estratégico de Seleção de IA (v2 — Agosto/2026)

---

## 1. Visão Geral da Arquitetura de IA

O **EmergeMed** foi projetado para atuar como um copiloto clínico de alta precisão em ambientes de emergência (UPA). Para garantir alta disponibilidade, respostas semânticas atualizadas e o menor custo por atendimento, o sistema utiliza uma **arquitetura híbrida e resiliente baseada no OpenRouter** integrada via SDK OpenAI-compatible (`@openrouter/ai-sdk-provider`).

### Princípios Fundamentais do Sistema:
1. **Zero Single-Point-of-Failure**: Nenhum modelo ou provedor único pode derrubar a consulta do médico.
2. **Custo-Efetividade Dinâmica**: O sistema monitora a precificação da OpenRouter em tempo real e reordena a prioridade dos modelos mais pesados.
3. **Especialização por Tarefa**: Modelos de raciocínio profundo para condutas complexas e geração de questões, modelos ultra-rápidos ou gratuitos para feedback e tarefas leves.

---

## 2. Catálogo Detalhado de Modelos Utilizados no Projeto

> **Preços verificados via API OpenRouter em 24/08/2026** (`https://openrouter.ai/api/v1/models`)

### 2.1. Modelos Primários (Ativos em Cascata)

| Modelo OpenRouter | Função no Sistema | Ctx | Input/M | Output/M | Blended¹ | Desempenho & Especialidade |
| :--- | :--- | :--- | ---: | ---: | ---: | :--- |
| **`openai/gpt-5.6-luna`** | Raciocínio Clínico (Questões, Prescrição, Plantão, Evolução Adversa) | 1.05M | $0.20 | $1.20 | $0.70 | **Excepcional (9.8/10)**: Alta precisão em diagnósticos diferenciais, condutas baseadas em evidências e posologias. Instrução-following superior da OpenAI — essencial para JSON médico estruturado. |
| **`minimax/minimax-m3`** | 1º Fallback p/ Questões, Prescrição, Plantão; 3º p/ Feedback | 1.05M | $0.30 | $1.20 | $0.75 | **Excelente em PT-BR (9.5/10)**: MoE 428B/23B ativos. SWE-bench Pro 59.0%. Atenção esparsa (MSA) eficiente p/ contexto longo. Alta aderência à terminologia médica brasileira (CID-10/11). |
| **`deepseek/deepseek-v4-flash-0731`** | Primário p/ Feedback e Análise de Capítulos; 2º Fallback p/ tarefas pesadas | 1.31M | $0.14 | $0.28 | $0.21 | **Muito Bom & Ultra Rápido (9.0/10)**: MoE 284B/13B ativos. GA (produção). DeepSWE 54.4%, Terminal Bench 82.7%. O maior contexto (1.31M) e menor custo da lista. Suporta thinking modes. |
| **`deepseek/deepseek-v4-pro`** | Análise Epidemiológica & Relatórios Semanais | 1.05M | $0.53 | $1.05 | $0.79 | **Raciocínio Profundo (9.7/10)**: MoE 1.6T/49B ativos. O mais poderoso para correlação multi-prontuário e geração de aulas clínicas. Desconto de 70% ativo. |
| **`thinkingmachines/inkling-small:free`** | Fallback Gratuito de Emergência (todas as funções) | 262K | $0.00 | $0.00 | $0.00 | **Surpreendente para Gratuito (9.2/10)**: MoE 276B/12B ativos. SWE-bench Verified 80.2%, GPQA Diamond 89.5%. Apache 2.0. Supera o antigo Gemma 4 e Llama 3.3 em todos os benchmarks. |

### 2.2. Modelos de Referência (Não Usados Ativamente)

| Modelo | Motivo da Não-Inclusão | Melhor Alternativa |
| :--- | :--- | :--- |
| `nvidia/nemotron-3-ultra-550b:free` | Substituído por Inkling Small :free (benchmarks superiores) | `thinkingmachines/inkling-small:free` |
| `google/gemini-2.5-flash` | Modelo de 2025, desatualizado | `deepseek/deepseek-v4-flash-0731` |
| `meta-llama/llama-3.3-70b-instruct:free` | Modelo de 2025, desatualizado | `thinkingmachines/inkling-small:free` |
| `openai/gpt-4o-mini` | Legacy, substituído pela família GPT-5.6 | `deepseek/deepseek-v4-flash-0731` |
| `google/gemma-4-31b-it:free` | Inferior ao Inkling Small :free em benchmarks | `thinkingmachines/inkling-small:free` |
| `qwen/qwen3.6-35b-a3b` | Substituído pela série Qwen 3.7+ | Não utilizado |
| `deepseek/deepseek-chat` | V4 Flash 0731 é mais recente e eficiente | `deepseek/deepseek-v4-flash-0731` |

> ¹ *Custo Blended = (Input × 0.5 + Output × 0.5) — estimativa com ratio 50/50 input:output.*

---

## 3. Arquitetura de Cascatas por Função

### 3.1. Geração de Questões Clínicas (`generateQuestionsWithAI`) ⭐ **MAIS IMPORTANTE**
* **Cascata**: `gpt-5.6-luna` → `minimax-m3` → `deepseek-v4-flash-0731` → `inkling-small:free`
* **Justificativa**: Recebe input massivo (texto completo de capítulos) e exige output longo (JSON com vinhetas, opções, explicações, prescrições ideais). **Precisão farmacológica absoluta** obrigatória — Luna é primário por ter o melhor instrução-following do mercado.
* **Capacidade**: Geração de questões múltipla-escolha, prescrição (completa/imediata) e ventilador mecânico com rigor de residência médica.

### 3.2. Avaliação de Prescrição (`evaluatePrescriptionWithAI`)
* **Cascata**: `gpt-5.6-luna` → `minimax-m3` → `deepseek-v4-flash-0731` → `inkling-small:free`
* **Justificativa**: Avaliação de condutas médicas escritas pelo médico contra gabarito e texto de referência. Exige **zero alucinação farmacológica** — uma droga com dose errada pode invalidar a avaliação inteira.
* **Capacidade**: Score 0-10, pontos fortes, melhorias, feedback detalhado, prescrição ideal, error tags por competência.

### 3.3. Simulação de Plantão (`generatePlantaoBedQuestionsWithAI`)
* **Cascata**: `gpt-5.6-luna` → `minimax-m3` → `deepseek-v4-flash-0731` → `inkling-small:free`
* **Justificativa**: Gera narrativa clínica contínua de 4 questões por leito. Exige coerência narrativa + precisão farmacológica entre Q1 (triagem) e Q4 (prescrição/ventilador).

### 3.4. Evolução Adversa (`generateAdverseEvolutionQuestionWithAI`)
* **Cascata**: `gpt-5.6-luna` → `deepseek-v4-flash-0731` → `inkling-small:free`
* **Justificativa**: Gera apenas 1 questão bônus baseada nos erros do médico. Input menor (vinheta + erros), output menor. Luna permanece primário pela criticidade clínica da simulação de descompensação.

### 3.5. Feedback Geral e de Plantão (`generateGeneralFeedbackWithAI`)
* **Cascata**: `deepseek-v4-flash-0731` → `gpt-5.6-luna` → `minimax-m3` → `inkling-small:free`
* **Justificativa**: Gera texto em Markdown (não JSON). O DeepSeek V4 Flash 0731 lidera porque o output é texto livre sem exigência de parsing estruturado, economizando ~70% no custo. Luna é fallback caso V4 Flash falhe.

### 3.6. Análise de Capítulo Customizado (`analyzeCustomChapterWithAI`)
* **Cascata**: `deepseek-v4-flash-0731` → `gpt-5.6-luna` → `inkling-small:free`
* **Justificativa**: Tarefa de extração de metadados (título, categoria, scores) de texto colado. Output JSON simples com campos fixos — não exige raciocínio médico profundo. DeepSeek V4 Flash 0731 é ideal pelo custo ultra-baixo.

---

## 4. Engenharia de Seleção e Resiliência do Sistema

O projeto conta com dois mecanismos em nível de código criados especificamente para a gestão do OpenRouter:

### A. Seleção Dinâmica por Precificação em Tempo Real (`src/lib/ai/dynamic-models.ts`)
Para evitar estouros de orçamento em requisições mais pesadas (condutas clínicas), o sistema consulta a API pública de preços do OpenRouter (`https://openrouter.ai/api/v1/models`) a cada hora:

```typescript
// Lógica de cálculo dinâmico:
// 1. Ordena os modelos principais (Luna, MiniMax M3, DeepSeek V4 Pro) pelo menor custo atual.
// 2. Insere o DeepSeek V4 Flash 0731 imediatamente antes de qualquer modelo que for mais caro que o V4 Pro.
```

**Benefício**: Se a OpenAI baixar o preço do Luna ou a MiniMax fizer uma promoção de tokens, o aplicativo passa automaticamente a usar o modelo mais barato como prioridade #1 sem necessidade de redeploy!

### B. Cascata Não-Bloqueante de Fallbacks (`lib/ai/openrouter.ts → executeWithModelCascade`)
O wrapper `executeWithModelCascade` intercepta erros de HTTP da API da OpenRouter (como `429 Too Many Requests` ou `503 Service Unavailable`):

```typescript
// Se o modelo 0 falha no streaming ou na geração:
// O sistema tenta o modelo 1, modelo 2... até obter uma resposta válida.
// Cada modelo tem retries com backoff exponencial (400ms → 800ms).
```

**Benefício**: O médico nunca se depara com um erro de "Servidor Fora do Ar" durante a consulta.

---

## 5. Mural de Dica de Escolha Rápida

```
┌──────────────────────────────────────────────────────────────────┐
│           📋 MURAL DE ESCOLHA RÁPIDA DE MODELOS                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ❓ O que você precisa?                                          │
│                                                                  │
│  🔴 Precisão clínica MÁXIMA (questões, prescrição, plantão)?     │
│     → GPT-5.6 Luna ($0.70/M)                                   │
│     Motivo: Melhor instrução-following, zero alucinação          │
│     farmacológica, JSON estruturado confiável.                   │
│                                                                  │
│  🟠 Fallback para tarefas críticas com bom PT-BR?               │
│     → MiniMax M3 ($0.75/M)                                     │
│     Motivo: SWE-bench Pro 59.0%, excelente em português,        │
│     atenção esparsa para contexto longo (1.05M).                │
│                                                                  │
│  🟡 Feedback, análise de capítulos, tarefas de custo?           │
│     → DeepSeek V4 Flash 0731 ($0.21/M)                         │
│     Motivo: 85% da qualidade do Luna por 1/3 do preço.          │
│     Ideal para output Markdown (não exige JSON parsing).         │
│                                                                  │
│  🟢 Relatórios semanais / correlação multi-prontuário?           │
│     → DeepSeek V4 Pro ($0.79/M)                                │
│     Motivo: 49B ativos, melhor raciocínio analítico profundo.    │
│     Contexto 1M = cabe semana inteira de atendimentos.           │
│                                                                  │
│  🆓 Fallback gratuito de emergência?                            │
│     → Inkling Small :free ($0.00/M)                             │
│     Motivo: SWE-bench Verified 80.2%, Apache 2.0.               │
│     O melhor modelo gratuito do OpenRouter (agosto/2026).        │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  📊 REGRA DE OURO:                                              │
│  ┌────────────────────────────────────────────────┐              │
│  │ Precisão > Custo → GPT-5.6 Luna               │              │
│  │ PT-BR + Precisão → MiniMax M3                  │              │
│  │ Volume > Precisão → V4 Flash 0731              │              │
│  │ Orçamento zero → Inkling Small :free           │              │
│  │ Análise profunda → DeepSeek V4 Pro             │              │
│  └────────────────────────────────────────────────┘              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Análise de Custos vs. Benefícios no OpenRouter

### Estimativa de Custos por 1.000 Atendimentos Médicos:

| Atividade | Tokens Estimados | Modelo (Cascata) | Custo Est. |
| :--- | ---: | :--- | ---: |
| **Geração de Questões** | ~2M tokens | `gpt-5.6-luna` (80%) / `minimax-m3` (15%) / `v4-flash-0731` (5%) | **~$1.24** |
| **Avaliação de Prescrição** | ~1M tokens | `gpt-5.6-luna` (85%) / `minimax-m3` (15%) | **~$0.61** |
| **Plantão (4 Leitos × Questões)** | ~800K tokens | `gpt-5.6-luna` (80%) / `minimax-m3` (20%) | **~$0.57** |
| **Evolução Adversa** | ~300K tokens | `gpt-5.6-luna` (90%) / `v4-flash-0731` (10%) | **~$0.20** |
| **Feedback Geral / Plantão** | ~800K tokens | `v4-flash-0731` (80%) / `gpt-5.6-luna` (20%) | **~$0.25** |
| **Análise de Capítulos Custom** | ~500K tokens | `v4-flash-0731` (95%) / `gpt-5.6-luna` (5%) | **~$0.11** |
| **TOTAL ESTIMADO** | **~5.4M tokens** | **Sistema Multi-Modelo Otimizado** | **~$2.98 / 1K atendimentos** |

### Benefícios Chave:
1. **Modelos 2026 GA**: Todos os modelos ativos são GA (produção) de 2026 — nenhum modelo legacy de 2025.
2. **Fallback gratuito de qualidade**: Inkling Small :free (SWE-bench 80.2%) substitui Gemma 4 e Llama 3.3 com desempenho vastamente superior.
3. **Custo otimizado por tarefa**: Feedback e análise usam V4 Flash ($0.21/M), enquanto precisão clínica usa Luna ($0.70/M).
4. **PT-BR nativo**: MiniMax M3 garante terminologia médica brasileira correta quando Luna falha.

---

## 7. Recomendação de Evolução Futura

1. **Monitorar Gemini 3.7 Flash**: Lançado em 13/08/2026, potencialmente superior ao V4 Flash 0731 para feedback. Aguardar estabilização de preço e disponibilidade no OpenRouter.
2. **Avaliar Inkling (975B) pago**: Se o :free atingir limites de taxa em produção, a versão paga ($0.45/$1.20) com 1.05M de contexto é uma opção viável como fallback robusto.
3. **Log de Utilização por Provedor**: Registrar no Supabase qual modelo da cascata respondeu cada requisição para acompanhar a taxa de acerto dos tiers gratuito vs pagos.
4. **Métricas de Latência**: Expandir `dynamic-models.ts` para considerar latência média (tokens/segundo) fornecida pela OpenRouter, além do preço por token.
