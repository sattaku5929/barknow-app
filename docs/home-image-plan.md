# Home image plan — 2026-11-03

The owner Home now uses the eight image selections and per-device fit/position settings from the supplied image plan. Source bytes are preserved in `public/images/wantone/home/`. `lib/ui/homeImagePlan.ts` is the placement manifest; `HomePlanImage` applies the responsive settings through Next Image.

| Slot | Purpose |
| --- | --- |
| hero | Walking landscape |
| care | Daily Check card illustration |
| paw | Paw checking |
| brushing | Brushing |
| teeth | Tooth brushing |
| wipe | Wiping paws after walks |
| quick | Quick Log shortcut |
| insight | Existing insights shortcut |

The four selected care illustrations are the uploaded full-size PNGs. The other four images remain screenshot-derived reference selections. Care illustration selection uses the existing goal type, with paw-wiping titles matched before the general paw illustration; all other goal types keep their original icon.

Home reuses the existing Daily Check route, care complete/undo/editor callbacks and Quick Log route. Actual goal titles, periods, counts and history stay unchanged. Changes and Calendar remain below the daily dashboard, and the bottom navigation retains four destinations. The reference's Care Tips card links to the existing Insights feature instead of creating an unsupported feature.

No database, migrations, RLS, authentication, membership, coaching or chat behavior changes are included. The Record screen retains its existing compact care presentation.
