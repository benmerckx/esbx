import {ExtensionPlugin} from '@esbx/extension'
import {list, reportTime} from '@esbx/util'
import {ReporterPlugin} from '@esbx/reporter'
import {execSync} from 'child_process'
import {build, BuildOptions} from 'esbuild'
import {Task} from 'esbx'
import fs, {remove} from 'fs-extra'
import glob from 'glob'
import path from 'path'
import {tsconfigResolverSync, TsConfigResult} from 'tsconfig-resolver'
import which from 'which'
import {getManifest, getWorkspaces, orFail} from './util.js'

export type BuildTaskConfig = {
  /** Exclude workspaces from building */
  exclude?: Array<string>
  buildOptions?: BuildOptions
}

export type BuildTaskOptions = {
  watch?: boolean
  'skip-types'?: boolean
}

function createTypes() {
  const tsc = orFail(
    () => which.sync('tsc'),
    'No typescript binary found, is it installed?'
  )
  return reportTime(
    async () => {
      execSync(tsc, {stdio: 'inherit', cwd: process.cwd()})
    },
    'type checking',
    err => {
      if (err) return `type errors found`
      return `types built`
    }
  )
}

function task(
  config: BuildTaskConfig = {}
): Task<(options: BuildTaskOptions) => Promise<void>> {
  const excluded = new Set(config.exclude || [])
  return {
    command: 'build',
    description: 'Build workspaces',
    options: [
      ['-w, --watch', 'Rebuild on source file changes'],
      ['-sk, --skip-types', 'Skip generating typescript types']
    ],
    async action(options) {
      const selected = process.argv.slice(3).filter(arg => !arg.startsWith('-'))
      const skipTypes = options['skip-types'] || !fs.existsSync('tsconfig.json')
      const workspaces = getWorkspaces(process.cwd())
      let tsConfig: TsConfigResult | undefined = undefined
      if (!skipTypes) {
        tsConfig = tsconfigResolverSync()
        await createTypes()
      }
      async function buildPackage(root: string, location: string) {
        const meta = fs.readJSONSync(path.join(location, 'package.json'))
        const cwd = path.join(root, location)
        const entryPoints = glob.sync('src/**/*.{ts,tsx}', {cwd})
        if (!skipTypes) {
          const dist = path.join(cwd, 'dist')
          await remove(dist)
          const typeDir = path.join(
            tsConfig!.config?.compilerOptions?.outDir || '.types',
            location.substr('packages/'.length),
            'src'
          )
          if (fs.existsSync(typeDir)) await fs.copy(typeDir, dist)
        }
        return build({
          format: 'esm',
          outdir: 'dist',
          bundle: true,
          sourcemap: true,
          absWorkingDir: cwd,
          entryPoints: entryPoints.filter(entry => !entry.endsWith('.d.ts')),
          watch: options.watch,
          plugins: (config.buildOptions?.plugins || [ExtensionPlugin]).concat(
            ReporterPlugin.configure({name: meta.name})
          ),
          ...config.buildOptions
        }) //
      }
      for (const workspace of workspaces) {
        const meta = getManifest(workspace)
        const isSelected =
          meta &&
          !excluded.has(meta.name) &&
          (selected.length > 0
            ? selected.some(w => workspace.includes(w))
            : true)
        if (isSelected) await buildPackage(process.cwd(), workspace)
      }
    }
  }
}

export const BuildTask = {...task(), configure: task}
