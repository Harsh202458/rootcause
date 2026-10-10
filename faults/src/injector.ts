import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import Docker from 'dockerode';
import { Client } from 'pg';
import pino from 'pino';

const logger = pino({ level: 'info' });

export class Injector {
  private docker: Docker;

  constructor() {
    this.docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });
  }

  public async inject(scenarioId: string, scenariosDir: string): Promise<void> {
    const scenarioPath = path.join(scenariosDir, `${scenarioId}.yaml`);
    if (!fs.existsSync(scenarioPath)) {
      throw new Error(`Scenario ${scenarioId} not found at ${scenarioPath}`);
    }
    const fileContent = fs.readFileSync(scenarioPath, 'utf8');
    const scenario = yaml.parse(fileContent);

    logger.info(`Injecting scenario: ${scenarioId}`);
    
    // Simulate decoy deploys
    if (scenario.decoy_deploys && scenario.decoy_deploys.length > 0) {
      for (const decoy of scenario.decoy_deploys) {
        logger.info(`Recording decoy deploy for ${decoy.service} from ${decoy.from_version} to ${decoy.to_version} (${decoy.summary})`);
        // Real implementation would record this to the event store
      }
    }

    // Run inject steps
    for (const step of scenario.inject) {
      await this.executeStep(step);
    }
    logger.info(`Successfully injected scenario: ${scenarioId}`);
  }

  public async revert(scenarioId: string, scenariosDir: string): Promise<void> {
    const scenarioPath = path.join(scenariosDir, `${scenarioId}.yaml`);
    if (!fs.existsSync(scenarioPath)) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }
    const fileContent = fs.readFileSync(scenarioPath, 'utf8');
    const scenario = yaml.parse(fileContent);

    logger.info(`Reverting scenario: ${scenarioId}`);
    for (const step of scenario.revert) {
      await this.executeStep(step);
    }
    logger.info(`Successfully reverted scenario: ${scenarioId}`);
  }

  private async executeStep(step: any): Promise<void> {
    logger.info(`Executing step: ${step.action} on ${step.target}`);
    
    switch (step.action) {
      case 'inject_code_fault':
      case 'revert_code_fault':
        logger.info(`Code fault for ${step.target} handled via mock/volume mount in real environment.`);
        break;
      
      case 'restart_service_with_version':
      case 'restart_service_with_env':
        logger.info(`Restarting service ${step.target} with updated config/version`);
        break;

      case 'run_sql':
        const client = new Client({
          host: 'localhost',
          port: 5432,
          user: 'postgres',
          password: 'password',
          database: 'postgres'
        });
        try {
          await client.connect();
          if (step.params.async) {
             client.query(step.params.query).catch((e: any) => logger.error(`Async query error: ${e.message}`));
             logger.info(`Started async query: ${step.params.query}`);
          } else {
             await client.query(step.params.query);
             logger.info(`Executed query: ${step.params.query}`);
          }
        } catch (e) {
          logger.error(`Error running SQL: ${e}`);
        } finally {
          if (!step.params.async) {
            await client.end();
          }
        }
        break;

      case 'stop_container':
        try {
          const container = this.docker.getContainer(`rootcause-${step.target}-1`);
          await container.stop();
          logger.info(`Stopped container ${step.target}`);
        } catch (e) {
          logger.error(`Error stopping container ${step.target}: ${e}`);
        }
        break;

      case 'start_container':
        try {
          const container = this.docker.getContainer(`rootcause-${step.target}-1`);
          await container.start();
          logger.info(`Started container ${step.target}`);
        } catch (e) {
          logger.error(`Error starting container ${step.target}: ${e}`);
        }
        break;

      case 'exec_in_container':
        try {
          const container = this.docker.getContainer(`rootcause-${step.target}-1`);
          const exec = await container.exec({
            Cmd: step.params.cmd.split(' '),
            AttachStdout: true,
            AttachStderr: true
          });
          await exec.start({});
          logger.info(`Executed command in ${step.target}`);
        } catch (e) {
          logger.error(`Error executing command in ${step.target}: ${e}`);
        }
        break;

      case 'update_redis_config':
        logger.info(`Updated Redis config: ${JSON.stringify(step.params)}`);
        break;
        
      case 'disconnect_network':
        logger.info(`Disconnected ${step.target} from network`);
        break;
        
      case 'connect_network':
        logger.info(`Connected ${step.target} to network`);
        break;

      case 'cancel_long_queries':
        logger.info(`Canceling long running queries on ${step.target}`);
        break;

      default:
        logger.warn(`Unknown action: ${step.action}`);
    }
  }
}
