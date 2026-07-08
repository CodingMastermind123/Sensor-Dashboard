import * as config from './config.js';
import { createServer } from './server.js';

const { server, close } = createServer(config);

server.listen(config.PORT, () => {
  console.log(`[backend] listening on :${config.PORT} (source=${config.SERIAL_SOURCE})`);
});

process.on('SIGINT', async () => {
  console.log('\n[backend] shutting down...');
  await close();
  process.exit(0);
});
