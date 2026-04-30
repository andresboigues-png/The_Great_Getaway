# The Great Getaway — Vision

This document captures what The Great Getaway (TGG) is, who it's for, and where
it's going. Every architectural decision should serve this vision; when in
doubt, re-read this.

Updated: 2026-04-30.

---

## Audience

Started personal — built for the founder and his partner. Showed it to friends
and family who travel together; reactions were strong enough to evolve the
ambition: **TGG should grow into a real product for the public market.**

The audience is travelers, broadly. Solo, in pairs, in groups. Casual or
serious. People who plan, people who track, people who reminisce. The
defensible position: **nothing on the market today does all three of those at
once with a real social layer.**

---

## The killer features (ranked)

### 1. Social / sharing — the differentiator

A social network for actual travel — not just photos, but **routes, plans,
journals, expenses**. People see where their friends have been in a meaningful
way. The shape of the trip, the actual day-by-day, what it cost, what was
worth it.

This is what nobody has nailed. Instagram shows photos but not journeys.
Polarsteps shows routes but no expenses or planning. Splitwise tracks
expenses but isn't social. **TGG is the first product that ties all of them
into one shareable artifact: a trip.**

### 2. Expense management & budgeting (with the social twist)

Real, useful expense tracking during and after a trip. But the killer move:
**make the cost a first-class part of what gets shared.** "Mongolia cost me
€1,800 over two weeks" becomes a story someone else can read, learn from,
and bet on. People go to social media specifically to find out what trips
cost — TGG makes that the default surface.

### 3. Planning + organic business discovery

People plan trips on TGG (manually or with AI). When researching destinations,
**relevant local businesses surface organically** — Greek-island boat rentals
when planning Greece, ryokans when planning Kyoto, etc. The opposite of
Instagram's intrusive ads: the ads only appear when they're useful, when the
user is actively looking.

This is potentially TGG's business model: a curated, relevance-based
discovery layer that travelers actually want, and businesses pay to be in.

---

## The user flow

The **default first interaction is browsing other people's trips** — friends'
profiles, public trips, inspiration. Discovery comes before creation.

Then:

1. **Plan a trip** — manually or with AI assist. Pick destinations, sketch
   days, get route suggestions, find flights eventually.
2. **During the trip** — log expenses, upload photos, attach tickets and
   documents. The app becomes a travel companion.
3. **After the trip** — review, journal, share with friends or publicly.
   Now the trip becomes content for someone else's discovery.

The cycle compounds: every shared trip is fuel for someone else's planning.

---

## Aesthetic target

Apple-esque with a touch of Instagram. Clean, sharp, modern.

- Mostly **white on blue** as the primary palette; other colors enter when
  semantically meaningful (categories, accents, alerts).
- **Liquid-glass** treatment on buttons and modals — backdrop-blur, soft
  shadows, light translucency.
- **Minimalism** — but with discoverable, friendly navigation. Users should
  never wonder where to go next.

The first-impression goal: a friend opens the app and within 10 seconds
thinks **"this looks modern and simple — let me plan a trip and see how it
helps me."** They should feel TGG is something they can trust to travel with.

---

## Currently meh, but necessary

- The **Excel-format mapping tables** in upload.js / settings.js. They exist
  for a real reason (importing past trips from spreadsheets) but the UX isn't
  where it should be. Candidate for "tuck behind a power-user toggle" in
  Phase D rather than front-and-center.

---

## Missing features the founder wants to build

- **Modules** — for businesses, flights, activities. The platform layer.
  This is what enables the organic-discovery business model.
- **Public feed** — photos, journals, whole trips. The social-network layer.
- **Multi-country trips** — current schema assumes one country per trip.
  Real trips chain destinations.
- **Achievement/badge system** — for countries visited, for specific trips
  within countries (so internal/domestic tourism counts too). Adds
  gameification and personal-milestone value.

---

## Open questions (to resolve as we go)

- **Social topology**: open public network (anyone can follow anyone) or
  friends-only invitation graph? Affects onboarding, moderation, growth. Answer: Basically, the idea is that there will be public profiles and proivate ones.
- **Monetization timing**: when does the organic-business-discovery layer
  enter? Year 1 (lean into it early) or year 3 (after the social network
  has critical mass)? Answer: I haven't really planned that out, might need your help on this. On the one hand we want this asap as we want to see how to correctly iterate it, on the other, it'll be hard to talk to businesses and present value if we haven't really got any critical mass yet. Another idea is to target tourism companies (Abreu viagens, etc.) for a platform that they can use to store & shre data with their clients. We get users, they get a database without needing to invest capital. That's something to think about.
- **Geographic scope at launch**: global from day one, or one strong market
  first? Affects currency support, language, regulatory complexity, cold-
  start network effects. Answer: Global from day one.

These don't need answers now. They'll get answered as the product takes shape
and signal arrives from real users.
