import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Helper to load .env.local file
function loadEnvLocal() {
  const envPath = path.join(projectRoot, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const val = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    });
  }
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase URL ou Chave API não encontradas em .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('\n==================================================');
  console.log('🚀 EmergeMed — Upload do Cache Local para o Supabase');
  console.log('==================================================\n');

  const cachePath = path.join(projectRoot, 'scripts', 'index_cache.json');
  if (!fs.existsSync(cachePath)) {
    console.error('❌ Arquivo index_cache.json não encontrado!');
    process.exit(1);
  }

  const cacheData = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
  const chapterKeys = Object.keys(cacheData).map(Number).sort((a, b) => a - b);

  if (chapterKeys.length === 0) {
    console.warn('⚠️ O cache local index_cache.json está vazio.');
    process.exit(0);
  }

  console.log(`📡 Conectado ao Supabase: ${supabaseUrl}`);
  console.log(`📦 Capítulos no Cache Local: ${chapterKeys.length}\n`);

  // Prepare records for Supabase
  const records = chapterKeys.map((num) => {
    const item = cacheData[num] || cacheData[String(num)];
    const wordCount = item.word_count || (item.content ? item.content.split(/\s+/).filter(Boolean).length : 0);
    return {
      chapter_id: item.chapter_id || num,
      content: item.content || '',
      word_count: wordCount,
      updated_at: item.updated_at || new Date().toISOString(),
    };
  });

  // Batch size of 10 to avoid payload limits
  const BATCH_SIZE = 10;
  const totalBatches = Math.ceil(records.length / BATCH_SIZE);
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < totalBatches; i++) {
    const batch = records.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const batchCapNums = batch.map((r) => r.chapter_id).join(', ');

    console.log(`[Lote ${i + 1}/${totalBatches}] 📤 Enviando Capítulos (${batchCapNums})...`);

    try {
      const { error } = await supabase
        .from('chapter_contents')
        .upsert(batch, { onConflict: 'chapter_id' });

      if (error) {
        console.error(`   ❌ Erro no Lote ${i + 1}: ${error.message}`);
        failCount += batch.length;
      } else {
        console.log(`   ✅ Lote ${i + 1} salvo no Supabase com sucesso! (${batch.length} capítulos)`);
        successCount += batch.length;
      }
    } catch (err) {
      console.error(`   ❌ Exceção no Lote ${i + 1}: ${err.message || err}`);
      failCount += batch.length;
    }
  }

  console.log('\n==================================================');
  console.log(`📊 RESUMO DO UPLOAD PARA O SUPABASE:`);
  console.log(`  - Capítulos Enviados com Sucesso: ${successCount}`);
  if (failCount > 0) {
    console.log(`  - Capítulos com Falha: ${failCount}`);
  }
  console.log('==================================================\n');
}

main().catch((err) => {
  console.error('❌ Erro fatal durante o upload:', err);
  process.exit(1);
});
