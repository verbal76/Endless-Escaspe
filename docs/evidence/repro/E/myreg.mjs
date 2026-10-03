import { register } from 'node:module';
register('./myloader.mjs', import.meta.url);
