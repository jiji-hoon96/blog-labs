import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The <main> of full-d-google/index.html, so the text matches the other pages.
const body = readFileSync(join(process.cwd(), 'app/body.html'), 'utf8');

export default function Page() {
  return <main dangerouslySetInnerHTML={{ __html: body }} />;
}
