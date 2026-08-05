/**
 * Curated transport dataset for the Fjällkompis route, plus the validity logic
 * that decides whether a stored timetable is still in date.
 *
 * Plain .mjs (with a sibling .d.mts) so the Node test runner imports it
 * directly; the app imports it through Vite the same way. It is STATIC: every
 * fixed timetable carries an explicit validity range and is a snapshot, never
 * a live feed. The ONE live service (the train) has no hard-coded times — only
 * official planner links — because its times and disruption status must be
 * checked for the actual travel date. `timetableStatus()` + `kind: 'live'` keep
 * the app from ever presenting static data as live or guaranteed.
 *
 * Scope is deliberately limited to services relevant to THIS route
 * (Kiruna ↔ Abisko, the two optional boats, Kiruna ↔ Nikkaluokta) — not STF's
 * full mountain transport guide. All times/prices are transcribed from the
 * official 2026 sources cited on each entry; nothing is invented.
 *
 * BOTH OPERATOR DIRECTIONS ARE STORED SEPARATELY. The route is walked in two
 * directions, so the trailhead buses are needed both ways, and a return run is
 * NOT the outward run read backwards: line 91 calls Abisko Turiststation
 * BEFORE Abisko Östra on the way to Kiruna and after it on the way out, only
 * the daily northbound-return run stops at the airport, and the two operators'
 * boarding/drop-off rules invert. Every schedule below is therefore
 * transcribed from the table for that one real operator direction, and
 * `directions` says which WALKING direction(s) the service belongs to. Nothing
 * here is derived by reversing an array.
 */
import {
  DEFAULT_DIRECTION,
  REVERSE_DIRECTION,
  ROUTE_DIRECTIONS,
  isRouteDirection,
  normalizeDirection,
} from '../route/direction.mjs';

/** Shorthand for a service that means the same thing whichever way you walk. */
const BOTH_DIRECTIONS = ROUTE_DIRECTIONS;

export const TRANSPORT_FACTS_VERIFIED_ON = '2026-07-12';

/**
 * The date the two BUS timetables (Länstrafiken line 91 and
 * Nikkaluoktaexpressen) were re-read in full — both operator directions — to
 * add the return services below.
 *
 * The dataset-wide date above is deliberately NOT bumped to this one: the two
 * boats and the live train reference were not re-read on that pass, and a
 * single moved constant would have claimed they were.
 */
export const BUS_TIMETABLES_REVERIFIED_ON = '2026-08-05';

/** Line 91 Saturdays where the normal Saturday service is replaced. */
export const SPECIAL_LINE91_SATURDAYS = ['2026-08-22', '2026-08-29', '2026-09-05'];

/**
 * The four journey contexts, in reading order.
 *
 * `title` is what the section IS and never moves. `blurb` names the actual
 * endpoints, so for the two trailhead sections it depends on which way the
 * hiker walks — `blurbByDirection` carries the per-direction wording and the
 * plain `blurb` is the honest text for when no direction is known, never a
 * silent stand-in for one of them. Together with each card's own
 * "operator — A → B" title, this is how the active walking direction stays
 * readable off the section labels alone.
 */
export const TRANSPORT_SECTIONS = [
  {
    id: 'to-trail',
    title: 'Getting to the trail',
    blurb: 'Kiruna to either trailhead — Abisko or Nikkaluokta.',
    blurbByDirection: {
      'abisko-to-nikkaluokta': 'Kiruna to the Abisko trailhead.',
      'nikkaluokta-to-abisko': 'Kiruna to the Nikkaluokta trailhead.',
    },
  },
  {
    id: 'along-trail',
    title: 'Along the trail',
    blurb: 'Optional boats that shorten a stage.',
  },
  {
    id: 'from-trail',
    title: 'Leaving the trail',
    blurb: 'Either trailhead back to Kiruna — Nikkaluokta or Abisko.',
    blurbByDirection: {
      'abisko-to-nikkaluokta': 'Nikkaluokta back to Kiruna.',
      'nikkaluokta-to-abisko': 'Abisko back to Kiruna.',
    },
  },
  {
    id: 'live-alternative',
    title: 'Live alternatives',
    blurb: 'Services to check for your actual travel date.',
  },
];

const call = (place, time, note) => ({
  ...(place ? { place } : {}),
  ...(time ? { time } : {}),
  ...(note ? { note } : {}),
});

