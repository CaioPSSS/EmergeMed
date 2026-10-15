# Dossiê Técnico: Modelos, Sistemas e Precificação OpenRouter
## EmergeMed — Guia Estratégico de Seleção de IA (v3 — Outubro/2026)

---

## 1. Visão Geral da Arquitetura de IA

O **EmergeMed** opera como um simulador e copiloto de alta fidelidade para treinamento em Medicina de Emergência (UPAs 24h e SAMU). Para oferecer alta disponibilidade, respostas ultrarrápidas na sala de emergência e um custo sustentável por usuário, o sistema adota uma **arquitetura híbrida de múltiplos modelos e múltiplos níveis de latência** integrada via OpenRouter API.

### Princípios de Engenharia de IA:
1. **Zero Single-Point-of-Failure (Cascata com Failover Ativo):** Se um modelo sofrer throttling (`429`), erro de serviço (`503`), ou retornar resposta vazia, a cascata avança de forma transparente para o modelo subsequente (`executeWithModelCascade`).
2. **Separação Rígida por Perfil de Custo e Latência:**
   - Tarefas interativas síncronas de voz: latência de ~1,8 a 2,5 segundos com modelos de extração direta (`xiaomi/mimo-v2.6-flash`).
   - Raciocínio clínico e geração de casos JSON: precisão farmacológica inegociável (`openai/gpt-6-luna`).
   - Preceptoria e síntese de capítulos extensos: raciocínio denso com contexto longo (`deepseek/deepseek-v4.1-flash`).
   - Povoamento assíncrono noturno: modo lote com 50% de desconto (`openai/gpt-6-luna:batch`).
3. **Busca Web Apenas Sob Dúvida (revisado em out/2026):** As chamadas clínicas continuam com o capítulo injetado e SEM busca incondicional (evita latência >15s). A experiência mostrou, porém, que sem nenhuma busca o avaliador transformava divergências legítimas entre protocolos em "erros" (ex.: gluconato de cálcio 30 mL — dose do UKKA e do próprio capítulo de PCR do livro — punida como "tripla dose"). Agora o avaliador declara `disputedItems` e só esses itens são revisados por uma segunda chamada com o server tool `openrouter:web_search`.

---

## 2. Catálogo Oficial de Modelos (Geração Setembro/Outubro 2026)

| Modelo OpenRouter | Perfil no Sistema | Janela Ctx | Input/1M | Output/1M | Blended (50/50) | Latência Média | Especialidade Clínica & Comportamento |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | :--- |
| **`openai/gpt-6-luna`** | `CLINICAL_CORE`, `CLINICAL_EVALUATION` | 1.05M | **$0.10** | **$0.50** | **$0.30** | ~6 a 10s | **Padrão-Ouro de Raciocínio Clínico:** Alta fidelidade a esquemas JSON estritos, excelente aderência posológica (mcg/kg/min, diluições, volumes) e calibração pedagógica da residência médica. |
| **`openai/gpt-6-luna:batch`** | `NIGHTLY_BATCH_PIPELINE` | 1.05M | **$0.05** | **$0.25** | **$0.15** | Assíncrono (24h) | **50% de Desconto para Povoamento:** Mesma inteligência de ponta do Luna para gerar centenas de casos de leito e questões com custo marginal quase zero. |
| **`xiaomi/mimo-v2.6-flash`** | `PRESCRIPTION_FAST_FORMAT`, `DOCUMENT_EXTRACTION` | 1.05M | **$0.10** | **$0.28** | **$0.19** | **~1,8 a 2,5s** | **Ultrarrápido & Sem Tokens de Pensamento Ocultos:** Arquitetura MoE (309B/15B ativos). Retorna o texto formatado diretamente no campo `content`. Perfeito para pós-processamento de voz e correção fonética em tempo real. |
| **`deepseek/deepseek-v4.1-flash`** | `CLINICAL_FEEDBACK`, Fallback Clínico | 1.05M | **$0.0336** | **$1.188** | **$0.61** | ~7 a 12s | **#1 em Saúde e Academia no OpenRouter:** Arquitetura CED (Causal Encoder-Decoder). Excepcional para análise textual densa de capítulos inteiros e relatórios pedagógicos de preceptoria. |
| **`deepseek/deepseek-v4-pro-0813`** | Fallback de Avaliação Clínica | 1.05M | **$0.2495** | **$0.7484** | **$0.49** | ~14s | **MoE de Grande Escala:** 1.6T parâmetros. Excelente para correlações diagnósticas complexas e diagnósticos sindrômicos difíceis. |
| **`deepseek/deepseek-v4-flash-0731`** | Fallback Geral de Alta Velocidade | 1.05M | **$0.0128** | **$0.768** | **$0.39** | ~6s | MoE 284B/13B ativos. Versão GA anterior para contingência geral. |

---

## 3. Roteador de Tarefas (`lib/ai/model-router.ts`)

A lógica de roteamento está centralizada em `AI_TASK_PROFILES`:

```typescript
export const AI_TASK_PROFILES = {
  // Geração de casos e testes: alta fidelidade JSON e farmacologia precisa da UPA
  CLINICAL_CORE: [
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-flash-0731',
    'minimax/minimax-m3',
  ],

  // Avaliação de condutas, prescrições e sequenciamento de leitos
  CLINICAL_EVALUATION: [
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4.1-flash',
    'deepseek/deepseek-v4-pro-0813',
    'deepseek/deepseek-v4-flash-0731',
  ],

  // Preceptoria geral e passagem de plantão da sala vermelha (Markdown longo com livro)
  CLINICAL_FEEDBACK: [
    'deepseek/deepseek-v4.1-flash',
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4-flash-0731',
  ],

  // Extração e estruturação de capítulos de PDF / texto bruto
  DOCUMENT_EXTRACTION: [
    'xiaomi/mimo-v2.6-flash',
    'deepseek/deepseek-v4.1-flash',
    'openai/gpt-6-luna',
  ],

  // Formatação rápida e padronização de prescrição ditada por voz
  PRESCRIPTION_FAST_FORMAT: [
    'xiaomi/mimo-v2.6-flash',
    'openai/gpt-6-luna',
    'deepseek/deepseek-v4.1-flash',
  ],
} as const;
```

