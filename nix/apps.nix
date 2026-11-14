{
  pkgs,
  site,
  tools,
}:

let
  inherit (pkgs) lib;

  # Development apps work on the checkout, not a store copy. They find the
  # repository root from any subdirectory and install locked dependencies on
  # first use.
  inCheckout = ''
    root=$PWD
    until [[ -f $root/flake.nix && -f $root/pnpm-lock.yaml ]]; do
      if [[ $root == / ]]; then
        echo "error: run this inside the imstuckonmars.help checkout" >&2
        exit 1
      fi
      root=$(dirname "$root")
    done
    cd "$root"

    if [[ ! -d node_modules ]]; then
      pnpm install --frozen-lockfile
    fi
  '';

  nixFiles = ''find . \( -name node_modules -o -name .direnv -o -name .jj -o -name .git \) -prune -o -name '*.nix' -print0'';

  mkApp = name: description: text: {
    type = "app";
    program = lib.getExe (
      pkgs.writeShellApplication {
        name = "imstuckonmars-help-${name}";
        runtimeInputs = [
          tools.nodejs
          tools.pnpm
          pkgs.findutils
          pkgs.nixfmt
        ];
        text = inCheckout + text;
      }
    );
    meta = { inherit description; };
  };
in
{
  default = {
    type = "app";
    program = lib.getExe site;
    meta.description = "Serve the built Worker locally in workerd";
  };

  dev = mkApp "dev" "Run the vinext dev server" ''exec pnpm dev "$@"'';
  build = mkApp "build" "Build the Worker into dist/" ''exec pnpm build "$@"'';
  test = mkApp "test" "Run the vitest suite" ''exec pnpm test "$@"'';
  lint = mkApp "lint" "Lint with oxlint" ''exec pnpm lint "$@"'';
  typecheck = mkApp "typecheck" "Generate Worker types and type-check" ''exec pnpm typecheck "$@"'';

  fmt = mkApp "fmt" "Format TypeScript, CSS, JSON, and Nix sources" ''
    pnpm fmt "$@"
    ${nixFiles} | xargs -0 nixfmt
  '';

  fmt-check = mkApp "fmt-check" "Check formatting without modifying files" ''
    pnpm fmt:check
    ${nixFiles} | xargs -0 nixfmt --check
  '';

  check = mkApp "check" "Run formatting, lint, type, test, and build checks" ''
    pnpm fmt:check
    ${nixFiles} | xargs -0 nixfmt --check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm build
  '';

  deploy = mkApp "deploy" "Build and deploy the Worker to Cloudflare" ''exec pnpm run deploy "$@"'';
}
