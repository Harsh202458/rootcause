// One image runs every service; SERVICE selects the entry point.
const service = process.env.SERVICE;
const known = ['gateway', 'orders', 'inventory', 'payments', 'loadgen'];

if (!service || !known.includes(service)) {
  console.error(`SERVICE must be one of: ${known.join(', ')}`);
  process.exit(1);
}
require(`./${service}`);
