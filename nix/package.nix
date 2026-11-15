{
  lib,
  stdenvNoCC,
  fetchPnpmDeps,
  makeWrapper,
  nodejs,
  pnpm,
  pnpmConfigHook,
  wrangler,
  src,
}:

stdenvNoCC.mkDerivation (finalAttrs: {
  pname = "imstuckonmars-help";
  version = "0.1.0";

  inherit src;

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 5;
    hash = "sha256-xD5S8FVgomf7Yf6jT5I8BSnSURY4tjI6qtMrJIi/S2I=";
  };

  nativeBuildInputs = [
    makeWrapper
    nodejs
    pnpm
    pnpmConfigHook
  ];

  NEXT_TELEMETRY_DISABLED = "1";
  WRANGLER_SEND_METRICS = "false";

  buildPhase = ''
    runHook preBuild
    pnpm build
    runHook postBuild
  '';

  # $out/share/imstuckonmars-help holds the deployable build output:
  # client/ static assets and server/ with the Worker and its wrangler.json.
  installPhase = ''
    runHook preInstall

    dist=$out/share/${finalAttrs.pname}
    mkdir -p $dist
    cp -r dist/. $dist/
    cp -r migrations $dist/migrations

    # Drop absolute paths to the build sandbox's wrangler.jsonc.
    node --input-type=module - $dist/server/wrangler.json <<'JS'
    import fs from "node:fs";
    const path = process.argv[2];
    const config = JSON.parse(fs.readFileSync(path, "utf8"));
    delete config.configPath;
    delete config.userConfigPath;
    for (const binding of config.d1_databases ?? []) binding.migrations_dir = "../migrations";
    fs.writeFileSync(path, JSON.stringify(config, null, 2));
    JS

    install -Dm755 ${./serve.sh} $out/libexec/serve.sh
    makeWrapper $out/libexec/serve.sh $out/bin/${finalAttrs.pname} \
      --set DIST_DIR $dist \
      --set WRANGLER_SEND_METRICS false \
      --prefix PATH : ${lib.makeBinPath [ wrangler ]}

    runHook postInstall
  '';

  passthru = { inherit (finalAttrs) pnpmDeps; };

  meta = {
    description = "imstuckonmars.help Worker build, with a local workerd preview";
    license = lib.licenses.mit;
    mainProgram = finalAttrs.pname;
    platforms = [
      "x86_64-linux"
      "aarch64-linux"
      "x86_64-darwin"
      "aarch64-darwin"
    ];
  };
})
