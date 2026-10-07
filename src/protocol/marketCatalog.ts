/**
 * Official-market inventory and compatibility evidence.
 *
 * This is intentionally separate from `DEVICES`: a product can be present in
 * a current regional catalog without having a public packet layout. A catalog
 * row therefore never implies that a guessed profile is safe. `profileId`
 * points to an exact SKU profile when one exists; otherwise the matching table
 * uses a catalog-only profile that permits identity/universal reads only.
 *
 * Snapshot date: 2026-09-29 (US and EU soundcore storefronts/support pages).
 */

export type MarketCategory = 'tws' | 'sleep' | 'open-ear' | 'neckband' | 'headphones';
export type MarketStatus = 'current' | 'regional-current';
export type ProtocolStatus = 'implemented' | 'read-only' | 'unknown';
export type CoverageStatus = 'covered' | 'not-covered';
export type PhysicalValidationStatus = 'pending' | 'verified';

export interface MarketCatalogEntry {
  /** Canonical hardware SKU; color/bundle suffixes belong in aliases. */
  sku: string;
  /** Soundcore marketing name for the canonical row. */
  name: string;
  category: MarketCategory;
  marketStatus: MarketStatus;
  regions: readonly ('US' | 'EU')[];
  /** Regional spelling, AI-feature, and product-page aliases. */
  aliases: readonly string[];
  /** Exact SoundControl profile, when one has been implemented. */
  profileId: string;
  /** Evidence level for packet/transport behavior, not catalog identity. */
  protocolStatus: ProtocolStatus;
  protocolEvidence: string;
  /** Local fixture/simulator coverage is tracked independently of protocol evidence. */
  simulatorCoverage: CoverageStatus;
  unitTestCoverage: CoverageStatus;
  /** No physical Soundcore hardware has been exercised in this workspace yet. */
  physicalValidation: PhysicalValidationStatus;
  notes?: readonly string[];
}

const US_CATALOG = 'Official soundcore US catalog/product/support snapshot, 2026-09-29';
const EU_CATALOG = 'Official soundcore EU catalog/product/support snapshot, 2026-09-29';
const OPENSCQ30 = 'OpenSCQ30 device definition and packet/state tests';
const GENERIC = 'Catalog identity is confirmed, but no exact public packet layout is available; only protocol-universal identity/presence reads are enabled.';

/**
 * Deduplicated market inventory. A color SKU, bundle, refurbished card, AI
 * feature card, or regional name is an alias here—not a new device—unless a
 * future capture proves a different protocol.
 */
