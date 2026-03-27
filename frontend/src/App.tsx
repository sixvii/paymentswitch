import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useState } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useStore } from "@/store/useStore";
import AppLayout from "@/components/layout/AppLayout";
import PhoneEntryPage from "@/pages/auth/PhoneEntryPage";
import LoginPage from "@/pages/auth/LoginPage";
import RegisterPage from "@/pages/auth/RegisterPage";
import HomePage from "@/pages/HomePage";
import DashboardPage from "@/pages/DashboardPage";
import TransactPage from "@/pages/TransactPage";
import SendMoneyOptionsPage from "@/pages/transact/SendMoneyOptionsPage";
import SendMoneyPage from "@/pages/transact/SendMoneyPage";
import ReceiveMoneyPage from "@/pages/transact/ReceiveMoneyPage";
import ScanQRPage from "@/pages/transact/ScanQRPage";
import TransactionReceiptPage from "@/pages/transact/TransactionReceiptPage";
import BillPaymentPage from "@/pages/transact/BillPaymentPage";
import EscrowPage from "@/pages/EscrowPage";
import AjoPage from "@/pages/AjoPage";
import TrustScorePage from "@/pages/TrustScorePage";
import ServicesPage from "@/pages/ServicesPage";
import CardsPage from "@/pages/CardsPage";
import LockedFundsPage from "@/pages/LockedFundsPage";
import LoansPage from "@/pages/LoansPage";
import RequestsPage from "@/pages/RequestsPage";
import ProfilePage from "@/pages/ProfilePage";
import ChatPage from "@/pages/ChatPage";
import NotificationsPage from "@/pages/NotificationsPage";
import NotFound from "./pages/NotFound";
import SettingsPage from "./pages/SettingsPage";
import CardlessPage from "./pages/CardlessPage";
import CrossBorderPage from "./pages/CrossBorderPage";
import TransactionSearchPage from "./pages/TransactionSearchPage";
import FraudDisputePage from "./pages/FraudDisputePage";
import MerchantDashboardPage from "./pages/MerchantDashboardPage";
import InterswitchQuickstartPage from "./pages/InterswitchQuickstartPage";
import { AUTH_EXPIRED_EVENT } from "@/lib/backendApi";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useStore();
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const AuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useStore();
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PiggyGuard = ({ children }: { children: React.ReactNode }) => {
  const { currentUser } = useStore();
  if (!currentUser?.piggyActivated) return <Navigate to="/services" replace />;
  return <>{children}</>;
};

const App = () => {
  const { fontSize, logout, isAuthenticated, autoReleaseMaturedLockedFunds } = useStore();
  const [showLaunchSplash, setShowLaunchSplash] = useState(true);

  useEffect(() => {
    const onAuthExpired = () => logout();
    window.addEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, onAuthExpired);
    };
  }, [logout]);

  useEffect(() => {
    if (!showLaunchSplash) return;

    const timer = window.setTimeout(() => {
      setShowLaunchSplash(false);
    }, 1700);

    return () => window.clearTimeout(timer);
  }, [showLaunchSplash]);

  useEffect(() => {
    if (!isAuthenticated) return;

    void autoReleaseMaturedLockedFunds();

    const interval = window.setInterval(() => {
      void autoReleaseMaturedLockedFunds();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [isAuthenticated, autoReleaseMaturedLockedFunds]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Sonner />
        <div style={{ fontSize: `${fontSize}px` }}>
          {showLaunchSplash && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background">
              <img src="/logo.svg" alt="TrustPay logo" className="w-20 h-20 object-contain launch-logo-pop-twice" />
            </div>
          )}
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Routes>
              {/* Auth routes */}
              <Route path="/auth" element={<AuthGuard><PhoneEntryPage /></AuthGuard>} />
              <Route path="/auth/login" element={<AuthGuard><LoginPage /></AuthGuard>} />
              <Route path="/auth/register" element={<AuthGuard><RegisterPage /></AuthGuard>} />

              {/* Protected routes with layout */}
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<HomePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/chat" element={<ChatPage />} />
                <Route path="/transact" element={<TransactPage />} />
                <Route path="/transact/send-options" element={<SendMoneyOptionsPage />} />
                <Route path="/transact/send" element={<SendMoneyPage />} />
                <Route path="/transact/receive" element={<ReceiveMoneyPage />} />
                <Route path="/transact/scan" element={<ScanQRPage />} />
                <Route path="/transact/receipt/:transactionId" element={<TransactionReceiptPage />} />
                <Route path="/transact/airtime" element={<BillPaymentPage category="airtime" title="Buy Airtime" />} />
                <Route path="/transact/data" element={<BillPaymentPage category="data" title="Buy Data" />} />
                <Route path="/transact/bills" element={<BillPaymentPage category="bills" title="Pay Bills" />} />
                <Route path="/transact/insurance" element={<BillPaymentPage category="insurance" title="Pay Insurance" />} />
                <Route path="/transact/waka" element={<BillPaymentPage category="bills" title="Waka Now" />} />
                <Route path="/escrow" element={<EscrowPage />} />
                <Route path="/ajo" element={<AjoPage />} />
                <Route path="/trust-score" element={<TrustScorePage />} />
                <Route path="/services" element={<ServicesPage />} />
                <Route path="/cards" element={<CardsPage />} />
                <Route path="/piggy" element={<PiggyGuard><LockedFundsPage /></PiggyGuard>} />
                <Route path="/locked-funds" element={<PiggyGuard><LockedFundsPage /></PiggyGuard>} />
                <Route path="/loans" element={<LoansPage />} />
                <Route path="/requests" element={<RequestsPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/notifications" element={<NotificationsPage />} />
                <Route path="/cardless" element={<CardlessPage />} />
                <Route path="/cross-border" element={<CrossBorderPage />} />
                <Route path="/transactions/search" element={<TransactionSearchPage />} />
                <Route path="/fraud-dispute" element={<FraudDisputePage />} />
                <Route path="/merchant-dashboard" element={<MerchantDashboardPage />} />
                <Route path="/services/interswitch-quickstart" element={<InterswitchQuickstartPage />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
