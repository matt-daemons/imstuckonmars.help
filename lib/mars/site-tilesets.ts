/**
 * Mapbox-hosted HiRISE site imagery on M's account (Studio → Tilesets → New tileset, upload
 * data/interim/hirise/<dtm>/<HiRISE ID>_mapbox.tif, e.g. ESP_033225_2250_mapbox.tif). Fill in each tileset ID ("user.tileset") after
 * upload; until then the map uses locally generated tiles from `pnpm pipe:sites`.
 */
export const SITE_TILESETS: Record<string, string> = {
  // DTEEC_033225_2250_033146_2250_A01: "",
  // DTEEC_034082_2260_033014_2260_A01: "",
  // DTEEC_037352_2245_037418_2245_A01: "",
  // DTEEC_054060_2265_054126_2265_A01: "",
};