export const MARKET_CATALOG: readonly MarketCatalogEntry[] = [
  // Traditional TWS earbuds
  {
    sku: 'D1206', name: 'Liberty Buds 2', category: 'tws', marketStatus: 'current', regions: ['US'],
    aliases: ['D1206', 'Liberty Buds 2', 'soundcore Liberty Buds 2'], profileId: 'liberty-buds-2',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1204', name: 'Liberty 5 Pro Max', category: 'tws', marketStatus: 'current', regions: ['US'],
    aliases: ['D1204', 'Liberty 5 Pro Max', 'soundcore Liberty 5 Pro Max'], profileId: 'liberty-5-pro-max',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1203', name: 'Liberty 5 Pro', category: 'tws', marketStatus: 'current', regions: ['US'],
    aliases: ['D1203', 'Liberty 5 Pro', 'soundcore Liberty 5 Pro'], profileId: 'liberty-5-pro',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1205', name: 'P42i', category: 'tws', marketStatus: 'current', regions: ['US'],
    aliases: ['D1205', 'P42i', 'soundcore P42i'], profileId: 'p42i',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1202', name: 'P31i / R60i NC', category: 'tws', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['D1202', 'D1202C', 'P31i', 'R60i NC', 'soundcore P31i', 'soundcore R60i NC'], profileId: 'p31i',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: D1202/D1202C eight-byte sound modes, dual battery/case offsets, LDAC, dual connections and source-backed 03:87 disabled-HearID factory EQ; personalised HearID curves remain withheld.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1200', name: 'Liberty Buds', category: 'tws', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['D1200', 'Liberty Buds', 'soundcore Liberty Buds'], profileId: 'liberty-buds',
    protocolStatus: 'unknown', protocolEvidence: `${EU_CATALOG}: ${GENERIC}`, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3957', name: 'Liberty 5', category: 'tws', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3957', 'Liberty 5', 'soundcore Liberty 5'], profileId: 'liberty-5',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3957 seven-byte sound modes and 10-step battery/case layout.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3954', name: 'Liberty 4 Pro', category: 'tws', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3954', 'Liberty 4 Pro', 'soundcore Liberty 4 Pro'], profileId: 'liberty-4-pro',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3954 four-byte slider sound-mode layout; model-specific EQ is read-only.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3947', name: 'Liberty 4 NC', category: 'tws', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3947', 'A3947C', 'Liberty 4 NC', 'soundcore Liberty 4 NC'], profileId: 'liberty-4-nc',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3947 seven-byte sound modes and state offsets; 03:87 EQ is read-only.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3955', name: 'P40i', category: 'tws', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3955', 'P40i', 'soundcore P40i'], profileId: 'p40i',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3955 seven-byte multi-scene sound modes and state offsets.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3936', name: 'Space A40', category: 'tws', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3936', 'Space A40', 'soundcore Space A40'], profileId: 'space-a40',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3936 six-byte named sound modes, LDAC and state offsets; HearID EQ is read-only.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3968', name: 'Sport X20', category: 'tws', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3968', 'Sport X20', 'soundcore Sport X20'], profileId: 'sport-x20',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3968 six-byte named sound modes, battery/case offsets, dual connections and surround; HearID EQ is read-only.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3949', name: 'P20i / P25i / R50i', category: 'tws', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3949', 'P20i', 'P25i', 'R50i', 'soundcore P20i', 'soundcore P25i', 'soundcore R50i'], profileId: 'p20i',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3949 no sound-mode module and 02:83 factory-preset EQ; custom FEFE is explicitly unsupported.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3994', name: 'K20i', category: 'tws', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3994', 'K20i', 'soundcore K20i'], profileId: 'k20i',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },

  // Sleep earbuds
  {
    sku: 'D1301', name: 'Sleep A30', category: 'sleep', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['D1301', 'Sleep A30', 'soundcore Sleep A30'], profileId: 'sleep-a30',
    protocolStatus: 'read-only', protocolEvidence: `${OPENSCQ30}: D1301 battery/identity/state layout is known; sleep-specific alarms, timers and listening-mode writes are not implemented here.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A6611', name: 'Sleep A20', category: 'sleep', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A6611', 'Sleep A20', 'soundcore Sleep A20'], profileId: 'sleep-a20',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },

  // Open-ear / clip-on
  {
    sku: 'D1105', name: 'AeroClip 2', category: 'open-ear', marketStatus: 'current', regions: ['US'],
    aliases: ['D1105', 'AeroClip 2', 'AeroClip2', 'soundcore AeroClip 2'], profileId: 'aeroclip-2',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3388', name: 'AeroClip', category: 'open-ear', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3388', 'AeroClip', 'soundcore AeroClip'], profileId: 'aeroclip',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3388 two-channel outbound 02:83 EQ, one ten-band state EQ block, 10-step battery/case and dual connections; surround is parsed read-only because no 02:86 writer is registered.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3874', name: 'AeroFit 2', category: 'open-ear', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3874', 'A3874X', 'AeroFit 2', 'AeroFit 2 AI Assistant', 'soundcore AeroFit 2', 'soundcore AeroFit 2 AI Assistant'], profileId: 'aerofit-2',
    protocolStatus: 'unknown', protocolEvidence: `${US_CATALOG}: A3874 AeroFit 2 and its AI Assistant feature listing are one regional SKU family; packet layout remains unverified.`, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3875', name: 'AeroFit 2 Pro', category: 'open-ear', marketStatus: 'regional-current', regions: ['US', 'EU'],
    aliases: ['A3875', 'AeroFit 2 Pro', 'soundcore AeroFit 2 Pro'], profileId: 'aerofit-2-pro',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3871', name: 'AeroFit Pro', category: 'open-ear', marketStatus: 'regional-current', regions: ['US', 'EU'],
    aliases: ['A3871', 'AeroFit Pro', 'soundcore AeroFit Pro'], profileId: 'aerofit-pro',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3872', name: 'AeroFit', category: 'open-ear', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3872', 'AeroFit', 'soundcore AeroFit'], profileId: 'aerofit',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3331', name: 'C40i', category: 'open-ear', marketStatus: 'regional-current', regions: ['US', 'EU'],
    aliases: ['A3331', 'C40i', 'soundcore C40i'], profileId: 'c40i',
    protocolStatus: 'unknown', protocolEvidence: `${US_CATALOG}: A3331 C40i identity; no packet layout in the sources used here.`, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3330', name: 'C30i', category: 'open-ear', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3330', 'C30i', 'soundcore C30i'], profileId: 'c30i',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3330 single-channel DRC EQ, case/battery offsets and dual connections.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1101', name: 'C50i', category: 'open-ear', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['D1101', 'C50i', 'soundcore C50i'], profileId: 'c50i',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: D1101 two-channel 02:81 EQ, 10-step battery, LDAC and dual connections.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3873', name: 'V30i', category: 'open-ear', marketStatus: 'current', regions: ['US'],
    aliases: ['A3873', 'V30i', 'soundcore V30i'], profileId: 'v30i',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3878', name: 'V40i', category: 'open-ear', marketStatus: 'current', regions: ['US'],
    aliases: ['A3878', 'V40i', 'soundcore V40i'], profileId: 'v40i',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },

  // Neckband headphones. These are separate physical products from open-ear
  // AeroFit earbuds even when a regional storefront groups them together.
  // The official product/support pages identify the SKUs; no public packet
  // layout is available in the surveyed protocol projects, so they remain
  // exact, read-only catalog profiles until captured.
  {
    sku: 'A3213', name: 'R500 / Life U2i', category: 'neckband', marketStatus: 'regional-current', regions: ['US', 'EU'],
    aliases: ['A3213', 'R500', 'Life U2i', 'soundcore R500', 'soundcore Life U2i'], profileId: 'life-u2i',
    protocolStatus: 'unknown', protocolEvidence: 'Official soundcore product and serial-number pages identify A3213 as R500/Life U2i; exact packet layout is not published in the sources used here.', simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3212', name: 'Life U2', category: 'neckband', marketStatus: 'regional-current', regions: ['US', 'EU'],
    aliases: ['A3212', 'Life U2', 'soundcore Life U2'], profileId: 'life-u2',
    protocolStatus: 'unknown', protocolEvidence: 'Official soundcore product and serial-number pages identify A3212 as Life U2; exact packet layout is not published in the sources used here.', simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3201', name: 'Life NC', category: 'neckband', marketStatus: 'regional-current', regions: ['US', 'EU'],
    aliases: ['A3201', 'Life NC', 'soundcore Life NC'], profileId: 'life-nc',
    protocolStatus: 'unknown', protocolEvidence: 'Official soundcore serial-number page identifies A3201 as Life NC; exact packet layout is not published in the sources used here.', simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },

  // Over-ear / on-ear headphones
  {
    sku: 'D1406', name: 'Space 2 Pro', category: 'headphones', marketStatus: 'current', regions: ['US'],
    aliases: ['D1406', 'Space 2 Pro', 'soundcore Space 2 Pro'], profileId: 'space-2-pro',
    protocolStatus: 'unknown', protocolEvidence: `${US_CATALOG}: D1406 Space 2 Pro is a current product; exact packet layout is not published in the sources used here.`, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1402', name: 'Space 2', category: 'headphones', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['D1402', 'Space 2', 'soundcore Space 2'], profileId: 'space-2-readonly',
    protocolStatus: 'read-only', protocolEvidence: 'soundcorebridge protocol-map.md: D1402 read state/battery/LDAC responses; writes require an unimplemented unlock/template sequence.', simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3062', name: 'Space One Pro', category: 'headphones', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3062', 'Space One Pro', 'soundcore Space One Pro'], profileId: 'space-one-pro',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3062 six-byte sound modes, LDAC, dual connections and battery offsets; EQ/HearID is read-only.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3035', name: 'Space One', category: 'headphones', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3035', 'Space One', 'soundcore Space One'], profileId: 'space-one',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3035 six-byte sound modes and LDAC; model-specific EQ is read-only.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'D1404', name: 'Q31i', category: 'headphones', marketStatus: 'regional-current', regions: ['US', 'EU'],
    aliases: ['D1404', 'Q31i', 'soundcore Q31i'], profileId: 'q31i',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3040', name: 'Space Q45', category: 'headphones', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3040', 'Q45', 'Space Q45', 'soundcore Space Q45'], profileId: 'q45',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3040 six-byte sound modes, LDAC and dual connections; model-specific EQ is read-only.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3028', name: 'Life Q30', category: 'headphones', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3028', 'Q30', 'Life Q30', 'soundcore Life Q30'], profileId: 'q30',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3028 classic sound modes and 02:81 EQ; live captures cross-checked.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3004', name: 'Q20i', category: 'headphones', marketStatus: 'current', regions: ['US', 'EU'],
    aliases: ['A3004', 'Q20i', 'soundcore Q20i'], profileId: 'q20i',
    protocolStatus: 'implemented', protocolEvidence: `${OPENSCQ30}: A3004 classic state layout and 02:83 DRC EQ.`, simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3005', name: 'Q11i', category: 'headphones', marketStatus: 'current', regions: ['US'],
    aliases: ['A3005', 'A3005Z21', 'A3005ZA1', 'Q11i', 'soundcore Q11i'], profileId: 'q11i',
    protocolStatus: 'implemented', protocolEvidence: 'OpenSCQ30 A3005 profile: 02:83 DRC EQ and dual connections; regional Z SKUs are aliases of A3005.', simulatorCoverage: 'covered', unitTestCoverage: 'covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3012', name: 'H30i', category: 'headphones', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3012', 'H30i', 'soundcore H30i'], profileId: 'h30i',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
  {
    sku: 'A3025', name: 'Life Q20', category: 'headphones', marketStatus: 'regional-current', regions: ['EU'],
    aliases: ['A3025', 'Life Q20', 'soundcore Life Q20'], profileId: 'life-q20',
    protocolStatus: 'unknown', protocolEvidence: GENERIC, simulatorCoverage: 'not-covered', unitTestCoverage: 'not-covered', physicalValidation: 'pending',
  },
];

/** Resolve a canonical SKU or an exact regional/model-number alias to one row. */
export function marketEntryForSku(skuOrAlias: string): MarketCatalogEntry | undefined {
  const normalized = skuOrAlias.trim().toUpperCase();
  return MARKET_CATALOG.find(
    (entry) =>
      entry.sku.toUpperCase() === normalized ||
      entry.aliases.some((alias) => alias.toUpperCase() === normalized),
  );
}

export function marketEntryForProfile(profileId: string): MarketCatalogEntry | undefined {
  return MARKET_CATALOG.find((entry) => entry.profileId === profileId);
}
