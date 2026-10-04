# VoltLodge

Hotel EV charging, with shared power and coordinated parking.

VoltLodge is a Climate Hackathon prototype for small hotels and motels. Guests can plan a charge around their stay, while reception manages limited power, charging bays and vehicle moves.

The project looks at two related problems: several cars may need more power than a hotel can supply at once, and a car that has finished charging may still block the next guest from using the bay. VoltLodge brings those decisions into one workflow. Finishing a charge and freeing a bay are separate events.

Our climate focus is **Electrification**. More dependable charging at accommodation could make electric travel easier. The prototype measures charging service and use of existing infrastructure; it does not measure EV adoption or carbon savings.

## Run locally

Use Node.js 22.12 or newer and npm. From the project folder:

```sh
npm install
npm run dev
```

Open the address printed by Vite, normally **http://localhost:3000**. Keep the terminal running while using the app; press **Ctrl+C** to stop it.

The current simulation does not require API keys or an `.env` file. The entries in `.env.example` come from the original app template and are not used by the charging workflow.

```sh
npm test          # Calculation and workflow tests
npm run lint      # TypeScript checks
npm run build     # Production bundle in dist/
npm run preview   # Serve the production bundle locally
```

For a shared demo, deploy the production build to a web host. A localhost link only works on the machine running the app.

## The three views

| View         | What it is for                                                                             |
| ------------ | ------------------------------------------------------------------------------------------ |
| Guest Portal | Register or book ahead, choose a battery target, review the estimates and arrange a move.  |
| Front Desk   | Manage occupied and reserved bays, the queue, staff assistance and confirmed bay releases. |
| Comparison   | Compare power allocation and move management with the same simulated inputs.               |

All three views are available for the demonstration. There are no separate guest and staff accounts or production access controls.

## Booking and charging

A guest starts with **Book ahead** or **Register now**. Advance bookings need an expected arrival date and time; registration uses the current simulation time. The guest enters their name, room number if available, current battery percentage and target percentage, then selects a vehicle type.

The app shows the earliest and latest estimated completion times, plus an expected finish under the current arrangement. It considers future bookings as well as vehicles already at the hotel. Waiting for a bay and charging after arrival are shown separately.

Only after seeing the estimates does the guest choose **Move your car by**, or request staff assistance. There is no separate use-by field.

An early move is allowed. If the target cannot be met by that time, the app calculates the expected battery percentage and asks the guest to accept the shortfall before confirming. The original target stays recorded separately from the reduced charging promise.

For an advance booking, the entered battery percentage means the expected level **on arrival**. The guest confirms the actual level when they arrive. A difference triggers a fresh calculation and a review of the arrangement; it does not silently push the deadline back. Reception must also confirm that the car is parked and plugged in before power starts.

Guests can change their target or vehicle type, stop charging, report a move, or request a later time. Changes are checked against the other confirmed bookings.

### Names, types and booking IDs

These are separate fields:

- `guestName` is the name entered by the guest.
- `vehicleType` selects the simulated battery capacity and AC power limit.
- `requestId` is a unique, system-generated booking ID.

Lists show the guest name first, for example **Henry · Type A**. Same-name guests are distinguished by room number, or by a short booking ID if their rooms also match or are missing. An unnamed booking displays **Guest + short booking ID**. Multiple guests can choose Type A without becoming the same booking. Internal vehicle labels are not used as guest display names.

### Simulated vehicle types

The guest selects one of four types; battery capacity and maximum power are supplied automatically from [src/data/vehicleTypes.ts](src/data/vehicleTypes.ts).

| Type   | Usable battery capacity | Maximum AC acceptance power |
| ------ | ----------------------- | --------------------------- |
| Type A | 60 kWh                  | 11 kW                       |
| Type B | 60 kWh                  | 11 kW                       |
| Type C | 64 kWh                  | 9 kW                        |
| Type D | 75 kWh                  | 12 kW                       |

