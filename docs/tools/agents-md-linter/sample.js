/* Sample for the AGENTS.md and CLAUDE.md Linter (TOOLCHK3, wave18): a small repo that moved from pnpm to npm, renamed
   its deploy target, moved main.ts and upgraded Node, like the Context Drift readme example. Loaded only on click. */
export const SAMPLE = {
  name: 'sample-repo',
  files: {
    'AGENTS.md': `# Agent notes

- Requires Node 18.
- Install with \`pnpm install\`.
- Build: \`npm run buidl\`. Deploy: \`make deploy\`.
- Entry point: \`src/server/main.ts\`
- Test: \`npm test\`. Do not run \`npm run eject\`.

## Example

Put new pages in \`src/pages/your-page.ts\`.
`,
    'CLAUDE.md': `@AGENTS.md
@docs/stlye.md

Run \`make test\` before you commit.
`,
    'package.json': JSON.stringify({ name: 'shop-web', private: true, scripts: { build: 'tsc -p .', dev: 'node dist/main.js', test: 'node --test' }, devDependencies: { typescript: '^5.6.0' } }, null, 2) + '\n',
    'package-lock.json': '{ "name": "shop-web", "lockfileVersion": 3, "packages": {} }\n',
    '.nvmrc': '20.11.0\n',
    'Makefile': 'test:\n\tnpm test\n\ndeploy-prod:\n\t./scripts/deploy.sh prod\n',
    'docs/style.md': '# Style\n\nTwo spaces, no tabs.\n',
    'src/main.ts': 'export const main = () => 1;\n',
    'scripts/deploy.sh': '#!/bin/sh\necho deploy "$1"\n',
  },
};
