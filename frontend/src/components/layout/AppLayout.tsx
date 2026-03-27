import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppHeader from './AppHeader';
import BottomNav from './BottomNav';
import { useStore } from '@/store/useStore';
import { fetchBackendAccountState } from '@/lib/backendApi';

const AppLayout = () => {
  const location = useLocation();
  const { processAjoAutoPayments, autoReleaseMaturedLockedFunds, currentUser, setBalance } = useStore();

  // Auto-pay Ajo contributions every minute
  useEffect(() => {
    processAjoAutoPayments();
    const timer = window.setInterval(() => {
      processAjoAutoPayments();
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, [processAjoAutoPayments]);

  // Auto-release matured piggy funds every minute
  useEffect(() => {
    if (!currentUser?.id) return;

    void autoReleaseMaturedLockedFunds();
    const timer = window.setInterval(() => {
      void autoReleaseMaturedLockedFunds();
    }, 60 * 1000);

    return () => window.clearInterval(timer);
  }, [currentUser?.id, autoReleaseMaturedLockedFunds]);

  // Sync balance with backend every 30 seconds to catch updates
  useEffect(() => {
    if (!currentUser?.id) return;

    const syncBalance = async () => {
      try {
        const accountState = await fetchBackendAccountState();
        setBalance(accountState.balance);
      } catch {
        // Keep existing balance if sync fails
      }
    };

    syncBalance();
    const timer = window.setInterval(() => {
      void syncBalance();
    }, 30 * 1000);

    return () => window.clearInterval(timer);
  }, [currentUser?.id, setBalance]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background max-w-5xl mx-auto relative">
      <AppHeader />
      <main className="pb-24 px-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};

export default AppLayout;