export const TRANSPORT_ENTRIES = [
  // ===================== A. GETTING TO THE TRAIL =====================
  {
    id: 'line-91',
    context: 'to-trail',
    // Only a hiker walking Abisko → Nikkaluokta travels TO Abisko. Someone
    // walking the other way finishes there and needs 'line-91-return'.
    directions: [DEFAULT_DIRECTION],
    mode: 'bus',
    operator: 'Länstrafiken Norrbotten',
    title: 'Bus line 91 — Kiruna → Abisko',
    direction: 'Kiruna → Abisko Turiststation',
    summary:
      'The reliable fixed-timetable way to the trailhead. Line 91 uses a special mountain fare — buy from the operator; no fixed fare is stored here.',
    validFrom: '2026-08-17',
    validTo: '2026-09-20',
    validityText: '17 August – 20 September 2026',
    operatingDays: 'Daily, with different afternoon runs by weekday',
    schedules: [
      {
        id: 'morning',
        label: 'Daily — morning',
        dayRule: 'Every day',
        calls: [
          call('Kiruna Sjukhus', '08:20'),
          call('Kiruna Stadshustorget', '08:25', 'boarding only'),
          call('Abisko Östra', '09:35'),
          call('Abisko Turist E10', '09:40'),
        ],
      },
      {
        id: 'weekday-afternoon',
        label: 'Mon–Fri — afternoon',
        dayRule: 'Monday to Friday',
        calls: [
          call('Kiruna Stadshustorget', '14:35', 'boarding only'),
          call('Kiruna Airport', '14:45', 'boarding only'),
          call('Abisko Östra', '15:55'),
          call('Abisko Turist E10', '16:00'),
        ],
      },
      {
        id: 'sunday-afternoon',
        label: 'Sun & public holidays — afternoon',
        dayRule: 'Sundays and public holidays',
        calls: [
          call('Kiruna Stadshustorget', '14:35', 'boarding only'),
          call('Kiruna Airport', '14:45', 'boarding only'),
          call('Abisko Östra', '15:55'),
          call('Abisko Turist E10', '16:00'),
        ],
      },
      {
        id: 'saturday-afternoon',
        label: 'Saturday — afternoon',
        dayRule: 'Normal Saturdays',
        exception: 'Does not run on 22 Aug, 29 Aug or 5 Sep 2026 (see the special service).',
        notDates: SPECIAL_LINE91_SATURDAYS,
        calls: [
          call('Kiruna Stadshustorget', '14:35', 'boarding only'),
          call('Abisko Östra', '15:45'),
          call('Abisko Turist E10', '15:50'),
        ],
      },
      {
        id: 'special-saturday',
        label: 'Special Saturdays — 22 & 29 Aug, 5 Sep',
        dayRule: 'These three Saturdays only',
        exception: 'Replaces the normal Saturday afternoon service on these dates.',
        onlyDates: SPECIAL_LINE91_SATURDAYS,
        calls: [
          call('Kiruna Stadshustorget', '15:35', 'boarding only'),
          call('Kiruna Airport', '15:45', 'boarding only'),
          call('Abisko Östra', '16:55'),
          call('Abisko Turist E10', '17:00'),
        ],
      },
    ],
    warnings: [
      'Special mountain fare — buy from the operator. No fixed fare is stored here.',
      '“Boarding only” stops let passengers on but not off.',
    ],
    source: {
      title: 'Länstrafiken — Fjällinje 91/94 (17 Aug – 20 Sep 2026)',
      url: 'https://www.iphone.fskab.se/ltn/Fjallinje91o94/260817_260920/Fjallinje91o94_91_260817_260920.pdf',
      publisher: 'Länstrafiken Norrbotten',
      sourceYear: 2026,
      validFrom: '2026-08-17',
      validTo: '2026-09-20',
      lastVerified: TRANSPORT_FACTS_VERIFIED_ON,
      kind: 'static',
      warning: 'Timetable is a static snapshot — check the official source before travelling.',
    },
  },
  {
    id: 'nikkaluoktaexpressen-outbound',
    context: 'to-trail',
    // The mirror of 'line-91': the way OUT to the southern trailhead, which is
    // where a Nikkaluokta → Abisko hiker starts walking.
    directions: [REVERSE_DIRECTION],
    mode: 'bus',
    operator: 'Nikkaluoktaexpressen',
    title: 'Nikkaluoktaexpressen — Kiruna → Nikkaluokta',
    direction: 'Kiruna → Nikkaluokta',
    summary:
      'The bus out to the southern trailhead. Daily, with a morning and an afternoon departure.',
    validFrom: '2026-08-10',
    validTo: '2026-09-20',
    validityText: '10 August – 20 September 2026',
    operatingDays: 'Daily (Monday–Sunday)',
    schedules: [
      {
        id: 'morning',
        label: 'Morning departure',
        calls: [
          call('Kiruna Norrmalm', '10:00'),
          call('Kiruna railway station', '10:10', 'boarding only'),
          call('Kiruna Stadshustorget', '10:20', 'boarding only'),
          call('Kiruna Airport', '10:30', 'boarding only'),
          call('Nikkaluokta Fjällanläggning', '11:30'),
        ],
      },
      {
        id: 'afternoon',
        label: 'Afternoon departure',
        calls: [
          call('Kiruna Airport', '14:55'),
          call('Kiruna Stadshustorget', '15:05', 'boarding only'),
          call('Kiruna Norrmalm', '15:15', 'boarding only'),
          call('Kiruna railway station', '15:25', 'boarding only'),
          call('Nikkaluokta Fjällanläggning', '16:30'),
        ],
      },
    ],
    booking: 'Book online in advance for the normal price.',
    bookingDeadline:
      'Online booking closes one hour before the bus leaves its first Kiruna stop.',
    paymentMethods: 'Onboard by card or SEK cash (surcharge applies)',
    connections: [
      'Operator note: the 10:10 departure from Kiruna railway station waits for a late night train until 10:20 if needed.',
      'Operator note: the 10:30 departure from Kiruna Airport waits for flights scheduled to land by 10:00 — until 10:40 for pre-booked passengers.',
      'Operator note: the 14:55 departure from Kiruna Airport waits for flights scheduled to land by 14:05 — until 15:05 for pre-booked passengers.',
      'Operator note: the 15:25 departure from Kiruna railway station waits for a late train until 15:35 if needed.',
      'These are operator connection notes, not unconditional guarantees.',
    ],
    warnings: [
      'Tickets bought onboard cost the normal price plus SEK 200 per person.',
      '“Boarding only” stops let passengers on but not off.',
    ],
    contact: ['Traffic information: +46 980 813 11'],
    extraLinks: [
      { label: 'Timetable (nikkaluoktaexpressen.se)', url: 'https://nikkaluoktaexpressen.se/tidtabell' },
      { label: 'Operator (English)', url: 'https://nikkaluoktaexpressen.se/?lang=en' },
    ],
    source: {
      title: 'Nikkaluoktaexpressen — timetable (10 Aug – 20 Sep 2026)',
      url: 'https://savea.objects.dc-fbg1.glesys.net/61bf9c13daa83d2a37d6609a85ae57f0f2e6cbb1.pdf',
      publisher: 'Nikkaluoktaexpressen',
      sourceYear: 2026,
      validFrom: '2026-08-10',
      validTo: '2026-09-20',
      lastVerified: BUS_TIMETABLES_REVERIFIED_ON,
      kind: 'static',
      warning: 'Timetable is a static snapshot — check the official source before travelling.',
    },
  },

  // ===================== B. BOATS ALONG THE ROUTE =====================
  {
    id: 'alesjaure-boat',
    context: 'along-trail',
    // Bidirectional with the SAME source and the same times: the operator
    // publishes one timetable with a sailing FROM the cabin and a sailing FROM
    // the jetty, and both schedules below are already that source verbatim. A
    // hiker uses whichever leg matches their day, either way round.
    directions: BOTH_DIRECTIONS,
    mode: 'boat',
    operator: 'Roland Enoksson',
    title: 'Alesjaure – Abiskojaure boat (optional)',
    direction: 'Alesjaure cabin ⇄ outlet jetty',
    summary:
      'Optional lake boat that shortens the walking stage by about 6 km. Summer only — it does not run for September itineraries.',
    validFrom: '2026-07-01',
    validTo: '2026-08-30',
    validityText: '1 July – 30 August 2026 (summer only)',
    operatingDays: 'Summer season only — unavailable from 31 August',
    schedules: [
      {
        id: 'from-alesjaure',
        label: 'From Alesjaure Mountain Cabin',
        calls: [call(null, '10:00'), call(null, '15:00'), call(null, '17:00'), call(null, '18:30')],
      },
      {
        id: 'from-jetty',
        label: 'From the outlet jetty → Alesjaure',
        calls: [call(null, '10:30'), call(null, '15:30'), call(null, '17:30'), call(null, '19:00')],
      },
    ],
    prices: [
      { label: 'Adult', price: 'SEK 500' },
      { label: 'Child (up to 12)', price: 'SEK 200' },
      { label: 'Dog', price: 'Free' },
      { label: 'Extra backpack (if space)', price: 'SEK 200' },
    ],
    paymentMethods: 'Swedish cash, EUR, NOK and cards',
    walkingContext: ['Shortens the Alesjaure–Abiskojaure stage by about 6 km.'],
    warnings: [
      'Seasonal (1 Jul – 30 Aug) — not available for September itineraries.',
      'Extra trips outside the timetable run the same route, minimum six people.',
    ],
    contact: ['Roland Enoksson', '+46 70 634 34 39', '+46 72 753 67 98'],
    source: {
      title: 'STF — Boats in the mountains',
      url: 'https://www.swedishtouristassociation.com/guides/mountains/transport/boats/',
      publisher: 'Svenska Turistföreningen (STF)',
      sourceYear: 2026,
      validFrom: '2026-07-01',
      validTo: '2026-08-30',
      lastVerified: TRANSPORT_FACTS_VERIFIED_ON,
      kind: 'static',
      warning: 'Timetable is a static snapshot — confirm with the operator before relying on it.',
    },
  },
  {
    id: 'laddjujavri-boat',
    context: 'along-trail',
    // Bidirectional with the same source: the two schedules below ARE the
    // operator's two crossing directions (lower bridge → Kebnekaise and upper
    // bridge → Nikkaluokta), each with its own published times.
    directions: BOTH_DIRECTIONS,
    mode: 'boat',
    operator: 'Enoks – Láddjujávri',
    title: 'Láddjujávri boat (Kebnekaise ⇄ Nikkaluokta)',
    direction: 'Lower bridge ⇄ upper bridge',
    summary:
      'Optional boat across Láddjujávri on the Kebnekaise–Nikkaluokta leg — about 6 km, roughly 20–30 minutes.',
    validFrom: '2026-06-12',
    validTo: '2026-09-13',
    validityText: 'Daily, 12 June – 13 September 2026',
    operatingDays: 'Daily',
    durationText: '≈ 6 km · 20–30 min',
    schedules: [
      {
        id: 'lower-to-kebnekaise',
        label: 'From the lower bridge → Kebnekaise',
        calls: [
          call(null, '09:00'),
          call(null, '10:30'),
          call(null, '12:00', '2 Jul – 16 Aug only'),
          call(null, '13:30'),
          call(null, '14:30', '2 Jul – 16 Aug only'),
          call(null, '18:15'),
        ],
      },
      {
        id: 'upper-to-nikkaluokta',
        label: 'From the upper bridge → Nikkaluokta',
        calls: [
          call(null, '09:30'),
          call(null, '11:00'),
          call(null, '12:30', '2 Jul – 16 Aug only'),
          call(null, '14:00'),
          call(null, '15:00', '2 Jul – 16 Aug only'),
          call(null, '18:45'),
        ],
      },
    ],
    prices: [
      { label: 'Adult (one-way)', price: 'SEK 500' },
      { label: 'Child up to 12 with parent', price: 'SEK 250' },
      { label: 'Dog', price: 'SEK 100' },
    ],
    paymentMethods: 'Cash or card',
    walkingContext: [
      'Nikkaluokta → lower bridge: ≈ 5.6 km / 1.5 h.',
      'Kebnekaise station → upper bridge: ≈ 8 km / 2.5–3 h.',
    ],
    connections: [
      'The 09:30 boat may connect to the 11:50 Nikkaluokta bus, but the margin is tight.',
      'The 11:00 or 14:00 boats align more conservatively with the 16:40 bus.',
      'Never a guaranteed connection — walking pace, queues and weather can invalidate it.',
    ],
    contact: ['info@enoks.se', '+46 73 031 70 27'],
    source: {
      title: 'Enoks — Boat departures (Láddjujávri)',
      url: 'https://www.enoks.se/en/boat-departures/',
      publisher: 'Enoks',
      sourceYear: 2026,
      validFrom: '2026-06-12',
      validTo: '2026-09-13',
      lastVerified: TRANSPORT_FACTS_VERIFIED_ON,
      kind: 'static',
      warning: 'Timetable is a static snapshot — confirm with the operator before relying on it.',
    },
  },

  // ===================== C. LEAVING THE TRAIL =====================
  {
    id: 'nikkaluoktaexpressen',
    context: 'from-trail',
    // Only a hiker walking Abisko → Nikkaluokta finishes at Nikkaluokta.
    directions: [DEFAULT_DIRECTION],
    mode: 'bus',
    operator: 'Nikkaluoktaexpressen',
    title: 'Nikkaluoktaexpressen — Nikkaluokta → Kiruna',
    direction: 'Nikkaluokta → Kiruna',
    summary: 'The bus back to Kiruna from the southern trailhead. Daily, with a morning and an afternoon departure.',
    validFrom: '2026-08-10',
    validTo: '2026-09-20',
    validityText: '10 August – 20 September 2026',
    operatingDays: 'Daily (Monday–Sunday)',
    schedules: [
      {
        id: 'morning',
        label: 'Morning departure',
        calls: [
          call('Nikkaluokta Fjällanläggning', '11:50'),
          call('Kiruna Airport', '12:50', 'drop-off only'),
          call('Kiruna Stadshustorget', '13:00', 'drop-off only'),
          call('Kiruna railway station', '13:10', 'drop-off only'),
          call('Kiruna Norrmalm', '13:20', 'drop-off only'),
        ],
      },
      {
        id: 'afternoon',
        label: 'Afternoon departure',
        calls: [
          call('Nikkaluokta Fjällanläggning', '16:40'),
          call('Kiruna railway station', '17:45', 'drop-off only'),
          call('Kiruna Norrmalm', '17:55', 'drop-off only'),
          call('Kiruna Stadshustorget', '18:05', 'drop-off only'),
          call('Kiruna Airport', '18:15', 'drop-off only'),
        ],
      },
    ],
    booking: 'Book online in advance for the normal price.',
    bookingDeadline: 'Online booking closes one hour before departure from Nikkaluokta.',
    paymentMethods: 'Onboard by card or SEK cash (surcharge applies)',
    connections: [
      'Operator note: the 11:50 bus connects to flights departing no earlier than 13:40.',
      'Operator note: the 16:40 bus connects to the night train scheduled around 17:58/18:01.',
      'Operator note: the 16:40 bus connects to flights departing no earlier than 19:05.',
      'These are operator connection notes, not unconditional guarantees.',
    ],
    warnings: [
      'Tickets bought onboard cost the normal price plus SEK 200 per person.',
      '“Drop-off only” stops are served only when passengers need to get off.',
    ],
    contact: ['Traffic information: +46 980 813 11'],
    extraLinks: [
      { label: 'Timetable (nikkaluoktaexpressen.se)', url: 'https://nikkaluoktaexpressen.se/tidtabell' },
      { label: 'Operator (English)', url: 'https://nikkaluoktaexpressen.se/?lang=en' },
    ],
    source: {
      title: 'Nikkaluoktaexpressen — timetable (10 Aug – 20 Sep 2026)',
      url: 'https://savea.objects.dc-fbg1.glesys.net/61bf9c13daa83d2a37d6609a85ae57f0f2e6cbb1.pdf',
      publisher: 'Nikkaluoktaexpressen',
      sourceYear: 2026,
      validFrom: '2026-08-10',
      validTo: '2026-09-20',
      lastVerified: TRANSPORT_FACTS_VERIFIED_ON,
      kind: 'static',
      warning: 'Timetable is a static snapshot — check the official source before travelling.',
    },
  },
  {
    id: 'line-91-return',
    context: 'from-trail',
    // The mirror of 'line-91': the way back from the northern trailhead, which
    // is where a Nikkaluokta → Abisko hiker finishes walking.
    directions: [REVERSE_DIRECTION],
    mode: 'bus',
    operator: 'Länstrafiken Norrbotten',
    title: 'Bus line 91 — Abisko → Kiruna',
    direction: 'Abisko Turiststation → Kiruna',
    summary:
      'The reliable fixed-timetable way back from the northern trailhead. Line 91 uses a special mountain fare — buy from the operator; no fixed fare is stored here.',
    validFrom: '2026-08-17',
    validTo: '2026-09-20',
    validityText: '17 August – 20 September 2026',
    operatingDays: 'Daily, with different afternoon runs by weekday',
    // Transcribed from the Riksgränsen → Kiruna half of the same PDF, which is
    // NOT the outward table read upwards: Abisko Turist is called BEFORE
    // Abisko Östra here, Rensjön is a timed call in this direction only, and
    // just the daily late-morning run touches the airport.
    schedules: [
      {
        id: 'morning',
        label: 'Daily — late morning',
        dayRule: 'Every day',
        calls: [
          call('Abisko Turist E10', '11:20'),
          call('Abisko Östra', '11:25'),
          call('Rensjön E10', '12:10'),
          call('Kiruna Airport', '12:40', 'drop-off only'),
          call('Kiruna Stadshustorget', '12:50', 'drop-off only'),
          call('Kiruna Sjukhus', '12:55'),
        ],
      },
      {
        id: 'weekday-afternoon',
        label: 'Mon–Fri — afternoon',
        dayRule: 'Monday to Friday',
        calls: [
          call('Abisko Turist E10', '17:50'),
          call('Abisko Östra', '17:55'),
          call('Rensjön E10', '18:35'),
          call('Kiruna Stadshustorget', '19:05', 'drop-off only'),
          call('Kiruna Sjukhus', '19:10'),
        ],
      },
      {
        id: 'sunday-afternoon',
        label: 'Sun & public holidays — afternoon',
        dayRule: 'Sundays and public holidays',
        calls: [
          call('Abisko Turist E10', '17:50'),
          call('Abisko Östra', '17:55'),
          call('Rensjön E10', '18:35'),
          call('Kiruna Stadshustorget', '19:05', 'drop-off only'),
          call('Kiruna Sjukhus', '19:10'),
        ],
      },
      {
        id: 'saturday-afternoon',
        label: 'Saturday — afternoon',
        dayRule: 'Normal Saturdays',
        exception: 'Does not run on 22 Aug, 29 Aug or 5 Sep 2026 (see the special service).',
        notDates: SPECIAL_LINE91_SATURDAYS,
        calls: [
          call('Abisko Turist E10', '17:40'),
          call('Abisko Östra', '17:45'),
          call('Rensjön E10', '18:25'),
          call('Kiruna Stadshustorget', '18:55', 'drop-off only'),
          call('Kiruna Sjukhus', '19:00'),
        ],
      },
      {
        id: 'special-saturday',
        label: 'Special Saturdays — 22 & 29 Aug, 5 Sep',
        dayRule: 'These three Saturdays only',
        exception: 'Replaces the normal Saturday afternoon service on these dates.',
        onlyDates: SPECIAL_LINE91_SATURDAYS,
        calls: [
          call('Abisko Turist E10', '18:40'),
          call('Abisko Östra', '18:45'),
          call('Rensjön E10', '19:25'),
          call('Kiruna Stadshustorget', '19:55', 'drop-off only'),
          call('Kiruna Sjukhus', '20:00'),
        ],
      },
    ],
    warnings: [
      'Special mountain fare — buy from the operator. No fixed fare is stored here.',
      '“Drop-off only” stops let passengers off but not on.',
    ],
    source: {
      title: 'Länstrafiken — Fjällinje 91/94 (17 Aug – 20 Sep 2026)',
      url: 'https://www.iphone.fskab.se/ltn/Fjallinje91o94/260817_260920/Fjallinje91o94_91_260817_260920.pdf',
      publisher: 'Länstrafiken Norrbotten',
      sourceYear: 2026,
      validFrom: '2026-08-17',
      validTo: '2026-09-20',
      lastVerified: BUS_TIMETABLES_REVERIFIED_ON,
      kind: 'static',
      warning: 'Timetable is a static snapshot — check the official source before travelling.',
    },
  },

  // ===================== D. LIVE ALTERNATIVES / VERIFICATION =====================
  // The train is the live alternative to line 91 on the Kiruna ⇄ Abisko leg,
  // and it is genuinely useful both ways round. It is stored as two records
  // for the same reason the buses are: one record, one real travelling
  // direction — so the endpoints a hiker reads (and the ones "Add to Trip"
  // copies) are the endpoints of the journey they are actually making. Neither
  // record stores times; both point at the same live planner.
  {
    id: 'train-kiruna-abisko',
    context: 'live-alternative',
    directions: [DEFAULT_DIRECTION],
    mode: 'train',
    operator: 'SJ',
    title: 'Train — Kiruna → Abisko',
    direction: 'Kiruna railway station → Abisko Östra / Abisko Turiststation',
    summary:
      'A live-planner alternative for reaching Abisko. Unlike the bus, no fixed times are stored — check SJ for your actual travel date and current disruptions.',
    live: true,
    warnings: [
      'Times and disruption status change by date — always check SJ for your actual travel date.',
      'No fixed train timetable is stored in the app; this is a live alternative to the bus, not a saved schedule.',
    ],
    extraLinks: [
      { label: 'Plan a journey (sj.se)', url: 'https://www.sj.se/en' },
      { label: 'Traffic information (sj.se)', url: 'https://www.sj.se/en/traffic-information' },
    ],
    source: {
      title: 'SJ — journey planner & traffic information',
      url: 'https://www.sj.se/en',
      publisher: 'SJ AB',
      lastVerified: TRANSPORT_FACTS_VERIFIED_ON,
      kind: 'live',
      warning: 'Live service — times and disruptions must be checked for the actual travel date.',
    },
  },
  {
    id: 'train-abisko-kiruna',
    context: 'live-alternative',
    directions: [REVERSE_DIRECTION],
    mode: 'train',
    operator: 'SJ',
    title: 'Train — Abisko → Kiruna',
    direction: 'Abisko Turiststation / Abisko Östra → Kiruna railway station',
    summary:
      'A live-planner alternative for leaving from Abisko. Unlike the bus, no fixed times are stored — check SJ for your actual travel date and current disruptions.',
    live: true,
    warnings: [
      'Times and disruption status change by date — always check SJ for your actual travel date.',
      'No fixed train timetable is stored in the app; this is a live alternative to the bus, not a saved schedule.',
    ],
    extraLinks: [
      { label: 'Plan a journey (sj.se)', url: 'https://www.sj.se/en' },
      { label: 'Traffic information (sj.se)', url: 'https://www.sj.se/en/traffic-information' },
    ],
    source: {
      title: 'SJ — journey planner & traffic information',
      url: 'https://www.sj.se/en',
      publisher: 'SJ AB',
      // The planner reference itself was not re-read on the bus pass, so it
      // keeps the date on which it WAS checked.
      lastVerified: TRANSPORT_FACTS_VERIFIED_ON,
      kind: 'live',
      warning: 'Live service — times and disruptions must be checked for the actual travel date.',
    },
  },
];

