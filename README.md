# imstuckonmars.help

A [vinext](https://github.com/cloudflare/vinext) App Router site with a [Hono](https://hono.dev)
API and [coss ui](https://coss.com/ui) components, deployed to Cloudflare Workers with Wrangler.

Live at **https://imstuckonmars.help** (primary domain). The Worker is also reachable at
https://imstuckonmars-help.hackrlabs.workers.dev.

## Prerequisites

- Nix with flakes enabled
- direnv with [nix-direnv](https://github.com/nix-community/nix-direnv) (recommended)

## First run

```sh
direnv allow        # or: nix develop
pnpm install
nix run .#dev       # http://localhost:5173
```

The dev shell provides Node.js 24, pnpm, and nixfmt, and disables Next.js and Wrangler telemetry.
The map uses BSD-licensed MapLibre GL JS and public R2 datasets. No Mapbox account,
token or font service is required. See [renderer notes](docs/MAP_RENDERER.md) for
feature checks and [MapLibre's bundled license notices](public/licenses/maplibre-gl.txt).

## Layout

| Path                               | Purpose                                 |
| ---------------------------------- | --------------------------------------- |
| `app/`                             | App Router pages and layouts            |
| `app/api/[[...route]]/`            | Forwards every `/api/*` request to Hono |
| `server/api/`                      | Hono API app and its tests              |
| `components/ui/`, `hooks/`, `lib/` | coss ui components, hooks, and helpers  |
| `wrangler.jsonc`                   | Worker configuration                    |
| `flake.nix`, `nix/`                | Nix package, apps, and checks           |

All coss ui primitives are installed and shown at `/design-system` (not indexed), along with the
theme tokens. The dark-only Hermes theme in `app/globals.css` is modeled on the Hermes screens
from [The Martian](https://territorystudio.com/project/the-martian). Add or update coss components and particles with
`pnpm dlx shadcn@latest add @coss/<name>` (the shadcn CLI is only the installer), then run
`nix run .#fmt`.

## Commands

Development apps run against the checkout and find the repository root from any subdirectory.
They install locked dependencies on first use.

| Command               | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `nix run .#dev`       | vinext dev server with HMR                                  |
| `nix run .#build`     | Build the Worker into `dist/`                               |
| `nix run .#test`      | vitest; extra arguments are forwarded                       |
| `nix run .#lint`      | oxlint                                                      |
| `nix run .#typecheck` | Generate Worker binding types and run `tsc`                 |
| `nix run .#fmt`       | Format sources with oxfmt and Nix files with nixfmt         |
| `nix run .#fmt-check` | Check formatting without writing                            |
| `nix run .#check`     | Format check, lint, typecheck, tests, and build             |
| `nix run .#deploy`    | Build and deploy to Cloudflare (`-- --dry-run` to validate) |

The same tasks are available as `pnpm` scripts inside the dev shell.

## Packaged build

`nix build` produces the deployable Worker in `result/share/imstuckonmars-help/` (`client/`
assets and `server/` with `wrangler.json`).

`nix run .` serves that build locally in workerd, using the Wrangler from nixpkgs:

```sh
nix run . -- --port 8787
```

`nix flake check` builds the package and runs formatting, lint, type, and test checks in the
Nix sandbox.

The Worker's `compatibility_date` must not be newer than the date supported by the nixpkgs
workerd. Otherwise `nix run .` cannot start it.

## Deploying

GitHub Actions (`.github/workflows/ci.yml`) installs with pnpm and runs `pnpm fmt:check`,
`pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` on every pull request and push.
Pushes to `main` that pass deploy to Cloudflare with `pnpm run deploy`.

The `imstuckonmars.help` custom domain is attached to the Worker in Cloudflare, not in
`wrangler.jsonc`.

The deploy job needs these repository secrets:

| Secret                  | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | API token created from the **Edit Cloudflare Workers** template           |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID from the Cloudflare dashboard URL (`dash.cloudflare.com/<id>`) |

To deploy manually, authenticate with `pnpm exec wrangler login` (or export the two variables
above), then run `nix run .#deploy`.

## License

[MIT](LICENSE)
