import { UnsupportedMediaTypeException } from '@nestjs/common';

const TEXT_MIMES = new Set(['text/markdown', 'text/plain']);
const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  if (TEXT_MIMES.has(mimeType)) return buffer.toString('utf8');
  if (mimeType === PDF_MIME) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PDFParse } = require('pdf-parse') as typeof import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    return result.text;
  }
  if (mimeType === DOCX_MIME) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mammoth = require('mammoth') as typeof import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  throw new UnsupportedMediaTypeException(`Unsupported material type: ${mimeType}`);
}
