import { createProvider } from './providers';
import { runAgent, AgentConfig } from './loop';
import { executeTool } from './tools/registry';
import dotenv from 'dotenv';
import pino from 'pino';

dotenv.config();

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

async function main() {
  const args = process.argv.slice(2);
  let providerName = 'gemini';
  let alertDesc = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--provider' && i + 1 < args.length) {
      providerName = args[i + 1]!;
      i++;
    } else if (args[i] === '--alert' && i + 1 < args.length) {
      alertDesc = args[i + 1]!;
      i++;
    }
  }

  if (!alertDesc) {
    logger.info('No --alert provided, fetching currently firing alerts...');
    try {
      const result = await executeTool('list_alerts', {});
      const alerts = result.data as Array<any>;
      if (alerts && alerts.length > 0) {
        const a = alerts[0];
        alertDesc = `[${a.severity}] ${a.alertname}: ${a.summary} - ${a.description}`;
        logger.info(`Picked alert: ${alertDesc}`);
      } else {
        logger.info('No firing alerts found.');
        process.exit(0);
      }
    } catch (err: any) {
      logger.error('Failed to list alerts:', err.message);
      process.exit(1);
    }
  }

  logger.info(`Initializing ${providerName} provider...`);
  let provider;
  try {
    provider = createProvider(providerName as any);
  } catch (err: any) {
    logger.error(err.message);
    process.exit(1);
  }

  const config: AgentConfig = { provider };

  logger.info('Starting investigation loop...');
  const result = await runAgent(alertDesc, config);

  if (result.report) {
    logger.info('=== INVESTIGATION REPORT ===');
    console.log(JSON.stringify(result.report, null, 2));
  } else {
    logger.warn('Agent failed to produce a report.');
    if (result.error) logger.error(`Error: ${result.error}`);
  }

  logger.info(`Investigation finished in ${result.steps} steps. Tokens used: ${result.totalTokens}. Duration: ${result.durationMs}ms.`);
  if (result.hitLimit) {
    logger.warn(`Agent hit limit: ${result.hitLimit}`);
  }

  process.exit(0);
}

main();
