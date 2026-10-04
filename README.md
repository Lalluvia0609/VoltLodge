# VoltLodge

A local React/Vite hotel AC-charging simulation. No live chargers, messages or payments are connected.

```sh
npm install
npm run dev
npm test
npm run lint
npm run build
```

All displayed and entered times use `Pacific/Auckland`. Inputs reject nonexistent spring-forward times and choose the earlier occurrence of a repeated autumn hour. Elapsed charging time is measured in UTC milliseconds.

## Charging plans

Guests enter current/target battery percentages, usable capacity and their vehicle's maximum **AC** acceptance power. Energy is capacity × percentage increase / 100, without charging losses. Vehicle and charger limits are stored independently. A/B/C/D's simulated AC limits are 11/11/9/12 kW; they are not verified model specifications. A separate preset demonstrates 10.4/3.6 kW allocation with 11 kW chargers and a 14 kW site.

The first window uses remaining energy: the earliest finish assumes no competition and caps power by vehicle, charger and site. The full-load endpoint assumes every bay is charging under capped equal sharing; known competing AC limits are used, and otherwise a continuously demanding vehicle with the charger limit is assumed. A capped vehicle's unused share is redistributed. This defined envelope has no arbitrary time buffer. It is not a universal worst case under indefinite suspension or queue jumping.

Queue estimates separately report wait and charging duration. They assume occupied bays clear at their agreed move times and invited drivers plug in promptly. If an occupied bay is already overdue, wait is unknown and new commitments are declined. Physical plug-in delays or ignored move requests require a revised plan; they are not hidden by changing energy or timestamps.

On confirmation, the original latest completion is fixed. The current charging deadline and agreed move time are separate. The original window stays visible; changing targets recalculates remaining-energy forecasts without extending the commitment. An earlier move time adds an earlier constraint. Admission, target/AC changes and site/charger changes validate all live plans. Infeasible changes are rejected, rather than delaying an existing commitment. Insufficient-power experiments are available on the comparison page.

A guest can explicitly accept a later charging deadline. The absolute extension limit is original latest completion + configurable allowance (60 minutes by default), including repeated requests. Move-only extensions leave the charging deadline unchanged. A later use-by time entered through ordinary editing also leaves it unchanged.

## Shared allocation and simulation engine

Both the interactive demonstration and policy comparisons use `src/utils/allocation.ts`. Allocation first tries capped equal sharing. For the adaptive policy, interval max-flow verifies that this allocation preserves every deadline, energy requirement and power cap. If it does not, a feasible protected schedule supplies the allocation. In intentionally infeasible benchmark cases, earliest-deadline best effort is used and energy deficits remain visible.

The engine has a fixed one-minute grid and exact arrival, target and deadline events. Playback speed only batches identical internal steps. Energy earned from 07:55 to 08:00 is credited at 08:00, and charging stops at its deadline. Completion releases power, not the physical bay.

Cancellation stops charging but retains occupancy. A guest reporting a move waits for reception confirmation. Bay release reserves the next FIFO vehicle's bay; reception must confirm arrival and plug-in before power starts. Increasing a reached target can resume charging if all existing deadlines still remain feasible.

The comparison offers preset inputs or reactive current vehicles (remaining energy and existing deadlines retained). Four combinations use equal/adaptive power and managed/unmanaged moves. Move response, delays and available staff are configurable assumptions. Benchmarks assume immediate plug-in after invitation; the live demonstration requires physical confirmation. Managed staff moves are serialized by available staff; no response or zero staff is a supported experiment.

`tests/charging.test.tsx` covers numerical boundaries, capped redistribution, admission/extension/target rules, bay occupancy, reactive comparison, playback invariance, and Auckland/DST handling. `npm run lint` performs TypeScript checking.
