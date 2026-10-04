export type ChargingStatus =
  | 'pending_confirmation' // EV01 -> EV02 review
  | 'waiting_bay' // in queue waiting for an open charger bay
  | 'waiting_plugin' // assigned bay, waiting for vehicle entry and cable plug
  | 'charging' // actively drawing power
  | 'paused' // 0 kW due to grid limit or power allocation
  | 'target_reached' // completed target kWh, but still occupying bay (hogging)
  | 'ended_incomplete' // departed before reaching target (e.g. guest left early or deadline reached)
  | 'cancelled'; // cancelled by guest

export type BayStatus =
  | 'vacant' // empty and available
  | 'reserved_entry' // waiting for designated vehicle to pull in
  | 'occupied_charging' // vehicle plugged in and charging/paused
  | 'occupied_idle'; // vehicle finished charging, occupying bay

export type ValetTaskStatus =
  | 'none'
  | 'pending_review' // guest submitted, awaiting front desk check
  | 'accepted' // front desk confirmed 4 items & assigned staff
  | 'rejected' // front desk declined with reason
  | 'completed'; // staff physically moved car to regular stall and freed bay

export type ExtensionStatus = 'pending' | 'approved' | 'rejected';

export type VehicleTypeId = 'A' | 'B' | 'C' | 'D';

export interface VehicleRequestInput {
  vehicleType: VehicleTypeId;
  guestName: string;
  roomNumber: string;
  inputMode: 'kwh' | 'percentage';
  currentPercent?: number;
  targetPercent?: number;
  registrationMode?: 'book_ahead' | 'register_now';
  arrivalTime?: string;
  requestedMoveTime: string; // ISO string
  moveMethod: 'self' | 'valet';
}

export interface PenaltyPolicy {
  ratePerMinute: number;
  graceMinutes: number;
}
export interface PenaltyRecord {
  agreedMoveBy: string;
  actualMoveOutTime: string | null;
  lateMinutes: number;
  penaltyAmount: number;
  penaltyStatus: 'none' | 'accruing' | 'final';
  penaltyReason: string;
  ratePerMinute: number;
  graceMinutes: number;
}
export interface ChargingSession {
  penalty?: PenaltyRecord;
  vehicleType?: VehicleTypeId; // Custom engineering scenarios can use independent parameters.
  requestId: string;
  vehicleId: string;
  guestName: string;
  roomNumber: string;
  batteryCapacityKwh: number;
  initialSocPercent: number;
  targetKwh: number;
  targetPercent: number;
  arrivalTime: string; // ISO string
  agreedMoveByTime: string; // ISO string
  moveMethod: 'self' | 'valet';

  // Planned estimates
  estimatedStartTime: string;
  estimatedFinishTime: string;
  plannedLatestFinishTime: string;
  isFeasibleOnTime: boolean;
  projectedDeficitKwh: number;
  guestAcceptedDeficit: boolean;
  originalLatestFinishTime?: string;
  chargingDeadline?: string;
  completionWindowStart?: string;
  completionWindowEnd?: string;
  moveReportedAt?: string | null;
  simulatedValetMoved?: boolean;
  registrationMode?: 'book_ahead' | 'register_now';
  arrivalConfirmed?: boolean;
  committedKwh?: number; // Explicitly accepted charging promise, separate from the original goal.
  commitmentReachedAt?: string | null;
  chargingStoppedAt?: string | null;
  acceptedEarlyDeparture?: boolean;
  earlyDepartureEstimatePercent?: number;

  // Real-time dynamic state
  status: ChargingStatus;
  bayId: string | null; // e.g. "bay-1"
  deliveredKwh: number;
  allocatedKw: number;
  maxChargeKw: number; // Vehicle AC acceptance limit, separate from charger limits.
  pluggedInAt: string | null;
  targetReachedAt: string | null;
  bayReleasedAt: string | null;

  // Valet assistance
  valetTask?: ValetTask;

  // Extension request
  extensionRequest?: ExtensionRequest;

  // Notifications tracking to prevent duplicate spam
  notificationsSent: {
    fifteenMinWarning: boolean;
    targetReached: boolean;
    overdueWarning: boolean;
  };
}

