// Testlerdeki `env` ve `exports` (cloudflare:workers) tipleri: Worker'ın
// kendi Env tipi ve ana modülü. `wrangler types` üretmek yerine elle, çünkü
// tek ihtiyaç bu iki satır.
import type { Env as WorkerEnv } from '../src/index';

declare global {
  namespace Cloudflare {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- tip birleştirme için gerekli
    interface Env extends WorkerEnv {}
    interface GlobalProps {
      mainModule: typeof import('../src/index');
    }
  }
}
