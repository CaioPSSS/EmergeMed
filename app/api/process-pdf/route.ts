import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CHAPTERS_DATA } from '@/lib/chapters-data';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('pdf') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo PDF foi enviado.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Dynamically import pdf-parse
    const pdfParseModule = await import('pdf-parse');
    const pdfParse = (pdfParseModule as any).default || pdfParseModule;
    const parsedPdf = await pdfParse(buffer);
    const fullText = parsedPdf.text || '';

    if (!fullText || fullText.length < 100) {
      return NextResponse.json({ error: 'Não foi possível extrair o texto do PDF.' }, { status: 400 });
    }

    // Skip Table of Contents offset (TOC is usually in the first 30,000 characters)
    const bodyStartIndex = fullText.length > 50000 ? 25000 : 0;
    const bodyText = fullText.slice(bodyStartIndex);

    const recordsToInsert: {
      chapter_id: number;
      content: string;
      word_count: number;
      updated_at: string;
    }[] = [];

    for (let i = 0; i < CHAPTERS_DATA.length; i++) {
      const cap = CHAPTERS_DATA[i];
      const nextCap = CHAPTERS_DATA[i + 1];

      // Match chapter number in body text (ignoring initial TOC)
      const regexCurrent = new RegExp(`Capítulo\\s*${cap.number}\\b`, 'i');
      let matchPos = bodyText.search(regexCurrent);

      // If not found in body text, search full text
      let textToUse = bodyText;
      let offset = bodyStartIndex;
      if (matchPos === -1) {
        matchPos = fullText.search(regexCurrent);
        textToUse = fullText;
        offset = 0;
      }

      if (matchPos !== -1) {
        let matchEnd = textToUse.length;
        if (nextCap) {
          const regexNext = new RegExp(`Capítulo\\s*${nextCap.number}\\b`, 'i');
          const nextIdx = textToUse.indexOf(regexNext.source, matchPos + 50);
          if (nextIdx > matchPos) {
            matchEnd = nextIdx;
          }
        }

        const chapterText = textToUse.substring(matchPos, matchEnd).trim();
        const wordCount = chapterText.split(/\s+/).length;

        recordsToInsert.push({
          chapter_id: cap.id,
          content: chapterText.slice(0, 50000), // Protect against huge payloads
          word_count: wordCount,
          updated_at: new Date().toISOString(),
        });
      } else {
        // Fallback: chunk fullText proportionally
        const approxLength = Math.floor(fullText.length / CHAPTERS_DATA.length);
        const excerpt = fullText.slice(i * approxLength, (i + 1) * approxLength);

        recordsToInsert.push({
          chapter_id: cap.id,
          content: excerpt,
          word_count: excerpt.split(/\s+/).length,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // B12: Batch upsert all 122 chapters at once to prevent serverless timeout
    const { error: upsertErr } = await supabase
      .from('chapter_contents')
      .upsert(recordsToInsert, { onConflict: 'chapter_id' });

    if (upsertErr) {
      throw upsertErr;
    }

    return NextResponse.json({
      success: true,
      chaptersSaved: recordsToInsert.length,
      totalPdfPages: parsedPdf.numpages,
    });
  } catch (error: any) {
    console.error('Error processing PDF:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao processar PDF do livro.' },
      { status: 500 }
    );
  }
}
