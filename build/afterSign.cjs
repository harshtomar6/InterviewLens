// electron-builder afterSign hook.
//
// When there's no real signing certificate (CSC_LINK unset), electron-builder
// skips signing and leaves the prebuilt Electron binary's ad-hoc seal — which is
// broken once the bundle is repackaged, so macOS reports the app as "damaged".
// Here we re-sign the whole bundle ad-hoc (identity "-") so it has a valid seal
// under the app's own identifier. The app then opens via right-click → Open
// (Gatekeeper "unidentified developer") instead of being blocked as "damaged".
//
// Real signing (CSC_LINK present) is left untouched.
const { execSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterSign(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK) return // real Developer ID signing already ran

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log(`  • ad-hoc signing (no certificate) appPath=${appPath}`)
  // --deep ad-hoc signs nested helpers, frameworks and native .node modules.
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: 'inherit' })
}