These are demo values, not verified specifications for commercial models. Some engineering scenarios use custom parameters to test particular limits, such as a 3.6 kW vehicle.

Vehicle, charger and hotel power limits are stored separately. A vehicle that accepts 11 kW is still limited to 7 kW on a 7 kW charger. Its maximum acceptance power is not its current charging rate.

## Predictions and shared power

The energy calculation is:

```text
Required energy = usable capacity × (target % − arrival %) / 100
Remaining energy = required energy − energy already delivered
```

For example, a 60 kWh battery going from 40% to 80% needs 24 kWh. This first version ignores charging losses and changes in acceptance power as the battery fills.

The earliest estimate uses the smallest of the vehicle AC limit, charger limit and hotel charging budget, assuming no power competition. The full-load estimate uses capped equal sharing with every bay continuously demanding power. It uses known competing vehicle limits where available, and the charger limit for an unknown vehicle. Unused power from a capped vehicle is redistributed. Existing reservations can extend the estimated window.

With four 7 kW chargers sharing 14 kW, a car needing 7 kWh takes one hour without competition or two hours at a 3.5 kW full-load share. Starting at 18:00 gives a 19:00–20:00 window.

The estimates assume drivers arrive, plug in and vacate bays as arranged. They are not a universal worst case for indefinite parking, queue jumping, delayed plug-in or outages. If an occupied bay is already overdue, its release time is unknown. Zero available power produces an unavailable estimate.

The adaptive allocation first tries capped equal sharing. An interval scheduling check then tests whether that allocation can still meet every confirmed energy requirement and deadline, including future arrivals. If necessary, it adjusts power to preserve those commitments. Each car remains within both its vehicle and charger limits, and the total stays within the hotel budget.

New requests and changes are checked before confirmation. If a request cannot reach its original target, it may need a different arrangement or an explicitly accepted lower charge; another guest's promise cannot be silently relaxed to accommodate it. In deliberately infeasible comparison scenarios, the engine makes a best effort and reports the deficit.

### Deadlines and extensions

The app keeps three times separately:

| Time                       | Meaning                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| Original latest completion | The latest completion accepted with the original plan. This stays fixed.                    |
| Current charging deadline  | The charging commitment, changed only when the guest explicitly agrees to delayed charging. |
| Agreed move time           | When the guest has arranged to vacate the bay.                                              |

Choosing a later move time alone does not authorize slower charging. A guest who explicitly agrees to a later charging deadline may receive less power, but the revised promise must still be feasible.

The move-time ceiling is the **original latest completion + 60 minutes** by default. The allowance is configurable and applies both at first confirmation and on later extensions. Repeated requests do not add another hour each time. An early move can impose an earlier charging cutoff without changing the saved original deadline.

## Bay management and History

Reaching the target stops power, but the car remains in the current list as completed and waiting for a move. Cancelling charging also leaves an occupied bay in place. A guest's report that the car has moved waits for reception confirmation.

Once reception confirms the bay is clear, the booking leaves the current vehicle and task lists and is archived to **History**. The next remaining booking is selected automatically; an empty list shows an empty state. The freed bay can be reserved for the next driver, who must park and plug in before charging starts. A cancelled booking that has not occupied a bay can be archived immediately, including an unused reservation.

Staff assistance includes checks for authorization, key handover, an assigned staff member and destination parking. Confirming a completed staff move also confirms the bay release. Any idle fee shown is a simulation calculation; no payment is collected.

History retains the vehicle type, booking ID, target and delivered energy, battery percentages, charging start and finish, stop time, move report and confirmed release, accepted early-departure shortfall, and staff assistance details. It also keeps a full snapshot of the booking and its deadlines.

**Current bookings and History are held in memory. Refreshing the page or resetting the simulation clears them.** Archiving removes a booking from active operation, rather than deleting its record from the running simulation.

## Policy comparison

The comparison combines two power rules with two approaches to moving vehicles:

