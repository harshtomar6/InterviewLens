// Tag the current package.json version as `v<version>` and push the tag, which
// triggers the GitHub Actions build workflow (.github/workflows/build.yml).
//
//   npm run release
//
// Uses your configured git auth. If you push via a specific SSH key, run e.g.
//   GIT_SSH_COMMAND='ssh -i ~/.ssh/your_key' npm run release
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim()
}

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
const tag = `v${version}`

// Refuse to tag a dirty tree — the build should reflect a committed state.
const dirty = git('status --porcelain')
if (dirty) {
  console.error('✖ Working tree has uncommitted changes. Commit or stash before releasing.')
  process.exit(1)
}

// Bail if the tag already exists (locally or on the remote).
const existsLocal = execSync('git tag --list ' + tag, { encoding: 'utf8' }).trim() === tag
if (existsLocal) {
  console.error(`✖ Tag ${tag} already exists. Bump "version" in package.json first.`)
  process.exit(1)
}

console.log(`→ Tagging ${tag} and pushing…`)
execSync(`git tag ${tag}`, { stdio: 'inherit' })
execSync(`git push origin ${tag}`, { stdio: 'inherit' })

const remote = git('remote get-url origin').replace(/^git@github\.com:/, 'https://github.com/').replace(/\.git$/, '')
console.log(`\n✓ Pushed ${tag}. CI build started:`)
console.log(`  ${remote}/actions`)
console.log('  Installers appear under the run\'s Artifacts when it finishes.')
