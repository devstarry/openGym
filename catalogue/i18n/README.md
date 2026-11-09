# catalogue/i18n

My Gym is English (UK) only, so this folder holds no translations. The catalogue build
(`scripts/catalogue/build.mjs`) still reads `<lang>.json` files from here, as upstream openGym
does: `{ "<id>": { name, description, instructions } }` per language.
