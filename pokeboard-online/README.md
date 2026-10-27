# Pokéboard Online - prototype v0.24

Privékamers voor twee tot vier menselijke spelers, elk op hun eigen toestel.
De kamermaker kiest de generaties en het maximum aantal spelers. Vrienden
sluiten aan met de code of uitnodigingslink. De maker kan starten vanaf twee
spelers. Lokale spellen met AI blijven beschikbaar.

## Nieuwe vangregel

Het aanbod bevat altijd minstens twee Common-Pokémon. Die zijn vangbaar met
een rode bal op passend terrein. Oude lokale spelstanden krijgen de correctie
bij hervatten. De losse v0.23 ZIP bevat deze correctie voor GitHub Pages.

## Online functies

- Server controleert kaarten, dobbelworpen, geld, battles, badges en beurten.
- Live updates via WebSockets met Cloudflare-hibernatie.
- Iedere kamer bewaart de spelstand in een SQLite-backed Durable Object.
- Dubbele berichten worden herkend; verouderde acties worden geweigerd.
- Hervatten werkt op hetzelfde toestel en in dezelfde browser.
- De lokale Pokédex telt eigen online vangsten, zonder dubbel tellen bij hervatten.
- Trekstapels blijven op de server. Menselijke handen zijn zichtbaar volgens
  de bestaande spelafspraak.
- Kamers verlopen na 30 dagen zonder spelactie.

Nog niet inbegrepen: online AI, chat, openbare matchmaking, accounts,
spelers vervangen of lobbyplaatsen verwijderen. Bij een verkeerd aangesloten
speler maak je in deze eerste versie een nieuwe kamer. Een kamercode vervangt
geen verloren spelerssessie: hervat op je eigen toestel en browser.

## Controleren

Gebruik Node.js 22 of nieuwer:

```sh
npm ci
npm test
npm run test:runtime
npm run test:client
npm run check
npm run dev
```

De tests gebruiken de lokale Cloudflare Workers-runtime en twee aparte
DOM-clients. De DOM-test controleert gedrag, geen visuele rendering of mobiele
Safari. Open het door Wrangler getoonde adres in twee browserprofielen voor
een handmatige controle. Doe voor echt gebruik eerst een proefspel met vrienden.

## Live zetten op Cloudflare Free

Deze map is het complete serverproject. Alleen index.html op GitHub Pages
vervangen activeert online spelen niet.

```sh
npm ci
npx wrangler login
npm run deploy
```

Blijf op Workers Free. De configuratie maakt de website, server en SQLite
Durable Objects samen beschikbaar op één Worker-adres. De geslaagde deployment
geeft de live URL terug. De huidige GitHub Pages-link kan de lokale versie
blijven aanbieden. Voor een apart online frontend op GitHub Pages moeten
de API- en WebSocket-URL's nog naar het Worker-adres worden aangepast.

Het productiegebruik is nog niet gemeten. Controleer Cloudflares
gebruiksoverzicht bij het eerste proefspel: naast verzoeken gelden ook
limieten voor rekentijd en opslag. Deze versie gebruikt geen betaalde AI-API.

## Onderhoud

`src/engine.mjs` en `src/data.mjs` bevatten de bestaande Pokéboard-regels.
`src/worker.mjs` beheert kamers en toegang. `public/index.html` is de complete
spelinterface. Zet geen Cloudflare-inloggegevens in deze bestanden.
Op de server worden alleen hashes van willekeurige spelerstoegangstokens
bewaard. Deel de uitnodigingslink alleen met vrienden.
