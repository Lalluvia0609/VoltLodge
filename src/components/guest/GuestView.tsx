import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { RequestForm } from './RequestForm';
import { PlanReview } from './PlanReview';
import { ActiveSession } from './ActiveSession';
import { PlusCircle, Car, Clock } from 'lucide-react';

export const GuestView: React.FC = () => {
  const { activeSession, activeRequestId, setActiveRequestId, sessions } =
    useSimulation();
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(!activeRequestId);

  const handlePlanCreated = (requestId: string) => {
    setActiveRequestId(requestId);
    setIsCreatingNew(false);
  };

  const handlePlanConfirmed = () => {
    setIsCreatingNew(false);
  };

  return (
    <div className="min-h-[calc(100vh-8rem)]">
      <p className="max-w-7xl mx-auto px-6 pt-4 text-xs text-slate-500">
        Simulation vehicle selector · separate from the guest charging plan
        below
      </p>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {sessions.map((s) => (
            <button
              key={s.requestId}
              onClick={() => {
                setActiveRequestId(s.requestId);
                setIsCreatingNew(false);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition shrink-0 ${
                activeRequestId === s.requestId && !isCreatingNew
                  ? 'bg-emerald-500 text-white shadow-sm'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Car className="w-3.5 h-3.5" />
              <span>{s.vehicleId}</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  s.status === 'charging'
                    ? 'bg-emerald-300 animate-pulse'
                    : s.status === 'target_reached'
                      ? 'bg-amber-400'
                      : s.status === 'waiting_bay'
                        ? 'bg-blue-400'
                        : 'bg-slate-500'
                }`}
              />
            </button>
          ))}

          <button
            onClick={() => {
              setActiveRequestId(null);
              setIsCreatingNew(true);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition shrink-0 ${
              isCreatingNew
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New charging plan</span>
          </button>
        </div>
      </div>

      {/* Main Container View Routing */}
      {isCreatingNew ? (
        <RequestForm onPlanCreated={handlePlanCreated} />
      ) : activeSession?.status === 'pending_confirmation' ? (
        <PlanReview
          key={activeRequestId}
          onBackToEdit={() => setIsCreatingNew(true)}
          onConfirmed={handlePlanConfirmed}
        />
      ) : (
        <ActiveSession />
      )}
    </div>
  );
};
