import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Eye, EyeOff, Send, QrCode, Shield, Receipt, Users, ChevronRight, ArrowDownLeft, HandHelping, Lock, CreditCard, Globe } from 'lucide-react';
import { useMemo, useState } from 'react';
import escrowIcon from '@/assets/icons/escrow.png';
import billsIcon from '@/assets/icons/bills.png';
import ajoIcon from '@/assets/icons/ajo.png';
import qrCodeIcon from '@/assets/icons/qr-code.png';
import { computeUserTrustScore } from '@/lib/trustScore';

const HomePage = () => {
  const navigate = useNavigate();
  const { currentUser, balance, trustScore, transactions, savingsGroups, escrows, billPayments, cards } = useStore();
  const [showBalance, setShowBalance] = useState(true);

  const derivedTrustScore = useMemo(() => computeUserTrustScore({
    currentUser,
    transactions,
    savingsGroups,
    escrows,
    billPayments,
    fallback: trustScore,
  }), [billPayments, currentUser, escrows, savingsGroups, transactions, trustScore]);

  const primaryCard = cards.find((card) => card.isDefault) || cards[0];

  const getCardTone = (brand: 'visa' | 'mastercard' | 'verve' | 'other') => {
    if (brand === 'visa') return 'from-[#0D4E7D] via-[#0C628C] to-[#0E8AA0]';
    if (brand === 'mastercard') return 'from-[#0C436A] via-[#0D6B8B] to-[#2BA0A2]';
    if (brand === 'verve') return 'from-[#104B76] via-[#146085] to-[#2B8A9D]';
    return 'from-[#184B63] via-[#1C6880] to-[#3598A6]';
  };

  const getBrandLabel = (brand: 'visa' | 'mastercard' | 'verve' | 'other') => {
    if (brand === 'visa') return 'Visa';
    if (brand === 'mastercard') return 'Mastercard';
    if (brand === 'verve') return 'Verve';
    return 'Card';
  };

  const quickActions = [
    { icon: Send, label: 'Send Money', path: '/transact/send-options' },
    { icon: ArrowDownLeft, label: 'Receive', path: '/transact/receive' },
    { icon: Receipt, image: billsIcon, label: 'Pay Bills', path: '/transact/bills' },
    { icon: Users, image: ajoIcon, label: 'Ajo', path: '/ajo' },
    { icon: HandHelping, label: 'Request', path: '/requests' },
    { icon: Lock, label: 'Piggy', path: '/piggy' },
    { icon: QrCode, image: qrCodeIcon, label: 'Scan QR', path: '/transact/scan' },
    { icon: CreditCard, label: 'Cardless', path: '/cardless' },
  ];

  return (
    <div className="py-4 space-y-6 animate-fade-in">
      {/* Greeting */}
      <div>
        <p className="text-muted-foreground">Hello, {currentUser?.firstName?.toUpperCase()}</p>
      </div>

      {/* Balance Card */}
      <div className="rounded-[10px] gradient-primary p-6 text-primary-foreground">
        <div className="flex items-center justify-between mb-1">
          <p className="text-primary-foreground/70 text-sm">Total Available Balance</p>
          <button onClick={() => setShowBalance(!showBalance)}>
            {showBalance ? <Eye className="w-5 h-5 text-primary-foreground/70" /> : <EyeOff className="w-5 h-5 text-primary-foreground/70" />}
          </button>
        </div>
        <p className="text-3xl font-bold mb-4">
          {showBalance ? `NGN ${balance.toLocaleString()}.00` : 'NGN XXXXXXXXXX'}
        </p>
        <div className="border-t border-primary-foreground/20 pt-3">
          <p className="text-sm text-primary-foreground/70">Savings Account</p>
          <div className="flex items-center justify-between">
            <p className="text-sm">
              Available Balance For : <span className="font-semibold">{showBalance ? currentUser?.accountNumber : 'XXXXXXXXXX'}</span>
            </p>
            <ChevronRight className="w-4 h-4 text-secondary" />
          </div>
        </div>
      </div>

      {/* Trust Score Preview */}
      <button
        onClick={() => navigate('/trust-score')}
        className="w-full rounded-[10px] bg-[#F2F5F7] border border-[#0C4168] p-4 flex items-center gap-4"
      >
        <div className="w-14 h-14 rounded-full bg-[#F2F5F7] border-2 border-dashed border-[#0C4168] flex items-center justify-center">
          <span className="text-[#0C4168] font-bold text-lg">{derivedTrustScore.overall}</span>
        </div>
        <div className="text-left flex-1">
          <p className="font-semibold text-foreground">Trust Score</p>
          <p className="text-sm text-muted-foreground">Tap to see details</p>
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </button>

      {/* Quick Actions */}
      <div>
        <h2 className="font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 md:grid-cols-8 gap-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex min-h-[124px] flex-col items-center justify-center gap-3 p-4 rounded-[10px] bg-[#F2F3F4] border border-[#0F5182] hover:bg-[#EAF0F3] transition-colors"
              >
                <div className="w-12 h-12 flex items-center justify-center">
                  {action.image ? (
                    <span
                      className="block w-6 h-6"
                      aria-label={action.label}
                      role="img"
                      style={{
                        backgroundColor: '#0F5182',
                        WebkitMaskImage: `url(${action.image})`,
                        maskImage: `url(${action.image})`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                      }}
                    />
                  ) : (
                    <Icon className="w-6 h-6 text-[#0F5182]" />
                  )}
                </div>
                <span className="text-xs font-medium text-foreground text-center">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cards Section */}
      <div>
        <h2 className="font-semibold text-foreground mb-3">Cards</h2>
        {primaryCard ? (
          <button onClick={() => navigate('/cards')} className="w-72 max-w-full text-left">
            <div className={`relative min-h-[160px] overflow-hidden rounded-[10px] bg-gradient-to-br ${getCardTone(primaryCard.brand)} p-5 text-white shadow-lg`}>
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
              <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Inter-pay</p>
                  <span className="text-xs font-semibold bg-white/15 px-2 py-1 rounded-full">{getBrandLabel(primaryCard.brand)}</span>
                </div>
                <p className="text-lg tracking-[0.16em] font-semibold mb-4">•••• •••• •••• {primaryCard.last4}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] uppercase text-white/70">Cardholder</p>
                    <p className="text-sm font-semibold uppercase">{primaryCard.cardholderName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase text-white/70">Expires</p>
                    <p className="text-sm font-semibold">{primaryCard.expiryMonth}/{primaryCard.expiryYear}</p>
                  </div>
                </div>
              </div>
            </div>
          </button>
        ) : (
          <button onClick={() => navigate('/cards')} className="w-72 max-w-full text-left">
            <div className={`relative min-h-[160px] overflow-hidden rounded-[10px] bg-gradient-to-br ${getCardTone('visa')} p-5 text-white shadow-lg`}>
              <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
              <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">Inter-pay</p>
                  <span className="text-xs font-semibold bg-white/15 px-4 py-1 rounded-[10px]">Visa</span>
                </div>
                <p className="text-lg tracking-[0.16em] font-semibold mb-4">•••• •••• •••• ••••</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px] uppercase text-white/70">Cardholder</p>
                    <p className="text-[12px] font-semibold uppercase">Cardholder Name</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] uppercase text-white/70">Expires</p>
                    <p className="text-[12px] font-semibold">MM/YY</p>
                  </div>
                </div>
              </div>
            </div>
          </button>
        )}
      </div>
    </div>
  );
};

export default HomePage;
