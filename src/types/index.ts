export type ChargingStatus =
  | 'pending_confirmation' // EV01 -> EV02 review
  | 'waiting_bay'          // in queue waiting for an open charger bay
  | 'waiting_plugin'       // assigned bay, waiting for vehicle entry and cable plug
  | 'charging'             // actively drawing power
  | 'paused'               // 0 kW due to grid limit or power allocation
  | 'target_reached'       // completed target kWh, but still occupying bay (hogging)
  | 'ended_incomplete'     // departed before reaching target (e.g. guest left early or deadline reached)
  | 'cancelled';           // cancelled by guest

export type BayStatus =
  | 'vacant'               // empty and available
  | 'reserved_entry'       // waiting for designated vehicle to pull in
  | 'occupied_charging'    // vehicle plugged in and charging/paused
  | 'occupied_idle';       // vehicle finished charging, occupying bay

export type ValetTaskStatus =
  | 'none'
  | 'pending_review'       // guest submitted, awaiting front desk check
  | 'accepted'             // front desk confirmed 4 items & assigned staff
  | 'rejected'             // front desk declined with reason
  | 'completed';           // staff physically moved car to regular stall and freed bay

export type ExtensionStatus =
  | 'pending'
  | 'approved'
  | 'rejected';

export interface VehicleRequestInput {
  vehicleId: string;
  guestName: string;
  roomNumber: string;
  inputMode: 'kwh' | 'percentage';
  targetKwh?: number;
  batteryCapacityKwh?: number;
  currentPercent?: number;
  targetPercent?: number;
  useByTime: string;          // ISO string
  requestedMoveTime: string;  // ISO string
  moveMethod: 'self' | 'valet';
}

export interface ChargingSession {
  requestId: string;
  vehicleId: string;
  guestName: string;
  roomNumber: string;
  batteryCapacityKwh: number;
  initialSocPercent: number;
  targetKwh: number;
  targetPercent: number;
  arrivalTime: string;         // ISO string
  useByTime: string;           // ISO string
  agreedMoveByTime: string;     // ISO string
  moveMethod: 'self' | 'valet';

  // Planned estimates
  estimatedStartTime: string;
  estimatedFinishTime: string;
  plannedLatestFinishTime: string;
  isFeasibleOnTime: boolean;
  projectedDeficitKwh: number;
  guestAcceptedDeficit: boolean;

  // Real-time dynamic state
  status: ChargingStatus;
  bayId: string | null;        // e.g. "bay-1"
  deliveredKwh: number;
  allocatedKw: number;
  maxChargeKw: number;         // car/charger maximum kW capability (e.g. 7.0 kW or 11.0 kW)
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
    vehicleId: string;
    targetKwh: number;
    deliveredKwh: number;
    onTime: boolean;
    queueWaitMins: number;
    idleOccupancyMins: number;
    deadline: string;
    completedAt: string | null;
  }[];
}
