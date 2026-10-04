# VoltLodge

EV charging for hotels, with shared power and coordinated bay turnover.

VoltLodge is a Climate Hackathon prototype for small hotels and motels. Guests book a charge around their stay, and reception manages the available power, charging bays and vehicle moves.

Two constraints shape the project. A hotel may not have enough power to run every charger at full capacity, and a car that has finished charging may still occupy a bay. VoltLodge uses the guest’s accepted completion deadline to share power, while keeping physical bay availability separate from charging status.

The climate focus is **Electrification**: more dependable charging at accommodation could make electric travel easier. The demo measures charging service and infrastructure use. It does not calculate carbon savings or claim to measure EV adoption.

## Run locally

Use Node.js 22.12 or newer and npm. In the project folder:

```sh
npm install
npm run dev
```

Open the address printed in the terminal, normally **http://localhost:3000**. Leave the terminal running while using the app. Press **Ctrl+C** to stop the development server.

No API key or `.env` file is needed for the charging simulation. The entries in `.env.example` belong to the original app template and are not used by this workflow.

Other commands:

```sh
npm test          # Calculation and workflow tests
npm run lint      # TypeScript checks
npm run build     # Production bundle in dist/
npm run preview   # Preview the production build locally
```

To share the demo beyond your computer, deploy `dist/` to a web host. A localhost address only works on the machine running it.

## Try the demo

The app has three views:

| View | Purpose |
| --- | --- |
| Guest Portal | Register or book ahead, choose a charge target, review the estimates and arrange a move. |
| Front Desk | Confirm arrival and plug-in, manage the queue, arrange staff assistance and verify bay vacancy. |
| Comparison | Compare power sharing and bay management using the same vehicles and site limits. |

A useful walkthrough is to register a guest, review the predicted completion window, and confirm a move time. In Front Desk, confirm that the car is parked and plugged in, then advance the simulation. When the target is reached, watch the power stop while the bay stays occupied. **Confirm Bay Vacated** releases it and invites the next eligible guest.

All views are available in the demo; guest and staff accounts are not separated. **Bookings and History are held in memory. Refreshing the page or resetting the simulation clears them.**

## The guest booking flow

1. Choose **Book ahead** or **Register now**. Advance bookings require an arrival date and time; on-site registration uses the current simulation time.
2. Enter a name, optional room number, current battery percentage and target percentage, then choose a simulated vehicle type.
3. Review the fastest–latest completion window and the expected finish under the current arrangement. Waiting for a bay is shown separately from charging time.
4. Choose **Move your car by**, or request staff assistance, then review and confirm the arrangement.

There is one guest move-time field. A later move time does not, by itself, permit a later charging finish.

For advance bookings, the current battery percentage means the expected level **on arrival**. The guest confirms the actual level when they arrive. If it differs, the app recalculates the energy needed and asks the guest to review any change to the arrangement. It does not silently extend an accepted deadline. Charging starts only after arrival and reception’s parking and plug-in confirmation.

### Early departure and extensions

Guests may choose a move time before the estimated latest finish. If the target cannot be reached by then, the app calculates the expected battery percentage and asks for explicit acceptance of the shortfall. It keeps the original target separately from the reduced charging promise.

Three times remain distinct internally:

| Time | Meaning |
| --- | --- |
| Original latest completion | The latest finish accepted with the original plan; this stays fixed. |
| Current charging deadline | The accepted deadline for delivering the promised energy. |
| Agreed move time | When the guest has arranged to vacate the bay. |

Only explicit agreement to delayed charging can extend the charging deadline. The system checks whether the revised arrangement is feasible before accepting it. An earlier move can impose an earlier charging cutoff.

The move-time ceiling is **original latest completion + 60 minutes** by default. The allowance is configurable and applies to both initial confirmation and later changes. Repeated extensions do not add another hour each time.

Guests can also change their target or vehicle type, stop charging, report a move, or request assistance. Changes are checked against other confirmed bookings. Stopping charging does not release an occupied bay.

## Vehicle types and booking identity

Guests choose a type rather than entering battery capacity or charging power. Parameters are defined together in [src/data/vehicleTypes.ts](src/data/vehicleTypes.ts).

| Type | Usable battery capacity | Maximum AC acceptance power |
| --- | --- | --- |
| Type A | 60 kWh | 11 kW |
| Type B | 60 kWh | 11 kW |
| Type C | 64 kWh | 9 kW |
| Type D | 75 kWh | 12 kW |

These are simulated values, not verified specifications for commercial models. Engineering tests may use other values, such as a vehicle limited to 3.6 kW. The project models **AC charging**.