export interface Bay {
  bayId: string;
  bayNumber: number;
  name: string;
  maxKw: number;
  currentStatus: BayStatus;
  currentVehicleId: string | null;
  currentRequestId: string | null;
  allocatedKw: number;
}

export interface ValetTask {
  taskId: string;
  requestId: string;
  vehicleId: string;
  bayId: string;
  requestedAt: string;
  status: ValetTaskStatus;
  authorizationConfirmed: boolean;
  keysHandoverNote: string;
  keysReceived: boolean;
  staffAssigned: string | null;
  destinationBay: string | null; // e.g. "Standard Stall #12"
  rejectionReason?: string;
  completedAt?: string;
}

export interface ExtensionRequest {
  requestId: string;
  vehicleId: string;
  currentDeadline: string;
  requestedDeadline: string;
  reason: string;
  status: ExtensionStatus;
  requestedAt: string;
  reviewedAt?: string;
  allowChargingDelay?: boolean;
}

export interface SystemEvent {
  id: string;
  timestamp: string;
  requestId?: string;
  vehicleId?: string;
  type: 'info' | 'warning' | 'success' | 'alert';
  category: 'charging' | 'queue' | 'bay' | 'valet' | 'power';
  message: string;
  read?: boolean;
}

export interface HistoryRecord {
  penalty: PenaltyRecord;
  vehicleType?: VehicleTypeId;
  targetPercent: number;
  actualPercent: number;
  chargingStartedAt: string | null;
  chargingCompletedAt: string | null;
  chargingStoppedAt: string | null;
  actualMoveTime: string | null;
  archivedAt: string;
  acceptedEarlyDeparture: boolean;
  earlyDepartureDeficitKwh: number;
  valetTask?: ValetTask;
  hadBay: boolean;
  session: ChargingSession; // Immutable final snapshot; never used as a live bay occupant.
  id: string;
  requestId: string;
  vehicleId: string;
  guestName: string;
  roomNumber: string;
  arrivalTime: string;
  departureTime: string;
  targetKwh: number;
  actualDeliveredKwh: number;
  targetAchieved: boolean;
  onTimeCompletion: boolean;
  scheduledMoveTime: string;
  actualReleaseTime: string;
  overstayMinutes: number;
  simulatedFeeCharged: number;
  valetUsed: boolean;
  notes: string;
  commitmentFulfilled?: boolean;
  outcomeReason?: string;
}

export type AllocationAlgorithm = 'equal_sharing' | 'demand_urgency';

export interface SimulationPolicyConfig {
  id: string;
  name: string;
  shortName: string;
  description: string;
  allocationAlgorithm: AllocationAlgorithm;
  enableMoveManagement: boolean; // proactive reminders + valet assistance
  color: string;
}

export interface SimulationResultMetrics {
  policyId: string;
  policyName: string;
  totalVehicles: number;
  targetSuccessRatePercent: number;
  commitmentSuccessRatePercent: number;
  guestEarlyDepartureCount: number;
  guestEarlyDepartureDeficitKwh: number;
  vehiclesCompletedOnTime: number;
  onTimeSuccessRatePercent: number;
  totalRequestedKwh: number;
  totalDeliveredKwh: number;
  totalDeficitKwh: number;
  averageQueueWaitMinutes: number;
  totalPostChargeIdleMinutes: number;
  totalValetMoves: number;
  maxPowerUsedKw: number;
  powerLimitBreaches: number;
  timelineEvents: {
    time: string;
    vehicleId: string;
    description: string;
    type: 'success' | 'warning' | 'alert' | 'info';
  }[];
  vehicleOutcomes: {
    requestId: string;
    guestName: string;
    roomNumber: string;
    vehicleType?: VehicleTypeId;
    vehicleId: string;
    targetKwh: number;
    deliveredKwh: number;
    onTime: boolean;
    targetAchieved: boolean;
    commitmentFulfilled: boolean;
    acceptedEarlyDeparture: boolean;
    outcomeReason: string;
    queueWaitMins: number;
    idleOccupancyMins: number;
    deadline: string;
    completedAt: string | null;
  }[];
}
