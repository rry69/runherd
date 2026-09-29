// Pool nama display deterministik: kombinasi Dewa (Yunani + Nordik) x Kota/Realm.
// 50 dewa x 40 kota/realm = 2000 nama unik. Dipakai via hash(session.id) % POOL.
export const NORDIC_GODS = [
  // Nordik (20)
  "Odin", "Thor", "Loki", "Freya", "Frey", "Baldr", "Tyr", "Heimdall",
  "Frigg", "Idun", "Bragi", "Njord", "Skadi", "Hel", "Mimir", "Forseti",
  "Ullr", "Sif", "Aegir", "Ran",
  // Yunani (30)
  "Zeus", "Hera", "Athena", "Apollo", "Artemis", "Ares", "Aphrodite",
  "Hephaestus", "Hermes", "Demeter", "Dionysus", "Hades", "Persephone",
  "Poseidon", "Hestia", "Nike", "Eos", "Selene", "Helios", "Pan",
  "Nemesis", "Themis", "Leto", "Hecate", "Iris", "Khione", "Boreas",
  "Ymir", "Eir", "Gefjun",
] as const;

export const NORDIC_PLACES = [
  // Realm Nordik (8)
  "Asgard", "Midgard", "Valhalla", "Vanaheim", "Jotunheim", "Alfheim",
  "Niflheim", "Muspelheim",
  // Kota Yunani kuno (16)
  "Athens", "Sparta", "Delphi", "Olympia", "Corinth", "Thebes", "Rhodes",
  "Crete", "Troy", "Ithaca", "Mycenae", "Knossos", "Ephesus", "Argos",
  "Pella", "Syracuse",
  // Kota Nordik modern (16)
  "Bergen", "Oslo", "Trondheim", "Reykjavik", "Uppsala", "Stockholm",
  "Copenhagen", "Helsinki", "Akureyri", "Stavanger", "Tromso", "Aarhus",
  "Gothenburg", "Malmo", "Alexandria", "Byzantium",
] as const;

function buildPool(): string[] {
  const out: string[] = [];
  for (const god of NORDIC_GODS) {
    for (const place of NORDIC_PLACES) {
      out.push(`${god}-${place}`);
    }
  }
  return out;
}

export const NORDIC_POOL: string[] = buildPool();
export const NORDIC_POOL_SIZE = NORDIC_POOL.length;