---

## 4. Lições Técnicas Críticas & Armadilhas Superadas

### 4.1. O Fenômeno dos Tokens de Raciocínio (DeepSeek vs Xiaomi)
* **O Problema:** No OpenRouter, determinados modelos com modo de pensamento ativo (como `deepseek/deepseek-v4.1-flash`) colocam o texto gerado na propriedade `message.reasoning` (ou `message.thought`), deixando `message.content` como `null` ou string vazia quando não há resposta formal de chat.
* **Impacto:** Aplicações que consomem apenas `response.choices[0]?.message?.content` recebiam `null`, acionando fallbacks silenciosos ou aparentando travamento de tela.
* **Solução:**
  1. A rota de formatação ultrarrápida (`PRESCRIPTION_FAST_FORMAT`) foi migrada para `xiaomi/mimo-v2.6-flash`, que escreve diretamente no `content` em **1,8 segundos**, sem latência de reasoning.
  2. Em `lib/ai/openrouter.ts`, o parser agora inspeciona:
     ```typescript
     const rawContent = message?.content || (message as any)?.reasoning || (message as any)?.thought || '';
     ```
  3. Se o conteúdo for nulo ou menor que 5 caracteres, lança-se uma exceção formal para que o `executeWithModelCascade` avance imediatamente para o próximo modelo.

### 4.2. Eliminação de Plugins Web em Prompts de Livro
* Modelos que recebiam `{ plugins: [{ id: 'web', max_results: 3 }] }` sofriam penalidade de 10 a 20 segundos de latência para buscar fontes na web, além de importar condutas de guidelines internacionais que divergiam do livro da UPA e do REMUME.
* A remoção do plugin garantiu tempo de resposta 65% mais rápido e 100% de aderência ao texto didático.

### 4.3. Retorno Controlado da Busca: "Verificação Sob Dúvida" (out/2026)
* **Problema observado:** sem busca, os prompts ainda afirmavam "total autonomia para consultar UpToDate", e o modelo respondia de memória com falsa autoridade. Divergências legítimas (ex.: cálcio 10 mL vs 30 mL na hipercalemia — o próprio livro traz as duas doses em capítulos diferentes) viravam "erro", e o gerador de complicação transformava essa crítica em PCR iatrogênica.
* **Solução:**
  1. O avaliador recebe princípios de bom senso (`CLINICAL_JUDGMENT_PRINCIPLES`): pluralidade de protocolos, fidelidade aos dados do caso e honestidade sobre a dúvida.
  2. Itens que ele pretende punir como moderado/crítico sem certeza vão para `disputedItems`.
  3. Somente nesses casos, `verifyDisputedEvaluationWithSearch` faz uma chamada síncrona com `tools: [{ type: 'openrouter:web_search', parameters: { engine: 'auto' } }]` e reescreve a avaliação (`aceito_por_protocolo` / `erro_confirmado` / `inconclusivo`), registrando fontes em `verification`.
  4. O plugin `web` está descontinuado no OpenRouter e é rejeitado (HTTP 422) no Batch, assim como `:online` e engines orquestradas (exa/firecrawl/parallel). Server tools nativos (`openrouter:web_search`) funcionam na API se suportados pelo provedor, mas a estratégia de verificação pós-lote síncrona em `check-batch-status` (via `verifyDisputedEvaluationWithSearch`) oferece transparência total, sem risco de rejeição 422 na submissão do lote.
* **Custo/latência:** zero quando não há disputa (caso comum); uma chamada extra com busca por prescrição disputada.

---

## 5. Simulação Financeira da Pipeline em Lote (Batch)

Com o modelo `openai/gpt-6-luna:batch`:
* Preço por 1 milhão de tokens de entrada: **$0.05 USD**
* Preço por 1 milhão de tokens de saída: **$0.25 USD**

### Custo Médio por Item Gerado:
* **1 Leito de Plantão Completo (2 estágios, vinheta, exames, gabarito):**
  - Prompt: ~1.200 tokens = \$0.000060
  - Output: ~800 tokens = \$0.000200
  - **Custo total por leito:** **~$0.00026 USD** (menos de 3 centésimos de centavo de dólar!).
* **1 Questão de Múltipla Escolha (5 alternativas, caso, justificativa):**
  - Prompt: ~900 tokens = \$0.000045
  - Output: ~450 tokens = \$0.000112
  - **Custo total por questão:** **~$0.000157 USD**.

### Capacidade com os Hard Caps Institucionais (Geração Noturna):
* **Teto Diário (\$0.15 USD):**
  - Permite gerar até **~350 leitos completos** OU **~950 questões** por dia!
* **Teto Mensal (\$0.90 USD):**
  - Permite pré-popular todo o currículo da UPA com milhares de casos validados por uma fração de um cafezinho.
* **Isenção de Correções de Plantão:**
  - As correções de leito e feedbacks do Modo Plantão (`plantao_correction`) **não consomem nem são limitadas** por esses tetos de geração. O discriminador `batch_kind` em `batch_generation_ledger` garante isolamento rigoroso entre a pré-população noturna e os testes dos alunos.
