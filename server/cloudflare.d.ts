// Declare only the platform module used by the adapter. Import Worker types per file,
// without loading the Workers global DOM replacements into client components.
declare module "cloudflare:workers" {
  export const env: import("./api/bindings").ApiBindings;
}
