import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Bay,
  ChargingSession,
  SystemEvent,
  HistoryRecord,
  AllocationAlgorithm,
  VehicleRequestInput,
  ValetTask,
  ExtensionRequest,
} from '../types';
import {
  ALL_PRESETS,
  PRESET_1_POWER_CRUNCH,
  SimulationPreset,
} from '../data/presets';
import {
  calculatePowerAllocation,
  estimateChargingFeasibility,
} from '../utils/allocation';
import {
  addMinutesToIso,
  getMinutesDiff,
  createIsoWithTime,
} from '../utils/time';

interface SimulationContextType {
  // Clock & Playback
  currentTimeIso: string;
  isPlaying: boolean;
  playbackSpeed: number; // multiplier
  togglePlay: () => void;
  setSpeed: (speed: number) => void;
  stepMinutes: (mins: number) => void;
  resetSimulation: () => void;
  loadPreset: (presetId: string) => void;
  activePresetId: string;
  allPresets: SimulationPreset[];

  // Site Configuration
  sitePowerBudgetKw: number;
  setSitePowerBudgetKw: (kw: number) => void;
  activeAlgorithm: AllocationAlgorithm;
  setActiveAlgorithm: (algo: AllocationAlgorithm) => void;
  chargerMaxKw: number;
  totalAllocatedPowerKw: number;
  availableStandardStalls: number;
  staffOnDuty: string[];
  idleGracePeriodMins: number;
  idleFeePerMin: number;

  // State Entities
  bays: Bay[];
  sessions: ChargingSession[];
  activeSession: ChargingSession | null;
  activeRequestId: string | null;
  setActiveRequestId: (id: string | null) => void;
  systemEvents: SystemEvent[];
  historyRecords: HistoryRecord[];

  // Role Switcher
  userRole: 'guest' | 'frontdesk' | 'simulation';
  setUserRole: (role: 'guest' | 'frontdesk' | 'simulation') => void;

  // Guest Actions (EV01, EV02, EV07, EV11, EV12)
  submitRequest: (input: VehicleRequestInput) => { success: boolean; requestId?: string; error?: string };
  confirmPlan: (requestId: string, agreedMoveTime: string, acceptedDeficit?: boolean) => void;
  requestValetAssistance: (requestId: string, note: string) => void;
  requestExtension: (requestId: string, newTime: string, reason: string) => void;
  modifyRequest: (requestId: string, newTargetKwh: number, newUseByTime: string) => { success: boolean; error?: string };
  cancelRequest: (requestId: string) => void;

  // Front Desk Actions (EV05, EV08, EV09, EV12, EV14)
  confirmVehicleParkedAndPlugged: (bayId: string, vehicleId: string) => void;
  reviewValetTask: (
    taskId: string,
    approved: boolean,
    params?: {
      staffAssigned?: string;
      destinationBay?: string;
      rejectionReason?: string;
      keysReceived?: boolean;
      authorizationConfirmed?: boolean;
    }
  ) => void;
  completeValetTask: (taskId: string) => void;
  confirmBayReleased: (bayId: string, notes?: string) => void;
  reviewExtensionRequest: (requestId: string, approved: boolean) => void;
  dismissEvent: (eventId: string) => void;
  clearAllEvents: () => void;
}

const SimulationContext = createContext<SimulationContextType | null>(null);

