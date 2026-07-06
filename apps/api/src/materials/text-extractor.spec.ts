import { readFileSync } from 'fs';
import { join } from 'path';
import { extractText } from './text-extractor';

describe('extractText', () => {
  it('passes through markdown/plain text buffers as utf8', async () => {
    const text = await extractText(Buffer.from('# Reading\nMaterials matter.'), 'text/markdown');
    expect(text).toBe('# Reading\nMaterials matter.');
  });

  it('throws UnsupportedMediaType for unknown mime types', async () => {
    await expect(extractText(Buffer.from('MZ'), 'application/x-msdownload')).rejects.toThrow(
      'Unsupported material type',
    );
  });

  it('extracts text from a PDF buffer', async () => {
    const pdf = readFileSync(join(__dirname, '../../test/fixtures/hello.pdf'));
    const text = await extractText(pdf, 'application/pdf');
    expect(text).toContain('Hello LMS');
  });

  it('extracts text from a DOCX buffer', async () => {
    const docx = readFileSync(join(__dirname, '../../test/fixtures/hello.docx'));
    const text = await extractText(
      docx,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(text).toContain('Hello DOCX LMS');
  });
});
