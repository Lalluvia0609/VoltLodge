import { guestLabel, vehicleTypeLabel } from '../../utils/guestIdentity';
import React, { useState } from 'react';
import { useSimulation } from '../../context/SimulationContext';
import { RequestForm } from './RequestForm';
import { PlanReview } from './PlanReview';
import { ActiveSession } from './ActiveSession';
import { PlusCircle, Car, Clock } from 'lucide-react';

export const GuestView: React.FC = () => {
  const { activeSession, activeRequestId, setActiveRequestId, sessions } =
    useSimulation();
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);

  const [mode, setMode] = useState<'book_ahead' | 'register_now'>(
    'register_now',
  );

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
              data-request-id={s.requestId}
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
              <span>
                {guestLabel(s, sessions)} · {vehicleTypeLabel(s)}
              </span>
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
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 pt-4 flex gap-3">
        {(['book_ahead', 'register_now'] as const).map((entry) => (
          <button
            key={entry}
            className="px-4 py-2 rounded-xl border border-emerald-500/40 text-emerald-300 text-sm"
            onClick={() => {
              setMode(entry);
              setActiveRequestId(null);
              setIsCreatingNew(true);
            }}
          >
            <PlusCircle className="inline w-4 h-4 mr-2" />
            {entry === 'book_ahead' ? 'Book ahead' : 'Register now'}
          </button>
        ))}
      </div>
      {isCreatingNew ? (
        <RequestForm
          key={mode}
          registrationMode={mode}
          onPlanCreated={handlePlanCreated}
        />
      ) : activeSession?.status === 'pending_confirmation' ? (
        <PlanReview
          key={activeRequestId}
          onBackToEdit={() => {
            setMode(activeSession.registrationMode || 'register_now');
            setIsCreatingNew(true);
          }}
          onConfirmed={handlePlanConfirmed}
        />
      ) : (
        <ActiveSession key={activeRequestId} />
      )}
    </div>
  );
};
