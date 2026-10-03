/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SimulationProvider, useSimulation } from './context/SimulationContext';
import { Header } from './components/Header';
import { GuestView } from './components/guest/GuestView';
import { FrontDeskView } from './components/frontdesk/FrontDeskView';
import { SimulationComparisonView } from './components/simulation/SimulationComparisonView';
import { Zap, Shield, Car, BarChart3, AlertCircle } from 'lucide-react';

const MainContent: React.FC = () => {
  const { userRole, systemEvents } = useSimulation();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header />

      <main className="flex-1 pb-12">
        {userRole === 'guest' && <GuestView />}
        {userRole === 'frontdesk' && <FrontDeskView />}
        {userRole === 'simulation' && <SimulationComparisonView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Zap className="w-3 h-3 fill-current" />
            </div>
            <span className="font-semibold text-slate-300">VoltLodge</span>
            <span>— Hotel EV Peak Power Allocation & Bay Turnover Prototype</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span>Electrification Track</span>
            <span>•</span>
            <span>NZ Local Timezone Handling</span>
            <span>•</span>
            <span className="text-emerald-400 font-mono">EV01–EV14 Implemented</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <SimulationProvider>
      <MainContent />
    </SimulationProvider>
  );
}
