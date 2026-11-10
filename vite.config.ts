import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * 개발 서버(npm run dev)에서만: 브라우저가 data/compare/out 의 비교용 파일을 읽게 한다.
 * 이 컴퓨터(localhost) 안에서만 오가고, 빌드 결과물에는 들어가지 않는다.
 *   GET /__compare/list         → 크롭이 있는 사진 이름 목록
 *   GET /__compare/file/<파일>  → 파일 내용 (이름은 글자·숫자·-·_·. 만 허용)
 */
function compareFiles(): Plugin {
  const dir = join(__dirname, 'data', 'compare', 'out');
  return {
    name: 'compare-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__compare', (req, res) => {
        const url = req.url ?? '/';
        if (url === '/list') {
          const stems = existsSync(dir)
            ? readdirSync(dir)
                .filter((f) => f.endsWith('.left.rgb'))
                .map((f) => f.slice(0, -'.left.rgb'.length))
            : [];
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(stems));
          return;
        }
        const m = /^\/file\/([\w.-]+)$/.exec(url);
        const path = m && !m[1].includes('..') ? join(dir, m[1]) : null;
        if (!path || !existsSync(path)) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.end(readFileSync(path));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), compareFiles()],
});
