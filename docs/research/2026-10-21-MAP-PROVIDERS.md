# Map providers for the background map — check of 2026-10-21

Checked against each provider's own pages on 2026-10-21. Quotas and terms change; re-check before relying on them.
TSD has no backend, so a key can only be the user's own key, kept in their browser and restricted to the site's domain.

| Provider | Key | Free use / main conditions (as stated by the provider) | In TSD |
| --- | --- | --- | --- |
| OpenFreeMap (Positron, Bright, Liberty, Dark) | none | already in use | default street map |
| VersaTiles (Colorful) | none | "free and open to everyone, but without any guarantees"; rate limit per IP; OSM + ESA WorldCover attribution | **added** as a no-key backup |
| OpenStreetMap standard tiles | none | public tile service, fair use | already in use (not the default) |
| CARTO (Positron = `light_all`, Voyager) | CARTO key | 5M tile requests/month non-commercial, 1M commercial; OSM + CARTO attribution, prominent; no caching over 30 days; no proxying | **added** (raster, key on every tile) |
| Mapbox Satellite | access token | Raster Tiles API free up to 750,000 tiles/month | **added**; tracing permission `TO_VERIFY` |
| Esri (Streets, World Imagery) | ArcGIS key | already in use | unchanged; tracing permission `TO_VERIFY` |
| MapTiler Satellite | MapTiler key | already in use | unchanged; tracing permission `TO_VERIFY` |
| Longdo Map (Thai) | key bound to the service URL | free under 800,000 map tiles/month; content to be shown "in the same manner, form, format, and appearance as it is provided by the Service" | **not added** — ask Longdo whether tiles may be shown in a MapLibre/SVG map outside their JS API |
| GISTDA sphere (Thai) | `TO_VERIFY` | API reference lists STREETS, HYBRID, IMAGES layers; key, quota and reuse terms not found | **not added** — ask GISTDA |
| Stadia Maps | key | free plan: no commercial use; satellite not in the free plan | not added |
| Google Maps Platform | key + billing | Map Tiles 2D free cap 100,000 events/month; terms forbid tracing roadways from satellite imagery and using Google maps with or near a non-Google map | **not suitable** (TSD draws over the map) |

Open questions for the next review: a free, no-key high-resolution imagery source whose terms allow tracing (none found);
written terms from Longdo and GISTDA.

Sources:
[Longdo Map API Terms](https://map.longdo.com/api/terms) ·
[GISTDA sphere API Reference](https://api.sphere.gistda.or.th/map/doc.html) ·
[CARTO Basemap Terms](https://carto.com/legal/basemap-terms/) ·
[CARTO Basemaps FAQ](https://docs.carto.com/faqs/carto-basemaps) ·
[Stadia Maps Pricing](https://stadiamaps.com/pricing/) ·
[Google Maps Platform Pricing](https://developers.google.com/maps/billing-and-pricing/pricing) ·
[Google Maps Platform Terms](https://cloud.google.com/maps-platform/terms) ·
[Mapbox Pricing](https://www.mapbox.com/pricing) ·
[Mapbox Raster Tiles API](https://docs.mapbox.com/api/maps/raster-tiles/) ·
[VersaTiles: use tiles.versatiles.org](https://docs.versatiles.org/guides/use_tiles_versatiles_org)
