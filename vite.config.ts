import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  environments: {
    rsc: {
      // GeoTIFF loads codecs lazily; prebundling leaves live Workers holding stale chunk URLs.
      optimizeDeps: { exclude: ["geotiff"] },
    },
  },
  server: {
    // HiRISE site tiles are tens of thousands of static files; watching them crashes the dev server.
    watch: { ignored: ["**/public/data/sites/**"] },
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
