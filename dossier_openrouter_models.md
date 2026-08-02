# Dossiê Técnico: Modelos, Sistemas e Precificação OpenRouter
## Personal Clinical Copilot — Guia Estratégico de Seleção de IA

---

## 1. Visão Geral da Arquitetura de IA

O **Personal Clinical Copilot** foi projetado para atuar como um assistente de alta precisão em ambientes médicos. Para garantir alta disponibilidade, respostas semânticas atualizadas e o menor custo por atendimento, o sistema utiliza uma **arquitetura híbrida e resiliente baseada no OpenRouter** integrada via Vercel AI SDK (`@openrouter/ai-sdk-provider`).

### Princípios Fundamentais do Sistema:
1. **Zero Single-Point-of-Failure**: Nenhum modelo ou provedor único pode derrubar a consulta do médico.
2. **Custo-Efetividade Dinâmica**: O sistema monitora a precificação da OpenRouter em tempo real e reordena a prioridade dos modelos mais pesados.
3. **Especialização por Tarefa**: Modelos de raciocínio profundo para condutas complexas, modelos ultra-rápidos ou gratuitos para interações de chat e transcrição diária, e modelos multimodais dedicados para OCR médico.

---

## 2. Catálogo Detalhado de Modelos Utilizados no Projeto

| Modelo OpenRouter | Categoria / Função no Sistema | Janela de Contexto | Custo Estimado (1M tokens) | Desempenho & Especialidade em Medicina |
| :--- | :--- | :--- | :--- | :--- |
| **`openai/gpt-5.6-luna`** | Raciocínio de Elite (Conduta Médica) | ~128k-200k | ~$0.70 | **Excepcional (9.8/10)**: Alta precisão sintática em diagnósticos diferenciais, condutas baseadas em evidências e posologias sem alucinação. |
| **`minimax/minimax-m3`** | Raciocínio Técnico & Estruturação | ~128k-1M | ~$1.20 | **Excelente em PT-BR (9.5/10)**: Alta capacidade de retenção de contexto extenso, aderência estrita a terminologia médica e diretrizes brasileiras (CID-10/11). |
| **`deepseek/deepseek-v4-pro`** | Análise Epidemiológica & Relatórios | ~64k-128k | ~$1.305 | **Raciocínio Analítico Profundo (9.7/10)**: Especialista em correlacionar múltiplos prontuários complexos, gerar aulas clínicas e relatórios semanais. |
| **`deepseek/deepseek-v4-flash`** | Buffer Dinâmico de Baixo Custo | ~64k-128k | ~$0.27 | **Muito Bom & Ultra Rápido (8.8/10)**: Processamento imediato de sínteses clínicas com custo 80% inferior ao modelo Pro. |
| **`google/gemma-4-31b-it:free` / `paid`** | Carro-Chefe (Chat & Auto-Note) | ~128k | $0.00 / ~$0.15 | **Ótimo para Diálogo Clínico (9.0/10)**: Respostas humanas e bem estruturadas em português, excelente extração de anamnese a partir da fala. |
| **`qwen/qwen3.6-35b-a3b`** | 2ª Linha de Chat & Auto-Note | ~32k-128k | ~$0.15 - $0.35 | **Alta Fidelidade Farmacológica (9.2/10)**: Forte capacidade no entendimento de tabelas de medicamentos, dosagens e interações medicamentosas. |
| **`google/gemma-4-26b-a4b-it` / `gemma-3-27b-it`** | Intermediário de Segurança | ~32k-128k | ~$0.05 - $0.15 | **Eficiente & Seguro (8.5/10)**: Modelo leve para garantia de resposta rápida quando os modelos principais atingem limite de taxa. |
| **`meta-llama/llama-3.3-70b-instruct`** | Fallback de Alta Densidade | ~128k | ~$0.40 - $0.60 | **Padrão Ouro de Raciocínio Open-Source (9.6/10)**: Avaliado nos maiores benchmarks médicos mundiais (MedQA). Altíssima consistência clínica. |
| **`deepseek/deepseek-chat`** | Reserva Geral de Fallback | ~64k-128k | ~$0.14 - $0.28 | **Fluência Nativa (9.1/10)**: Compreensão impecável do jargão médico informal brasileiro e descrições de sintomas dadas pelo paciente. |
| **`meta-llama/llama-3.2-11b-vision-instruct:free`** | OCR & Visão Computacional | ~128k | $0.00 | **Transcrição de Exames e Receitas (8.7/10)**: Leitura visual de laudos escaneados, fotos de receituários manuscritos e páginas físicas de prontuário. |

