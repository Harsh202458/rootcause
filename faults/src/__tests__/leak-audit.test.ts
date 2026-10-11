import { test } from 'node:test';
import * as assert from 'node:assert';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

const scenariosDir = path.join(__dirname, '../../scenarios');

const CATEGORIES = [
  'bad_code_deploy',
  'dropped_index',
  'memory_leak',
  'wrong_config',
  'dependency_down',
  'redis_unavailable',
  'connection_pool_exhaustion',
  'slow_dependency',
  'long_running_lock',
  'bad_migration'
];

const FORBIDDEN_WORDS = [
  ...CATEGORIES,
  'fault',
  'chaos',
  'inject',
  'test'
];

test('Anti-Cheat Leak Audit', async (t) => {
  const files = fs.readdirSync(scenariosDir).filter(f => f.endsWith('.yaml'));
  
  for (const file of files) {
    await t.test(`Audit ${file}`, () => {
      const content = fs.readFileSync(path.join(scenariosDir, file), 'utf8');
      const scenario = yaml.parse(content);

      // 1. Assert scenario ID doesn't contain forbidden words
      const lowerId = scenario.id.toLowerCase();
      for (const word of FORBIDDEN_WORDS) {
        assert.ok(!lowerId.includes(word.toLowerCase()), `Scenario ID ${scenario.id} leaks word: ${word}`);
      }

      // 1b. The alert is the one part of a scenario the agent reads. It may
      // only state a symptom, using the names of the real Prometheus rules.
      const ALERT_NAMES = ['HighErrorRate', 'HighP95Latency', 'ServiceDown', 'HighMemory'];
      assert.ok(ALERT_NAMES.includes(scenario.alert.name), `Alert name ${scenario.alert.name} is not a generic symptom alert`);
      const alertText = `${scenario.alert.name} ${scenario.alert.description}`.toLowerCase();
      const HINTS = [
        ...CATEGORIES,
        ...CATEGORIES.map(c => c.replace(/_/g, ' ')),
        'deploy', 'index', 'leak', 'config', 'pool', 'lock', 'migration', 'redis', 'cache',
        'database', 'query', 'queries', 'dependency', 'column', 'connection'
      ];
      for (const hint of HINTS) {
        assert.ok(!alertText.includes(hint), `Alert for ${scenario.id} hints at the cause: "${hint}"`);
      }

      // 2. Assert inject steps don't expose category info in env vars or labels
      for (const step of scenario.inject) {
        if (step.params && step.params.env) {
           for (const [key, value] of Object.entries(step.params.env)) {
             const lowerVal = String(value).toLowerCase();
             for (const word of FORBIDDEN_WORDS) {
               assert.ok(!lowerVal.includes(word.toLowerCase()), `Env var ${key}=${value} leaks word: ${word}`);
             }
           }
        }
      }

      // 3. Assert decoy deploy summaries don't mention faults
      if (scenario.deploys) {
        for (const deploy of scenario.deploys) {
          const lowerSummary = deploy.summary.toLowerCase();
          for (const word of ['fault', 'chaos', 'inject', 'test']) {
            assert.ok(!lowerSummary.includes(word), `Deploy summary "${deploy.summary}" leaks word: ${word}`);
          }
          // specific check against categories in summary
          for (const cat of CATEGORIES) {
            assert.ok(!lowerSummary.includes(cat.toLowerCase()), `Deploy summary "${deploy.summary}" leaks category: ${cat}`);
          }
        }
      }
    });
  }
});
