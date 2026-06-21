# Code signing & notarization

InterviewLens builds **unsigned** by default — fine for local/personal use, but
users will see OS warnings (macOS Gatekeeper: right-click → Open; Windows
SmartScreen: More info → Run anyway).

Signing is **environment-driven**: set the variables/secrets below and the same
build commands produce signed artifacts. No code changes needed.

## macOS

You need an **Apple Developer account** ($99/yr) and a *Developer ID Application*
certificate (for apps distributed outside the App Store).

1. In Keychain Access, export the certificate + private key as a `.p12`.
2. Provide it to electron-builder via env:
   - `CSC_LINK` — path to the `.p12`, or its base64 (`base64 -i cert.p12`).
   - `CSC_KEY_PASSWORD` — the `.p12` password.
3. **Notarization** (required for Gatekeeper to trust it on other Macs):
   - Set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` (an app-specific password from
     appleid.apple.com), and `APPLE_TEAM_ID`.
   - Uncomment `notarize: true` under `mac:` in `electron-builder.yml`.

Local signed build:
```bash
export CSC_LINK=~/certs/developer-id.p12
export CSC_KEY_PASSWORD='…'
export APPLE_ID='you@example.com'
export APPLE_APP_SPECIFIC_PASSWORD='abcd-efgh-ijkl-mnop'
export APPLE_TEAM_ID='XXXXXXXXXX'
npm run dist:mac
```

## Windows

You need a **code-signing certificate** (OV or, for instant SmartScreen trust,
EV) from a CA (e.g. DigiCert, Sectigo).

- `CSC_LINK` — path/base64 of the `.pfx`.
- `CSC_KEY_PASSWORD` — its password.

```bash
set CSC_LINK=C:\certs\win-cert.pfx
set CSC_KEY_PASSWORD=…
npm run dist
```

## CI (GitHub Actions)

The workflow (`.github/workflows/build.yml`) already wires these as **repo
secrets** — add them under *Settings → Secrets and variables → Actions*:

| Secret | Platform | Purpose |
|---|---|---|
| `CSC_LINK` | mac + win | base64 of the signing cert (`.p12`/`.pfx`) |
| `CSC_KEY_PASSWORD` | mac + win | cert password |
| `APPLE_ID` | mac | Apple ID for notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | mac | app-specific password |
| `APPLE_TEAM_ID` | mac | Apple Developer Team ID |

CI is **unsigned by default**. To sign: add the secrets above, then in
`.github/workflows/build.yml` **uncomment** the `CSC_*` / `APPLE_*` env lines in
the "Package installers" step (leave `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` —
with `CSC_LINK` set, electron-builder signs from that cert directly). For
notarization, also set `notarize: true` under `mac:` in `electron-builder.yml`.

> Don't pass empty `CSC_*` env vars — an empty `CSC_LINK` is read as a cert path
> and the build fails with `not a file`. That's why the lines are commented, not
> wired to possibly-empty secrets.

## App icon

The icon lives at `build/icon.png` (1024×1024) with a macOS `build/icon.icns`.
Replace `build/icon.png` with a designed image and regenerate the `.icns`:

```bash
# from a 1024x1024 build/icon.png
mkdir icon.iconset
for s in 16 32 128 256 512; do
  sips -z $s   $s   build/icon.png --out icon.iconset/icon_${s}x${s}.png
  sips -z $((s*2)) $((s*2)) build/icon.png --out icon.iconset/icon_${s}x${s}@2x.png
done
iconutil -c icns icon.iconset -o build/icon.icns && rm -rf icon.iconset
```
electron-builder generates the Windows `.ico` and Linux icon from `build/icon.png`.