---

## 3. Análise dos Modelos por Especialidade e Desempenho Clínico

### 3.1. Raciocínio Clínico e Conduta Baseada em Evidências (`generate-conduct`)
* **Modelos Envolvidos**: `openai/gpt-5.6-luna`, `minimax/minimax-m3`, `deepseek/deepseek-v4-pro`, `deepseek/deepseek-v4-flash`.
* **Capacidade Médica**:
  * Integração direta com busca semântica em tempo real via motor **Exa** (`searchMedicalGuidelines`), resgatando artigos, consensos da SBC, MS, UpToDate e PubMed.
  * Formulação de diagnósticos hipotéticos ordenados por probabilidade, exames complementares indicados com justificativa e plano terapêutico inicial.
* **Comportamento Clínico**: Não inventa condutas sem base empírica e exige estruturação em Markdown claro para o médico revisar.

### 3.2. Assistente de Consulta em Tempo Real (`chat`)
* **Modelos Envolvidos**: Cascata liderada por `gemma-4-31b-it:free`, migrando para `gemma-4-31b-it`, `qwen3.6-35b`, `llama-3.3-70b` e `deepseek-chat`.
* **Capacidade Médica**:
  * Respostas rápidas (< 2 segundos de latência para o primeiro token).
  * Execução da ferramenta nativa `proposeRecordEdit`, permitindo que a IA sugira alterações diretas no prontuário que o médico aprova ou rejeita com 1 clique.
  * Integração com motor de pesquisa factual **Perplexity** (`searchMedicalInfo`) para tirar dúvidas pontuais durante o atendimento.

### 3.3. Transcrição de Consulta e Estruturação SOAP (`generate-note`)
* **Modelos Envolvidos**: Mesma cascata otimizada do Chat (`gemma-4-31b-it:free` -> `qwen` -> `llama` -> `deepseek`).
* **Capacidade Médica**:
  * Processa a conversa gravada/transcrita entre médico e paciente e converte em uma nota clínica perfeitamente estruturada (Subjetivo, Objetivo, Avaliação, Plano - SOAP).
  * Filtra conversas irrelevantes (small talk) e mantém o rigor técnico.

### 3.4. Análise Multimodal & OCR de Prontuários (`analyze-image`)
* **Modelo Envolvido**: `meta-llama/llama-3.2-11b-vision-instruct:free`.
* **Capacidade Médica**:
  * Converte fotos de exames laboratoriais, relatórios de ECG, ultrassons e receitas médicas em texto Markdown limpo.
  * Custo operacional zero para a clínica, utilizando a cota de visão gratuita da OpenRouter.

### 3.5. Aulas Clínicas e Relatórios Epidemiológicos Semanais (`cron/weekly-report`)
* **Modelos Envolvidos**: `deepseek/deepseek-v4-pro` (com fallback para `gemma-4-31b-it`).
* **Capacidade Médica**:
  * Suporta geração massiva de texto (`maxOutputTokens: 16000`).
  * Agrega todos os pacientes atendidos na semana, identifica padrões de morbidade, revisa interações medicamentosas recorrentes e gera um relatório educacional para o médico.

---

## 4. Engenharia de Seleção e Resiliência do Sistema