| Policy | Power allocation     | Move management                          |
| ------ | -------------------- | ---------------------------------------- |
| A      | Capped equal sharing | Baseline behaviour                       |
| B      | Capped equal sharing | Simulated reminders and staff assistance |
| C      | Adaptive allocation  | Baseline behaviour                       |
| D      | Adaptive allocation  | Simulated reminders and staff assistance |

Choose the input source explicitly:

- **Preset scenario** runs one of the supplied examples.
- **Current vehicles** projects the remaining demand from the current simulation time, retaining energy already delivered.
- **Complete scenario (current + History)** replays current and archived bookings from arrival, using their final guest inputs and voluntary-departure choices. It does not overwrite actual History records. A completed car's observed early move does not become a stricter guest charging deadline in the replay.

Results include target attainment, confirmed promises met, missing energy, queue time, post-charge bay occupancy, staff moves and power-limit breaches. Accepted early departures have their own count and energy gap. Missing the original target after an accepted early departure is not counted as target success; fulfilling that reduced promise is also not counted as a scheduling failure.

Guest response, move delays and available staff are adjustable simulation assumptions. The defaults are 20 minutes for a guest response and 15 minutes per staff move, with one available staff member. No response and zero staff can also be tested. The benchmark assumes immediate plug-in after invitation; the interactive guest workflow requires reception confirmation. These assumptions are not evidence that real reminders change behaviour.

## Code and verification

The app uses React, TypeScript and Vite. The interactive demo and policy comparison share the charging engine in [src/utils/allocation.ts](src/utils/allocation.ts). It uses a one-minute time grid with exact arrival, completion and deadline events, so playback speed changes how fast the demo runs, rather than how much energy it delivers.

| Location                            | Responsibility                                 |
| ----------------------------------- | ---------------------------------------------- |
| `src/components/guest/`             | Registration, booking review and guest actions |
| `src/components/frontdesk/`         | Bays, queues, staff tasks and History          |
| `src/components/simulation/`        | Comparison controls and results                |
| `src/context/SimulationContext.tsx` | Shared state and workflow actions              |
| `src/utils/booking.ts`              | Completion ranges and move-time feasibility    |
| `src/utils/archive.ts`              | Complete-scenario replay inputs                |
| `src/utils/guestIdentity.ts`        | Guest names and booking display labels         |
| `src/utils/time.ts`                 | Auckland time conversion and formatting        |
| `src/data/vehicleTypes.ts`          | The four guest vehicle types                   |
| `src/data/presets.ts`               | Example scenarios and policies                 |
| `tests/charging.test.tsx`           | Calculation, component and workflow tests      |

Times are entered and displayed in **Pacific/Auckland**. Durations use UTC timestamps. The tests cover overnight changes and daylight saving; nonexistent spring-forward inputs are rejected, and a repeated autumn hour uses its earlier occurrence.

The automated tests also cover exact charging boundaries, capped power redistribution, future bookings, protected deadlines, early-departure consent, extension ceilings, type changes, duplicate guest names, bay release, archiving and complete-scenario statistics. For example, 7 kW delivers 7 kWh in 60 minutes, and an 11 kW car sharing 14 kW with a 3.6 kW car receives the remaining 10.4 kW. Completion and deadline handling are checked across different playback speeds.

These are tests of the simplified simulation. A hotel trial would still need actual charging and occupancy data.

## Beyond the prototype

There are no live chargers, sensors, vehicle recognition, SMS, payments or persistent accounts connected. Notifications and staff tasks stay inside the app. Infrared occupancy sensing is not presented as a way to read a vehicle's model, battery capacity or charging power.

A useful next step would be to work with one hotel: understand its guest demand and staffing, verify the site and charger limits, and compare the simulation with anonymized charging and parking records. Scheduling recommendations could then be trialled before adding charger control.

Future vehicle parameters could come from identifying a model and looking up its specifications, or from supported data supplied by compatible vehicles and charging equipment. VoltLodge's focus is the hotel workflow around shared power, guest commitments and bay turnover; whether that combination works in practice remains a question for a trial.
