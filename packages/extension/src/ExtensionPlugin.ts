import type {OnResolveArgs, Plugin} from 'esbuild'

export type ExternalPluginResponse = void | boolean | string

export type ExternalPluginOptions = {
  filter?: RegExp
  onResolve?: (
    args: OnResolveArgs
  ) => ExternalPluginResponse | Promise<ExternalPluginResponse>
}
// https://github.com/evanw/esbuild/issues/622#issuecomment-769462611
export const ExtensionPlugin: Plugin = {
  name: '@esbx/extension',
  setup(build) {
    build.initialOptions.bundle = true
    const outExtension = build.initialOptions.outExtension?.['.js'] || '.js'
    build.onResolve({filter: /.*/}, args => {
      if (args.kind === 'entry-point') return
      if (args.path.endsWith(outExtension) || !args.path.startsWith('.'))
        return {path: args.path, external: true}
      return {path: args.path + outExtension, external: true}
    })
  }
}