// --- Validity logic (pure, testable) -----------------------------------------

/**
 * Validity state of a transport entry relative to an ISO date (yyyy-mm-dd).
 * ISO date strings compare correctly with < / >, so no Date parsing is needed.
 *  - 'live'     → a live-planner alternative (no fixed timetable to expire);
 *  - 'undated'  → a fixed service with no encoded validity window;
 *  - 'upcoming' → before its window (not yet valid);
 *  - 'valid'    → inside its window;
 *  - 'expired'  → after its window — surfaced as "check source", never hidden.
 */
export function timetableStatus(entry, todayIso) {
  if (entry.live) return 'live';
  if (!entry.validFrom || !entry.validTo) return 'undated';
  if (todayIso < entry.validFrom) return 'upcoming';
  if (todayIso > entry.validTo) return 'expired';
  return 'valid';
}

/** Whether a specific schedule run operates on an ISO date (special-date rules). */
export function scheduleRunsOn(schedule, iso) {
  if (schedule.onlyDates && !schedule.onlyDates.includes(iso)) return false;
  if (schedule.notDates && schedule.notDates.includes(iso)) return false;
  return true;
}

/** Entries for one journey-context section, in dataset order. */
export function entriesForContext(context) {
  return TRANSPORT_ENTRIES.filter((e) => e.context === context);
}

