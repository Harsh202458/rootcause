import { pbkdf2Sync } from 'crypto';
import { SERVICE, VERSION } from './kit';

// Features that shipped after 1.4.0, by service and version. A deploy changes
// SERVICE_VERSION, which is how a new release reaches a running container.
const RELEASES: Record<string, Record<string, string[]>> = {
  gateway: {
    '1.4.1': ['couponValidation'],
    '1.4.2': ['responseAudit']
  },
  orders: {
    '1.4.1': ['pricingRules'],
    '1.4.2': ['auditTrail'],
    '1.4.3': ['requestSigning'],
    '1.4.4': ['transactionalInsert'],
    '1.4.5': ['pooledLookup']
  },
  inventory: {
    '1.4.1': ['variantLookup'],
    '1.4.2': ['viewHistory'],
    '1.4.3': ['priceFormatting'],
    '1.4.4': ['transactionalReserve']
  }
};

const enabled = new Set(RELEASES[SERVICE]?.[VERSION] ?? []);

export function has(feature: string): boolean {
  return enabled.has(feature);
}

const retained: Buffer[] = [];

/** Keeps a copy of a payload for later inspection. */
export function retain(bytes: number): void {
  retained.push(Buffer.alloc(bytes, 1));
}

/** Derives a key for roughly the given number of milliseconds of CPU time. */
export function deriveKey(ms: number): void {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    pbkdf2Sync('payload', 'salt', 2000, 32, 'sha256');
  }
}