A guest’s name, vehicle type and booking ID serve different purposes. `guestName` identifies the person, `vehicleType` supplies the vehicle parameters, and `requestId` uniquely identifies the booking. Several guests can choose Type A and still have separate bookings.

Lists show names first, such as **Henry · Type A**. Same-name guests are distinguished by room number or a short booking ID. A booking without a name displays **Guest + short booking ID**.

Vehicle, charger and site power limits are stored separately. An 11 kW vehicle connected to a 7 kW charger cannot receive more than 7 kW. Its acceptance limit is not its current charging rate.

## Completion estimates and power sharing

Energy is calculated from the battery percentages:

```text
Required energy = usable capacity × (target % − arrival %) / 100
Remaining energy = max(0, required energy − energy already delivered)
```

A 60 kWh battery going from 40% to 80% needs 24 kWh. This version ignores charging losses and changes in acceptance power as the battery fills.

### What the estimates mean

The fastest estimate assumes no competition for power and uses the smallest of the vehicle AC limit, charger limit and site budget.

The full-load estimate assumes every bay continuously needs power and uses capped equal sharing. Known competing vehicle limits are included; an unknown vehicle is assumed to accept the charger’s limit. When one vehicle reaches its power cap, unused capacity is redistributed.

For example, four 7 kW chargers sharing 14 kW give each vehicle 3.5 kW under full load. A car needing 7 kWh takes one hour without competition or two hours at that shared rate. An 18:00 start gives a 19:00–20:00 window.

The current-plan estimate also considers existing vehicles, future bookings and planned bay availability. The forecasts assume drivers arrive, plug in and vacate bays as arranged. They cannot provide a finite worst case for indefinite parking or delayed plug-in. An overdue occupied bay has an unknown release time; zero available power produces an unavailable estimate.

### How adaptive allocation uses the deadline

The starting point for each connected vehicle is:

```text
Required average power = remaining promised energy / hours until the accepted cutoff
```

The accepted cutoff respects both the charging deadline and any earlier agreed move time. Spare site power is then shared in proportion to remaining energy, with redistribution whenever a vehicle reaches its limit. A nearly finished car does not automatically receive its full charger power just because it arrived earlier.

An interval scheduling check verifies that the proposed allocation leaves enough future capacity for every confirmed promise, including upcoming bookings. If necessary, the allocator adjusts the shares to keep that schedule feasible. Max-flow supplies a feasibility check and a starting point for this adjustment; its arbitrary flow is not returned directly as the live allocation.

Every allocation respects the vehicle AC limit, charger limit and total site budget. Power is recalculated as energy is delivered, vehicles arrive or finish, arrangements change, or the site budget changes. If urgent deadlines genuinely need all available power, flexible vehicles can temporarily receive zero.

New bookings cannot silently relax an existing guest’s promise. In intentionally infeasible comparison scenarios, the engine makes a best effort and reports the missing energy. Deadline protection depends on the modelled power and arrival assumptions; an occupied bay that is not vacated on time can still block service.

## Bay turnover, penalties and History

A completed charge is not an available bay. The live workflow distinguishes:

| State | Bay availability |
| --- | --- |
| Charging | Occupied |
| Charging complete or stopped | Occupied, awaiting a move |
| Guest reports a move | Awaiting reception verification |
| Reception confirms vacancy | Released, then available for the next eligible booking |
| Next booking invited | Reserved, awaiting parking and plug-in confirmation |

The queue identifies the guest blocking an occupied bay. A later booking stays waiting until vacancy is confirmed. Inviting the next guest does not assume the car has already arrived or been plugged in.

Staff-assisted moves include authorization, key handover, an assigned staff member and destination parking. Confirming a completed staff move also confirms the bay release.

### Late-move penalties

Penalties start after **Agreed Move-By**, while the vehicle is still physically occupying the bay. Charging completion alone does not trigger a charge, and an unused bay reservation does not incur an occupancy penalty.

The default policy is **NZ$0.50 per minute, with no grace period**:

```text
Late minutes = max(0, actual move time − agreed move-by time)
Penalty = max(0, late minutes − grace minutes) × rate per minute
```

For a car still occupying the bay, current simulation time replaces actual move time. A 19:15 move-by followed by a verified 19:27 departure gives 12 late minutes and NZ$6.00.

Front Desk shows completion time, agreed move-by, overdue minutes and the current amount for each occupied bay. The management summary lists penalties by guest and booking, with a total and controls for the rate and grace period.

A reported move remains provisional until reception verifies it. The final calculation uses the verified actual move time, then freezes the amount in History. Later policy changes update live calculations but do not alter archived amounts. These are simulated fees; no payment is collected.