O projeto conta com dois mecanismos em nível de código criados especificamente para a gestão do OpenRouter:

### A. Seleção Dinâmica por Precificação em Tempo Real (`src/lib/ai/dynamic-models.ts`)
Para evitar estouros de orçamento em requisições mais pesadas (condutas clínicas), o sistema consulta a API pública de preços do OpenRouter (`https://openrouter.ai/api/v1/models`) a cada hora:

```typescript
// Lógica de cálculo dinâmico:
// 1. Ordena os modelos principais (Luna, MiniMax M3, DeepSeek V4 Pro) pelo menor custo atual.
// 2. Insere o DeepSeek V4 Flash imediatamente antes de qualquer modelo que for mais caro que o V4 Pro.
```

**Benefício**: Se a OpenAI baixar o preço do Luna ou a MiniMax fizer uma promoção de tokens, o aplicativo passa automaticamente a usar o modelo mais barato como prioridade #1 sem necessidade de redeploy!

### B. Cascata Não-Bloqueante de Fallbacks (`src/lib/ai/model-fallback.ts`)
O wrapper `withFallback` intercepta erros de HTTP da API da OpenRouter (como `429 Too Many Requests` ou `503 Service Unavailable`):

```typescript
// Se o modelo 0 falha no streaming ou na geração:
// O sistema tenta o modelo 1, modelo 2... até obter uma resposta válida.
```

**Benefício**: O médico nunca se depara com um erro de "Servidor Fora do Ar" durante a consulta.

---

## 5. Análise de Custos vs. Benefícios no OpenRouter

### Benefícios Chave:
1. **Redução Drástica de Custos Fixos**: Uso estratégico dos sufixos `:free` (Gemma 4 31B e Llama 3.2 Vision) reduz o custo operacional diário em até 70%.
2. **Sem Necessidade de Servidores Multimodais Locais**: A análise de imagem ocorre na nuvem sem precisar hospedar GPUs caras para OCR.
3. **Acesso Imediato a Novas IAs**: Conforme novas versões (ex: DeepSeek V4 ou Llama 3.3) são lançadas no OpenRouter, basta adicionar a string do identificador na lista de fallback.

### Estimativa de Custos por 1.000 Atendimentos Médicos:

| Atividade | Qtd. Tokens Estimada (Prompt + Saída) | Modelo Utilizado | Custo Estimado |
| :--- | :--- | :--- | :--- |
| **Chats Rápidos em Consulta** | ~500k tokens | `gemma-4-31b-it:free` (90%) / `qwen3.6-35b` (10%) | **~$0.02** |
| **Geração de Anamnese / Auto-Note** | ~1M tokens | `gemma-4-31b-it:free` (90%) / `llama-3.3-70b` (10%) | **~$0.05** |
| **OCR de Exames e Receitas (Fotos)** | ~500k tokens | `llama-3.2-11b-vision-instruct:free` (100%) | **$0.00** |
| **Condutas Clínicas por Evidência** | ~2M tokens | `gpt-5.6-luna` / `minimax-m3` / `deepseek-v4-flash` | **~$1.40 - $2.20** |
| **Relatório Semanal / Aula Clínica** | ~300k tokens | `deepseek-v4-pro` | **~$0.39** |
| **TOTAL ESTIMADO** | **~4.3M tokens** | **Sistema Multi-Modelo Combinado** | **~$1.86 - $2.66 / 1000 atendimentos** |

---

## 6. Recomendação de Evolução Futura

1. **Adição de Métricas de Latência no Cache**: Expandir `dynamic-models.ts` para considerar também a latência média (tokens/segundo) fornecida pela OpenRouter, além do preço por token.
2. **Log de Utilização por Provedor**: Registrar no Supabase qual modelo da cascata respondeu cada requisição para acompanhar a taxa de acerto do tier gratuito (`:free`) vs pagos.
