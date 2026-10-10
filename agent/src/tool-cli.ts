import { executeTool } from './tools/registry';

async function main() {
  const toolName = process.argv[2];
  const argsString = process.argv[3];
  
  if (!toolName || !argsString) {
    console.error("Usage: npm run tool -- <tool-name> '<json-args>'");
    process.exit(1);
  }
  
  try {
    const args = JSON.parse(argsString);
    const result = await executeTool(toolName, args);
    console.log(JSON.stringify(result, null, 2));
  } catch (e: any) {
    console.error("Error executing tool:", e.message);
    process.exit(1);
  }
}

main();