// --- Direction-aware assembly (pure, testable) -------------------------------

/**
 * The transport reference as one WALKING direction needs to read it.
 *
 * This is the single place where a personal walking direction meets the
 * reference dataset. It selects whole entries — it never rewrites, mirrors or
 * reverses one — so "Getting to the trail" always contains a real service that
 * really runs towards the trailhead the hiker starts from.
 *
 * `direction` is deliberately NOT normalised here. An unrecognised value means
 * "no direction is known", and the honest answer to that is every service
 * under the endpoint-naming blurbs, not a guess at one of the two — guessing
 * would present the wrong half of the reference as personal advice. (The app
 * itself never reaches that branch: `state.routeDirection` is always one of
 * the two, resolved by the central normalisation in src/route/direction.mjs
 * when persisted state is loaded.) Nothing is ever dropped silently: an entry
 * is either in its section or the section it would sit in is empty.
 *
 * Returns the four contexts by name, plus a render-ready ordered `sections`
 * list so presentation needs no direction logic of its own.
 */
export function transportSectionsFor(direction) {
  const active = isRouteDirection(direction) ? direction : null;
  const applies = (entry) => active === null || entry.directions.includes(active);
  const forContext = (context) => entriesForContext(context).filter(applies);

  const byContext = {
    'to-trail': forContext('to-trail'),
    'along-trail': forContext('along-trail'),
    'from-trail': forContext('from-trail'),
    'live-alternative': forContext('live-alternative'),
  };

  return {
    /** The direction these sections describe, or null when none is known. */
    direction: active,
    toTrail: byContext['to-trail'],
    alongTrail: byContext['along-trail'],
    fromTrail: byContext['from-trail'],
    liveAlternatives: byContext['live-alternative'],
    sections: TRANSPORT_SECTIONS.map((section) => ({
      id: section.id,
      title: section.title,
      blurb: sectionBlurb(section, active),
      entries: byContext[section.id],
    })).filter((section) => section.entries.length > 0),
  };
}

