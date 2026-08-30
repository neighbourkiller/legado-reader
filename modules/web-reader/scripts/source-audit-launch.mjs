import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const auditTargetDir = join(
  process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
  'legado-reader',
  'source-audit-target',
)

/**
 * 审计使用独立 Vite 端口和 Cargo target，避免覆盖普通 target/debug 二进制，
 * 也避免测试结束后普通开发客户端仍指向已经关闭的审计服务器。
 */
export function launchSourceAudit(appArgs) {
  return spawnSync('pnpm', [
    'exec', 'tauri', 'dev',
    '--no-watch',
    '--config', 'src-tauri/tauri.audit.conf.json',
    '--', '--', ...appArgs,
  ], {
    cwd: new URL('..', import.meta.url),
    stdio: 'inherit',
    env: {
      ...process.env,
      CARGO_TARGET_DIR: auditTargetDir,
      LEGADO_SOURCE_AUDIT: '1',
    },
  })
}
