import fs from 'fs';
import path from 'path';

export function getStaticData(filename: string) {
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', filename);
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading static data ${filename}:`, error);
    return null;
  }
}