export const SimulationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activePresetId, setActivePresetId] = useState<string>(PRESET_1_POWER_CRUNCH.id);
  const currentPreset = ALL_PRESETS.find((p) => p.id === activePresetId) || PRESET_1_POWER_CRUNCH;

  // Clock
  const [currentTimeIso, setCurrentTimeIso] = useState<string>(currentPreset.simulationStartIso);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(5); // default 5x speed for smooth demo

  // Site Configuration
  const [sitePowerBudgetKw, setSitePowerBudgetKw] = useState<number>(currentPreset.sitePowerBudgetKw);
  const [activeAlgorithm, setActiveAlgorithm] = useState<AllocationAlgorithm>('demand_urgency');
  const [chargerMaxKw, setChargerMaxKw] = useState<number>(currentPreset.chargerMaxKw);
  const [availableStandardStalls, setAvailableStandardStalls] = useState<number>(12);
  const [staffOnDuty] = useState<string[]>([
    'Alex Turner (Front Desk)',
    'Jordan Miller (Duty Manager)',
    'Sam Vance (Night Attendant)',
  ]);
  const [idleGracePeriodMins, setIdleGracePeriodMins] = useState<number>(15);
  const [idleFeePerMin, setIdleFeePerMin] = useState<number>(0.5); // $0.50 / min

  // Active Role and Vehicle
  const [userRole, setUserRole] = useState<'guest' | 'frontdesk' | 'simulation'>('guest');
  const [activeRequestId, setActiveRequestId] = useState<string | null>(
    currentPreset.sessions[0]?.requestId || null
  );

  // Entities
  const [bays, setBays] = useState<Bay[]>(() =>
    Array.from({ length: currentPreset.bayCount }, (_, i) => ({
      bayId: `bay-${i + 1}`,
      bayNumber: i + 1,
      name: `Bay ${i + 1}`,
      maxKw: currentPreset.chargerMaxKw,
      currentStatus: 'vacant',
      currentVehicleId: null,
      currentRequestId: null,
      allocatedKw: 0,
    }))
  );

  const [sessions, setSessions] = useState<ChargingSession[]>(() =>
    JSON.parse(JSON.stringify(currentPreset.sessions))
  );

  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([
    {
      id: 'evt-init',
      timestamp: currentPreset.simulationStartIso,
      type: 'info',
      category: 'power',
      message: `System initialized with ${currentPreset.bayCount} bay(s), ${currentPreset.sitePowerBudgetKw} kW site budget.`,
    },
  ]);

  const [historyRecords, setHistoryRecords] = useState<HistoryRecord[]>([]);

  // Add event helper
  const addEvent = useCallback((event: Omit<SystemEvent, 'id'>) => {
    const newEvt: SystemEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    };
    setSystemEvents((prev) => [newEvt, ...prev].slice(0, 80));
  }, []);

  // Reset simulation to current preset
  const resetSimulation = useCallback(() => {
    setIsPlaying(false);
    setCurrentTimeIso(currentPreset.simulationStartIso);
    setSitePowerBudgetKw(currentPreset.sitePowerBudgetKw);
    setChargerMaxKw(currentPreset.chargerMaxKw);

    const freshSessions: ChargingSession[] = JSON.parse(JSON.stringify(currentPreset.sessions));
    setSessions(freshSessions);

    const freshBays: Bay[] = Array.from({ length: currentPreset.bayCount }, (_, i) => {
      const existingOcc = freshSessions.find((s) => s.bayId === `bay-${i + 1}`);
      return {
        bayId: `bay-${i + 1}`,
        bayNumber: i + 1,
        name: `Bay ${i + 1}`,
        maxKw: currentPreset.chargerMaxKw,
        currentStatus: existingOcc ? (existingOcc.status === 'target_reached' ? 'occupied_idle' : 'occupied_charging') : 'vacant',
        currentVehicleId: existingOcc ? existingOcc.vehicleId : null,
        currentRequestId: existingOcc ? existingOcc.requestId : null,
        allocatedKw: existingOcc ? existingOcc.allocatedKw : 0,
      };
    });
    setBays(freshBays);

    setActiveRequestId(freshSessions[0]?.requestId || null);

    setSystemEvents([
      {
        id: `evt-${Date.now()}`,
        timestamp: currentPreset.simulationStartIso,
        type: 'info',
        category: 'power',
        message: `Reset simulation to "${currentPreset.name}".`,
      },
    ]);
  }, [currentPreset]);

  // Load a new preset
  const loadPreset = useCallback((presetId: string) => {
    const preset = ALL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setIsPlaying(false);
    setActivePresetId(presetId);
    setCurrentTimeIso(preset.simulationStartIso);
    setSitePowerBudgetKw(preset.sitePowerBudgetKw);
    setChargerMaxKw(preset.chargerMaxKw);

    const freshSessions: ChargingSession[] = JSON.parse(JSON.stringify(preset.sessions));
    setSessions(freshSessions);

    const freshBays: Bay[] = Array.from({ length: preset.bayCount }, (_, i) => {
      const existingOcc = freshSessions.find((s) => s.bayId === `bay-${i + 1}`);
      return {
        bayId: `bay-${i + 1}`,
        bayNumber: i + 1,
        name: `Bay ${i + 1}`,
        maxKw: preset.chargerMaxKw,
        currentStatus: existingOcc ? (existingOcc.status === 'target_reached' ? 'occupied_idle' : 'occupied_charging') : 'vacant',
        currentVehicleId: existingOcc ? existingOcc.vehicleId : null,
        currentRequestId: existingOcc ? existingOcc.requestId : null,
        allocatedKw: existingOcc ? existingOcc.allocatedKw : 0,
      };
    });
    setBays(freshBays);
    setActiveRequestId(freshSessions[0]?.requestId || null);

    setSystemEvents([
      {
        id: `evt-${Date.now()}`,
        timestamp: preset.simulationStartIso,
        type: 'info',
        category: 'power',
        message: `Loaded preset "${preset.name}".`,
      },
    ]);
  }, []);

  // Synchronize bays with initial sessions on mount / preset load
  useEffect(() => {
    // Ensure bays match sessions
    setBays((prevBays) =>
      prevBays.map((bay) => {
        const occSession = sessions.find((s) => s.bayId === bay.bayId);
        if (occSession) {
          const status = occSession.status === 'target_reached' ? 'occupied_idle' : 'occupied_charging';
          return {
            ...bay,
            currentStatus: status,
            currentVehicleId: occSession.vehicleId,
            currentRequestId: occSession.requestId,
            allocatedKw: occSession.allocatedKw,
          };
        }
        return bay;
      })
    );
  }, [activePresetId]);

  // Total allocated power
  const totalAllocatedPowerKw = sessions.reduce((acc, s) => acc + (s.allocatedKw || 0), 0);

  // Active Session object
  const activeSession = sessions.find((s) => s.requestId === activeRequestId) || null;

  // Core Simulation Step function (advances clock and runs physics & policy)
  const advanceTimeByMinutes = useCallback((deltaMinutes: number) => {
    setCurrentTimeIso((prevIso) => {
      const nextIso = addMinutesToIso(prevIso, deltaMinutes);

      setSessions((prevSessions) => {
        const nextSessions: ChargingSession[] = JSON.parse(JSON.stringify(prevSessions));

        // 1. Check if any vehicles should plug into reserved bays
        // 2. Power recalculation
        const powerMap = calculatePowerAllocation(
          nextSessions,
          bays,
          sitePowerBudgetKw,
          activeAlgorithm,
          nextIso
        );

        // Update each session
        nextSessions.forEach((s) => {
          if (s.bayId && (s.status === 'charging' || s.status === 'paused')) {
            const kw = powerMap.get(s.requestId) || 0;
            s.allocatedKw = kw;
            s.status = kw > 0 ? 'charging' : 'paused';

            // Deliver energy: kWh = kW * (deltaMinutes / 60)
            const deliveredDelta = kw * (deltaMinutes / 60);
            s.deliveredKwh = Math.min(s.targetKwh, s.deliveredKwh + deliveredDelta);

            // 15-minute warning alert (EV06)
            if (!s.notificationsSent.fifteenMinWarning && kw > 0) {
              const remainingKwh = s.targetKwh - s.deliveredKwh;
              const remainingHours = remainingKwh / kw;
              const remainingMins = Math.round(remainingHours * 60);

              if (remainingMins <= 15 && remainingMins > 0) {
                s.notificationsSent.fifteenMinWarning = true;
                addEvent({
                  timestamp: nextIso,
                  requestId: s.requestId,
                  vehicleId: s.vehicleId,
                  type: 'warning',
                  category: 'charging',
                  message: `15-Min Alert: ${s.vehicleId} estimated to complete target in ~${remainingMins} mins. Please prepare to move by ${s.agreedMoveByTime.slice(11, 16)} or request front desk valet assist.`,
                });
              }
            }

            // Target Reached Alert (EV06, EV04)
            if (s.deliveredKwh >= s.targetKwh - 0.01) {
              s.status = 'target_reached';
              s.allocatedKw = 0;
              s.targetReachedAt = nextIso;
              s.notificationsSent.targetReached = true;

              addEvent({
                timestamp: nextIso,
                requestId: s.requestId,
                vehicleId: s.vehicleId,
                type: 'success',
                category: 'charging',
                message: `Target Reached: ${s.vehicleId} reached ${s.targetKwh} kWh. Charger power released. Please vacate bay by agreed time ${s.agreedMoveByTime.slice(11, 16)}.`,
              });

              // Update corresponding bay status to occupied_idle
              setBays((baysList) =>
                baysList.map((b) =>
                  b.bayId === s.bayId
                    ? { ...b, currentStatus: 'occupied_idle', allocatedKw: 0 }
                    : b
                )
              );
            }
          }

          // Overdue Warning (EV06, EV14)
          if (
            s.status === 'target_reached' &&
            s.bayId &&
            !s.notificationsSent.overdueWarning
          ) {
            const isOverdue = nextIso > s.agreedMoveByTime;
            if (isOverdue) {
              s.notificationsSent.overdueWarning = true;
              addEvent({
                timestamp: nextIso,
                requestId: s.requestId,
                vehicleId: s.vehicleId,
                type: 'alert',
                category: 'bay',
                message: `Overdue Bay Occupancy: ${s.vehicleId} has exceeded agreed move deadline (${s.agreedMoveByTime.slice(11, 16)}). Front desk notified for turnover coordination.`,
              });
            }
          }
        });

        return nextSessions;
      });

      return nextIso;
    });
  }, [bays, sitePowerBudgetKw, activeAlgorithm, addEvent]);

  // Step minutes wrapper
  const stepMinutes = useCallback((mins: number) => {
    advanceTimeByMinutes(mins);
  }, [advanceTimeByMinutes]);

  // Play / Pause timer effect
  useEffect(() => {
    if (!isPlaying) return;

    // Tick every 1 second real-time = playbackSpeed minutes simulation time
    const interval = setInterval(() => {
      advanceTimeByMinutes(playbackSpeed);
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, advanceTimeByMinutes]);

  const togglePlay = () => setIsPlaying((p) => !p);
  const setSpeed = (s: number) => setPlaybackSpeed(s);

  // EV01: Guest submits charging request
  const submitRequest = useCallback(
    (input: VehicleRequestInput): { success: boolean; requestId?: string; error?: string } => {
      if (!input.vehicleId.trim()) {
        return { success: false, error: 'Vehicle ID / Plate is required.' };
      }

      let targetKwh = 0;
      let targetPercent = 100;
      let batteryCapacity = input.batteryCapacityKwh || 60;
      let initialSoc = input.currentPercent || 30;

      if (input.inputMode === 'kwh') {
        if (!input.targetKwh || input.targetKwh <= 0) {
          return { success: false, error: 'Target energy must be greater than 0 kWh.' };
        }
        targetKwh = input.targetKwh;
        targetPercent = Math.min(100, Math.round(initialSoc + (targetKwh / batteryCapacity) * 100));
      } else {
        if (input.currentPercent === undefined || input.targetPercent === undefined) {
          return { success: false, error: 'Current battery % and Target % are required.' };
        }
        if (input.currentPercent >= input.targetPercent) {
          return { success: false, error: 'Target percentage must be higher than current battery level.' };
        }
        if (input.targetPercent > 100) {
          return { success: false, error: 'Target percentage cannot exceed 100%.' };
        }
        targetPercent = input.targetPercent;
        initialSoc = input.currentPercent;
        targetKwh = Math.round(((targetPercent - initialSoc) / 100) * batteryCapacity * 10) / 10;
      }

      if (!input.useByTime) {
        return { success: false, error: 'Departure / Use-by time is required.' };
      }
      if (new Date(input.useByTime).getTime() <= new Date(currentTimeIso).getTime()) {
        return { success: false, error: 'Departure time must be in the future.' };
      }

      const requestId = `req-${Date.now()}`;
      const vacantBay = bays.find((b) => b.currentStatus === 'vacant');

      // Check feasibility (EV02)
      const feasibility = estimateChargingFeasibility(
        targetKwh,
        input.useByTime,
        input.requestedMoveTime || input.useByTime,
        currentTimeIso,
        chargerMaxKw,
        !!vacantBay,
        vacantBay ? 0 : 45
      );

      const newSession: ChargingSession = {
        requestId,
        vehicleId: input.vehicleId.toUpperCase().trim(),
        guestName: input.guestName.trim() || 'Hotel Guest',
        roomNumber: input.roomNumber.trim() || '101',
        batteryCapacityKwh: batteryCapacity,
        initialSocPercent: initialSoc,
        targetKwh,
        targetPercent,
        arrivalTime: currentTimeIso,
        useByTime: input.useByTime,
        agreedMoveByTime: input.requestedMoveTime || feasibility.plannedLatestFinishTime,
        moveMethod: input.moveMethod || 'self',

        estimatedStartTime: feasibility.estimatedStartTime,
        estimatedFinishTime: feasibility.estimatedFinishTime,
        plannedLatestFinishTime: feasibility.plannedLatestFinishTime,
        isFeasibleOnTime: feasibility.isFeasibleOnTime,
        projectedDeficitKwh: feasibility.projectedDeficitKwh,
        guestAcceptedDeficit: false,

        status: 'pending_confirmation', // Enters EV02 review
        bayId: null,
        deliveredKwh: 0,
        allocatedKw: 0,
        maxChargeKw: chargerMaxKw,
        pluggedInAt: null,
        targetReachedAt: null,
        bayReleasedAt: null,
        notificationsSent: { fifteenMinWarning: false, targetReached: false, overdueWarning: false },
      };

      setSessions((prev) => [newSession, ...prev]);
      setActiveRequestId(requestId);

      addEvent({
        timestamp: currentTimeIso,
        requestId,
        vehicleId: newSession.vehicleId,
        type: 'info',
        category: 'queue',
        message: `Charging plan generated for ${newSession.vehicleId}. Awaiting guest plan confirmation.`,
      });

      return { success: true, requestId };
    },
    [currentTimeIso, bays, chargerMaxKw, addEvent]
  );

  // EV02: Guest reviews and confirms plan
  const confirmPlan = useCallback(
    (requestId: string, agreedMoveTime: string, acceptedDeficit = false) => {
      setSessions((prev) => {
        return prev.map((s) => {
          if (s.requestId !== requestId) return s;

          // Check if bay is vacant right now
          const vacantBay = bays.find((b) => b.currentStatus === 'vacant');

          let nextStatus = vacantBay ? 'charging' : 'waiting_bay';
          let assignedBayId = vacantBay ? vacantBay.bayId : null;

          if (vacantBay) {
            // Immediately reserve bay
            setBays((bList) =>
              bList.map((b) =>
                b.bayId === vacantBay.bayId
                  ? {
                      ...b,
                      currentStatus: 'occupied_charging',
                      currentVehicleId: s.vehicleId,
                      currentRequestId: s.requestId,
                    }
                  : b
              )
            );
          }

          const updated: ChargingSession = {
            ...s,
            status: nextStatus as any,
            bayId: assignedBayId,
            agreedMoveByTime: agreedMoveTime,
            guestAcceptedDeficit: acceptedDeficit,
            pluggedInAt: vacantBay ? currentTimeIso : null,
          };

          addEvent({
            timestamp: currentTimeIso,
            requestId: s.requestId,
            vehicleId: s.vehicleId,
            type: 'success',
            category: 'charging',
            message: vacantBay
              ? `Plan confirmed for ${s.vehicleId}. Assigned to ${vacantBay.name}, charging initiated.`
              : `Plan confirmed for ${s.vehicleId}. All bays currently occupied; queued in arrival order.`,
          });

          return updated;
        });
      });
    },
    [bays, currentTimeIso, addEvent]
  );

  // EV07: Guest requests staff valet assistance
  const requestValetAssistance = useCallback(
    (requestId: string, note: string) => {
      setSessions((prev) => {
        return prev.map((s) => {
          if (s.requestId !== requestId) return s;
          if (s.valetTask && (s.valetTask.status === 'pending_review' || s.valetTask.status === 'accepted')) {
            return s; // Prevent duplicate pending application
          }

          const task: ValetTask = {
            taskId: `valet-${Date.now()}`,
            requestId: s.requestId,
            vehicleId: s.vehicleId,
            bayId: s.bayId || 'bay-1',
            requestedAt: currentTimeIso,
            status: 'pending_review',
            authorizationConfirmed: true,
            keysHandoverNote: note || 'Keys handed over at front desk key drop.',
            keysReceived: true,
            staffAssigned: null,
            destinationBay: null,
          };

          addEvent({
            timestamp: currentTimeIso,
            requestId: s.requestId,
            vehicleId: s.vehicleId,
            type: 'info',
            category: 'valet',
            message: `Valet assistance requested by ${s.vehicleId}. Keys note: "${task.keysHandoverNote}". Pending front desk verification.`,
          });

          return {
            ...s,
            moveMethod: 'valet',
            valetTask: task,
          };
        });
      });
    },
    [currentTimeIso, addEvent]
  );

  // EV08: Front desk reviews and accepts or rejects valet task
  const reviewValetTask = useCallback(
    (
      taskId: string,
      approved: boolean,
      params?: {
        staffAssigned?: string;
        destinationBay?: string;
        rejectionReason?: string;
        keysReceived?: boolean;
        authorizationConfirmed?: boolean;
      }
    ) => {
      setSessions((prev) => {
        return prev.map((s) => {
          if (!s.valetTask || s.valetTask.taskId !== taskId) return s;

          if (approved) {
            const staff = params?.staffAssigned || staffOnDuty[0];
            const stall = params?.destinationBay || `Standard Stall #${Math.floor(Math.random() * 20) + 1}`;

            const updatedTask: ValetTask = {
              ...s.valetTask,
              status: 'accepted',
              staffAssigned: staff,
              destinationBay: stall,
              keysReceived: params?.keysReceived ?? true,
              authorizationConfirmed: params?.authorizationConfirmed ?? true,
            };

            addEvent({
              timestamp: currentTimeIso,
              requestId: s.requestId,
              vehicleId: s.vehicleId,
              type: 'info',
              category: 'valet',
              message: `Valet task accepted for ${s.vehicleId}. Assigned staff: ${staff}. Destination: ${stall}.`,
            });

            return {
              ...s,
              valetTask: updatedTask,
            };
          } else {
            const reason = params?.rejectionReason || 'Staff currently unavailable for valet duty. Please move vehicle directly.';
            const updatedTask: ValetTask = {
              ...s.valetTask,
              status: 'rejected',
              rejectionReason: reason,
            };

            addEvent({
              timestamp: currentTimeIso,
              requestId: s.requestId,
              vehicleId: s.vehicleId,
              type: 'warning',
              category: 'valet',
              message: `Valet task declined for ${s.vehicleId}: ${reason}. Guest notified to move car manually.`,
            });

            return {
              ...s,
              valetTask: updatedTask,
            };
          }
        });
      });
    },
    [currentTimeIso, staffOnDuty, addEvent]
  );

  // EV09: Confirm Bay Released (Physical check & turnover + advance queue)
  const confirmBayReleased = useCallback(
    (bayId: string, notes?: string) => {
      setBays((prevBays) => {
        const targetBay = prevBays.find((b) => b.bayId === bayId);
        if (!targetBay || targetBay.currentStatus === 'vacant') return prevBays;

        const vehicleLeavingId = targetBay.currentVehicleId;
        const requestLeavingId = targetBay.currentRequestId;

        // Archive completed session
        setSessions((prevSessions) => {
          const updatedSessions = [...prevSessions];
          const leavingSessionIndex = updatedSessions.findIndex((s) => s.requestId === requestLeavingId);

          if (leavingSessionIndex >= 0) {
            const s = updatedSessions[leavingSessionIndex];
            s.bayReleasedAt = currentTimeIso;
            s.bayId = null;

            // Archive to history
            const overstayMins = Math.max(0, getMinutesDiff(s.agreedMoveByTime, currentTimeIso));
            const idleFee = overstayMins > idleGracePeriodMins ? (overstayMins - idleGracePeriodMins) * idleFeePerMin : 0;

            const record: HistoryRecord = {
              id: `hist-${Date.now()}`,
              requestId: s.requestId,
              vehicleId: s.vehicleId,
              guestName: s.guestName,
              roomNumber: s.roomNumber,
              arrivalTime: s.arrivalTime,
              departureTime: currentTimeIso,
              targetKwh: s.targetKwh,
              actualDeliveredKwh: Math.round(s.deliveredKwh * 10) / 10,
              targetAchieved: s.deliveredKwh >= s.targetKwh - 0.1,
              onTimeCompletion: s.deliveredKwh >= s.targetKwh - 0.1 && currentTimeIso <= s.useByTime,
              scheduledMoveTime: s.agreedMoveByTime,
              actualReleaseTime: currentTimeIso,
              overstayMinutes: overstayMins,
              simulatedFeeCharged: Math.round(idleFee * 100) / 100,
              valetUsed: s.valetTask?.status === 'completed' || s.moveMethod === 'valet',
              notes: notes || 'Bay released and verified vacant by staff.',
            };

            setHistoryRecords((h) => [record, ...h]);
          }

          // Check for NEXT in queue
          const nextInQueue = updatedSessions.find((s) => s.status === 'waiting_bay');

          if (nextInQueue) {
            // Assign next car to this freed bay
            nextInQueue.status = 'charging';
            nextInQueue.bayId = bayId;
            nextInQueue.pluggedInAt = currentTimeIso;

            addEvent({
              timestamp: currentTimeIso,
              requestId: nextInQueue.requestId,
              vehicleId: nextInQueue.vehicleId,
              type: 'success',
              category: 'queue',
              message: `Bay ${targetBay.bayNumber} vacated by ${vehicleLeavingId}. Next vehicle ${nextInQueue.vehicleId} automatically admitted and plugged in!`,
            });
          } else {
            addEvent({
              timestamp: currentTimeIso,
              vehicleId: vehicleLeavingId || undefined,
              type: 'info',
              category: 'bay',
              message: `Bay ${targetBay.bayNumber} physically inspected and confirmed vacant. No vehicles in queue.`,
            });
          }

          return updatedSessions;
        });

        // Update bay state
        return prevBays.map((b) => {
          if (b.bayId !== bayId) return b;

          // Check if queue car was assigned
          const nextInQueue = sessions.find((s) => s.status === 'waiting_bay');
          if (nextInQueue) {
            return {
              ...b,
              currentStatus: 'occupied_charging',
              currentVehicleId: nextInQueue.vehicleId,
              currentRequestId: nextInQueue.requestId,
              allocatedKw: 0,
            };
          } else {
            return {
              ...b,
              currentStatus: 'vacant',
              currentVehicleId: null,
              currentRequestId: null,
              allocatedKw: 0,
            };
          }
        });
      });
    },
    [currentTimeIso, idleGracePeriodMins, idleFeePerMin, sessions, addEvent]
  );

  // EV08/EV09: Complete Valet Task (Staff parks vehicle in standard stall, then frees bay)
  const completeValetTask = useCallback(
    (taskId: string) => {
      let bayToRelease: string | null = null;
      let vehId = '';

      setSessions((prev) => {
        return prev.map((s) => {
          if (!s.valetTask || s.valetTask.taskId !== taskId) return s;

          bayToRelease = s.bayId;
          vehId = s.vehicleId;

          const updatedTask: ValetTask = {
            ...s.valetTask,
            status: 'completed',
            completedAt: currentTimeIso,
          };

          addEvent({
            timestamp: currentTimeIso,
            requestId: s.requestId,
            vehicleId: s.vehicleId,
            type: 'success',
            category: 'valet',
            message: `Valet Completed: Staff relocated ${s.vehicleId} to ${s.valetTask.destinationBay || 'Standard Stall'}. Charger bay released.`,
          });

          return {
            ...s,
            valetTask: updatedTask,
          };
        });
      });

      if (bayToRelease) {
        confirmBayReleased(bayToRelease, `Valet moved vehicle to regular parking stall.`);
      }
    },
    [currentTimeIso, confirmBayReleased, addEvent]
  );

  // EV05: Confirm vehicle parked and plugged
  const confirmVehicleParkedAndPlugged = useCallback(
    (bayId: string, vehicleId: string) => {
      setBays((prev) =>
        prev.map((b) =>
          b.bayId === bayId
            ? { ...b, currentStatus: 'occupied_charging', currentVehicleId: vehicleId }
            : b
        )
      );

      setSessions((prev) =>
        prev.map((s) =>
          s.vehicleId === vehicleId
            ? { ...s, bayId, status: 'charging', pluggedInAt: currentTimeIso }
            : s
        )
      );

      addEvent({
        timestamp: currentTimeIso,
        vehicleId,
        type: 'info',
        category: 'bay',
        message: `${vehicleId} confirmed plugged into Bay ${bayId}. Charging authorized.`,
      });
    },
    [currentTimeIso, addEvent]
  );

  // EV12: Request Extension
  const requestExtension = useCallback(
    (requestId: string, newTime: string, reason: string) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.requestId !== requestId) return s;

          const ext: ExtensionRequest = {
            requestId: s.requestId,
            vehicleId: s.vehicleId,
            currentDeadline: s.agreedMoveByTime,
            requestedDeadline: newTime,
            reason: reason || 'Guest needs extra parking time.',
            status: 'pending',
            requestedAt: currentTimeIso,
          };

          addEvent({
            timestamp: currentTimeIso,
            requestId: s.requestId,
            vehicleId: s.vehicleId,
            type: 'info',
            category: 'queue',
            message: `${s.vehicleId} requested parking extension until ${newTime.slice(11, 16)}. Reason: "${ext.reason}". Pending front desk review.`,
          });

          return { ...s, extensionRequest: ext };
        })
      );
    },
    [currentTimeIso, addEvent]
  );

  // EV12: Front Desk Review Extension
  const reviewExtensionRequest = useCallback(
    (requestId: string, approved: boolean) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.requestId !== requestId || !s.extensionRequest) return s;

          if (approved) {
            const newDeadline = s.extensionRequest.requestedDeadline;
            addEvent({
              timestamp: currentTimeIso,
              requestId: s.requestId,
              vehicleId: s.vehicleId,
              type: 'success',
              category: 'queue',
              message: `Extension approved for ${s.vehicleId}. New agreed move-by time: ${newDeadline.slice(11, 16)}.`,
            });

            return {
              ...s,
              agreedMoveByTime: newDeadline,
              extensionRequest: {
                ...s.extensionRequest,
                status: 'approved',
                reviewedAt: currentTimeIso,
              },
            };
          } else {
            addEvent({
              timestamp: currentTimeIso,
              requestId: s.requestId,
              vehicleId: s.vehicleId,
              type: 'warning',
              category: 'queue',
              message: `Extension rejected for ${s.vehicleId} due to incoming queue demand. Original deadline ${s.agreedMoveByTime.slice(11, 16)} remains in effect.`,
            });

            return {
              ...s,
              extensionRequest: {
                ...s.extensionRequest,
                status: 'rejected',
                reviewedAt: currentTimeIso,
              },
            };
          }
        })
      );
    },
    [currentTimeIso, addEvent]
  );

  // EV11: Modify Request
  const modifyRequest = useCallback(
    (requestId: string, newTargetKwh: number, newUseByTime: string): { success: boolean; error?: string } => {
      const session = sessions.find((s) => s.requestId === requestId);
      if (!session) return { success: false, error: 'Session not found' };

      if (newTargetKwh < session.deliveredKwh) {
        return {
          success: false,
          error: `New target cannot be lower than already delivered energy (${session.deliveredKwh.toFixed(1)} kWh).`,
        };
      }

      setSessions((prev) =>
        prev.map((s) => {
          if (s.requestId !== requestId) return s;
          return {
            ...s,
            targetKwh: newTargetKwh,
            useByTime: newUseByTime,
          };
        })
      );

      addEvent({
        timestamp: currentTimeIso,
        requestId,
        vehicleId: session.vehicleId,
        type: 'info',
        category: 'charging',
        message: `${session.vehicleId} modified charging request: Target ${newTargetKwh} kWh, Depart by ${newUseByTime.slice(11, 16)}.`,
      });

      return { success: true };
    },
    [sessions, currentTimeIso, addEvent]
  );

  // EV11: Cancel Request
  const cancelRequest = useCallback(
    (requestId: string) => {
      const session = sessions.find((s) => s.requestId === requestId);
      if (!session) return;

      if (session.bayId) {
        confirmBayReleased(session.bayId, 'Session cancelled by guest; vehicle cleared.');
      }

      setSessions((prev) =>
        prev.map((s) =>
          s.requestId === requestId
            ? { ...s, status: 'cancelled', allocatedKw: 0, bayId: null }
            : s
        )
      );

      addEvent({
        timestamp: currentTimeIso,
        requestId,
        vehicleId: session.vehicleId,
        type: 'warning',
        category: 'queue',
        message: `Charging request cancelled for ${session.vehicleId}.`,
      });
    },
    [sessions, confirmBayReleased, currentTimeIso, addEvent]
  );

  const dismissEvent = useCallback((eventId: string) => {
    setSystemEvents((prev) => prev.filter((e) => e.id !== eventId));
  }, []);

  const clearAllEvents = useCallback(() => {
    setSystemEvents([]);
  }, []);

  return (
    <SimulationContext.Provider
      value={{
        currentTimeIso,
        isPlaying,
        playbackSpeed,
        togglePlay,
        setSpeed,
        stepMinutes,
        resetSimulation,
        loadPreset,
        activePresetId,
        allPresets: ALL_PRESETS,

        sitePowerBudgetKw,
        setSitePowerBudgetKw,
        activeAlgorithm,
        setActiveAlgorithm,
        chargerMaxKw,
        totalAllocatedPowerKw,
        availableStandardStalls,
        staffOnDuty,
        idleGracePeriodMins,
        idleFeePerMin,

        bays,
        sessions,
        activeSession,
        activeRequestId,
        setActiveRequestId,
        systemEvents,
        historyRecords,

        userRole,
        setUserRole,

        submitRequest,
        confirmPlan,
        requestValetAssistance,
        requestExtension,
        modifyRequest,
        cancelRequest,

        confirmVehicleParkedAndPlugged,
        reviewValetTask,
        completeValetTask,
        confirmBayReleased,
        reviewExtensionRequest,
        dismissEvent,
        clearAllEvents,
      }}
    >
      {children}
    </SimulationContext.Provider>
  );
};

export const useSimulation = () => {
  const context = useContext(SimulationContext);
  if (!context) {
    throw new Error('useSimulation must be used within a SimulationProvider');
  }
  return context;
};
