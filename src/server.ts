import { createApp } from './app';
import { env } from './config/env';

const app = createApp();

const server = app.listen(env.PORT, '0.0.0.0', () => {
  console.log(`Server berjalan di http://localhost:${env.PORT}`);
});

function shutdown(signal: string) {
  console.log(`${signal} diterima, menutup server...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
