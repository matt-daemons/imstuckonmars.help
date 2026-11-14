{
  description = "imstuckonmars.help: a vinext app on Cloudflare Workers";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      inherit (nixpkgs) lib;

      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "x86_64-darwin"
        "aarch64-darwin"
      ];

      forAllSystems = f: lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});

      src = lib.fileset.toSource {
        root = ./.;
        fileset = lib.fileset.unions [
          ./app
          ./components
          ./hooks
          ./lib
          ./public
          ./server
          ./migrations
          ./.oxfmtrc.json
          ./.oxlintrc.json
          ./components.json
          ./next.config.ts
          ./package.json
          ./pnpm-lock.yaml
          ./pnpm-workspace.yaml
          ./postcss.config.mjs
          ./tsconfig.json
          ./vite.config.ts
          ./vitest.config.ts
          ./wrangler.jsonc
        ];
      };

      toolsFor = pkgs: {
        nodejs = pkgs.nodejs_24;
        inherit (pkgs) pnpm;
      };
    in
    {
      packages = forAllSystems (
        pkgs:
        let
          site = pkgs.callPackage ./nix/package.nix ({ inherit src; } // toolsFor pkgs);
        in
        {
          default = site;
          imstuckonmars-help = site;
        }
      );

      apps = forAllSystems (
        pkgs:
        import ./nix/apps.nix {
          inherit pkgs;
          site = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
          tools = toolsFor pkgs;
        }
      );

      checks = forAllSystems (
        pkgs:
        let
          site = self.packages.${pkgs.stdenv.hostPlatform.system}.default;
        in
        {
          build = site;

          static = site.overrideAttrs {
            pname = "imstuckonmars-help-static-checks";
            inherit (site) pnpmDeps;
            nativeBuildInputs = site.nativeBuildInputs ++ [ pkgs.nixfmt ];
            buildPhase = ''
              runHook preBuild
              pnpm fmt:check
              pnpm lint
              pnpm typecheck
              pnpm test
              runHook postBuild
            '';
            installPhase = "touch $out";
            dontFixup = true;
          };

          nix-format =
            pkgs.runCommand "imstuckonmars-help-nix-format" { nativeBuildInputs = [ pkgs.nixfmt ]; }
              ''
                nixfmt --check ${./flake.nix} ${./nix}/*.nix
                touch $out
              '';
        }
      );

      devShells = forAllSystems (
        pkgs:
        let
          tools = toolsFor pkgs;
        in
        {
          default = pkgs.mkShellNoCC {
            packages = [
              tools.nodejs
              tools.pnpm
              pkgs.nixfmt
            ];
            NEXT_TELEMETRY_DISABLED = "1";
            WRANGLER_SEND_METRICS = "false";
          };
        }
      );

      formatter = forAllSystems (pkgs: pkgs.nixfmt-tree);
    };
}