### Archiving

After vacancy confirmation, the booking leaves current vehicle and task lists and moves to **History**. The next active booking is selected automatically, or an empty state appears. A cancelled booking that never occupied a bay can be archived immediately.

History preserves the guest and booking identity, vehicle type, target and delivered energy, battery percentages, charging start and finish, stop time, move report, verified move and release times, final penalty, accepted early-departure shortfall and staff assistance details. Archiving retains the record within the running simulation rather than deleting it.

## Policy comparison

The comparison uses the same charging engine as the interactive demo and combines two power rules with two bay-management approaches:

| Policy | Power allocation | Move management |
| --- | --- | --- |
| A | Capped equal sharing | Baseline behaviour |
| B | Capped equal sharing | Simulated reminders and staff assistance |
| C | Deadline-based adaptive sharing | Baseline behaviour |
| D | Deadline-based adaptive sharing | Simulated reminders and staff assistance |

Choose the data source:

- **Preset scenario:** one of the supplied examples.
- **Current vehicles:** remaining demand from the current simulation time, preserving energy already delivered.
- **Complete scenario (current + History):** a replay from arrival using current and archived bookings, their final guest inputs and voluntary-departure choices. It does not change actual History records. An observed early move after successful completion does not become a stricter deadline in the replay.

Results include original target attainment, confirmed promises fulfilled, missing energy, queue time, occupancy after charging, staff moves and power-limit breaches. Accepted early departures have a separate count and energy gap. Delivering an accepted lower charge fulfils that reduced promise, but does not count as reaching the original target.

Guest response, move delays and staffing are adjustable simulation assumptions. Defaults are a 20-minute guest response, 15 minutes per staff move and one available staff member. No response and zero staff can also be tested. The benchmark assumes immediate plug-in after invitation; the interactive workflow requires reception confirmation.

## Code and verification

The app uses React, TypeScript and Vite.

| Location | Responsibility |
| --- | --- |
| `src/components/guest/` | Registration, booking review and guest actions |
| `src/components/frontdesk/` | Bays, queues, staff tasks, penalties and History |
| `src/components/simulation/` | Comparison controls and results |
| `src/context/SimulationContext.tsx` | Shared state and workflow actions |
| `src/utils/allocation.ts` | Charging allocation, feasibility and shared simulation engine |
| `src/utils/booking.ts` | Completion ranges and move-time validation |
| `src/utils/penalties.ts` | Occupancy-based penalties and final amounts |
| `src/utils/archive.ts` | Complete-scenario replay inputs |
| `src/utils/guestIdentity.ts` | Guest and booking display labels |
| `src/utils/time.ts` | Auckland time conversion and formatting |
| `src/data/vehicleTypes.ts` | Simulated vehicle parameters |
| `src/data/presets.ts` | Example scenarios and policies |
| `tests/charging.test.tsx` | Calculation, component and workflow tests |

The engine uses a one-minute grid with exact arrival, completion and deadline events. Playback speed changes how quickly the demo advances, not how much energy a vehicle receives.

Times are entered and displayed in **Pacific/Auckland**; elapsed durations use UTC timestamps. Tests cover overnight changes and daylight saving. Nonexistent spring-forward inputs are rejected, and a repeated autumn hour uses its earlier occurrence.

Regression tests cover:

- Exact energy and timing: 7 kW delivers 7 kWh in 60 minutes.
- Independent caps and redistribution: an 11 kW car and a 3.6 kW car sharing 14 kW receive 10.4 and 3.6 kW.
- Deadline slack, future bookings, necessary pauses and redistribution after completion.
- Booking consent, early departures, arrival battery changes and extension ceilings.
- Duplicate guest names, independent bookings, archiving and complete-scenario statistics.
- Completed cars retaining bays, blocked bookings, verified vacancy and penalty timing.
- Consistent energy and completion results across playback speeds.

These tests validate the simplified simulation. A hotel trial would still need actual charging and occupancy data.

## Prototype scope and next steps

There are no connected chargers, sensors, vehicle recognition, SMS, payments or persistent accounts. Notifications and staff tasks stay inside the app. Infrared occupancy sensing is not presented as a way to read a vehicle’s model, battery capacity or charging power.

A practical next step is to work with one hotel: understand guest demand and staffing, verify site and charger limits, and compare the simulation with anonymized charging and parking records. Scheduling recommendations could then be trialled before adding charger control.

Future vehicle parameters could come from identifying a model and looking up its specifications, or from supported data supplied by compatible vehicles and charging equipment.