/** A section's endpoint-naming blurb for a direction (null → the neutral one). */
export function sectionBlurb(section, direction) {
  if (direction === null || !section.blurbByDirection) return section.blurb;
  return section.blurbByDirection[direction] ?? section.blurb;
}

/**
 * Explicit, small stop → transport mapping for the Stops → Transport deep link.
 * Kept next to the data so IDs are not scattered across components. Only stops
 * with a directly relevant Transport entry appear here.
 *  - `via: 'facility'` reuses the stop's existing Public transport facility chip
 *    (Abisko, Nikkaluokta);
 *  - `via: 'derived'` is a quick-link action rendered from this mapping, not
 *    from curated `stop.facilities` (the two optional boats).
 * A `context` opens/focuses a whole section (Abisko → both line 91 and the
 * train are relevant); an `entryId` opens/focuses one entry.
 *
 * The two TRAILHEADS carry a target per walking direction, because which
 * section a hiker wants from them depends on whether they start or finish
 * there: Abisko is "Getting to the trail" walking south and "Leaving the
 * trail" walking north, and Nikkaluokta's bus is a different real service each
 * way. The two boats are on the route itself and mean the same thing either
 * way, so they stay direction-neutral.
 */
export const STOP_TRANSPORT_LINKS = {
  abisko: {
    via: 'facility',
    byDirection: {
      'abisko-to-nikkaluokta': { context: 'to-trail', label: 'Getting to the trail' },
      'nikkaluokta-to-abisko': { context: 'from-trail', label: 'Leaving the trail' },
    },
  },
  nikkaluokta: {
    via: 'facility',
    byDirection: {
      'abisko-to-nikkaluokta': { entryId: 'nikkaluoktaexpressen', label: 'Bus timetable' },
      'nikkaluokta-to-abisko': { entryId: 'nikkaluoktaexpressen-outbound', label: 'Bus timetable' },
    },
  },
  alesjaure: { via: 'derived', entryId: 'alesjaure-boat', label: 'Boat timetable' },
  kebnekaise: { via: 'derived', entryId: 'laddjujavri-boat', label: 'Boat timetable' },
};

/**
 * The resolved transport deep-link for a stop, or undefined when none applies.
 *
 * Unlike {@link transportSectionsFor}, this DOES normalise the direction: a
 * navigation target has to be one place, so "show both" is not available to
 * it. Normalising is the app's existing central behaviour for a direction that
 * cannot be recognised (src/route/direction.mjs), and in practice the branch
 * is unreachable — the caller reads the store, which always holds a valid one.
 */
export function transportLinkForStop(stopId, direction) {
  const link = STOP_TRANSPORT_LINKS[stopId];
  if (!link || !link.byDirection) return link;
  return { via: link.via, ...link.byDirection[normalizeDirection(direction)] };
}
