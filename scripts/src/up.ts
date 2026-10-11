import { compose } from '@rootcause/faults';

compose(['up', '-d', '--build']);
console.log('System is starting. Run "npm run seed" the first time.');
