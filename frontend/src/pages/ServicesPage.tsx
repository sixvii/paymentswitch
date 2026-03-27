import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { ChevronRight, HandCoins, Lock, Type, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import settingsIcon from '@/assets/icons/settings.png';
import trustIcon from '@/assets/icons/trust.png';
import ajoIcon from '@/assets/icons/ajo.png';
import escrowIcon from '@/assets/icons/escrow.png';


import { useState } from 'react';
import PinInput from '@/components/ui/PinInput';
import { useToast } from '@/hooks/use-toast';

const ServicesPage = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    setAjoActivation,
    setPiggyActivation,
    setEscrowActivation,
    fontSize,
    setFontSize,
  } = useStore();
  const { toast } = useToast();

  const [pendingService, setPendingService] = useState<null | 'escrow' | 'piggy' | 'ajo'>(null);
  const [pinError, setPinError] = useState('');
  const [pendingChecked, setPendingChecked] = useState(false);

  const handleToggle = async (service: 'escrow' | 'piggy' | 'ajo', checked: boolean) => {
    if (!checked) {
      // Allow deactivation instantly
      const result = service === 'escrow'
        ? await setEscrowActivation(false)
        : service === 'piggy'
          ? await setPiggyActivation(false)
          : await setAjoActivation(false);

      if (!result.success) {
        toast({ title: result.message });
      }
      return;
    }
    setPendingService(service);
    setPendingChecked(true);
    setPinError('');
  };

  const handlePinComplete = async (pin: string) => {
    if (!currentUser) return;
    if (pin !== currentUser.pin) {
      setPinError('Incorrect PIN');
      return;
    }

    let result = { success: false, message: 'Unable to update service activation.' };
    if (pendingService === 'escrow') result = await setEscrowActivation(true, pin);
    if (pendingService === 'piggy') result = await setPiggyActivation(true, pin);
    if (pendingService === 'ajo') result = await setAjoActivation(true, pin);

    if (!result.success) {
      setPinError(result.message);
      return;
    }

    toast({ title: `${pendingService?.charAt(0).toUpperCase() + pendingService?.slice(1)} activated!` });
    setPendingService(null);
    setPendingChecked(false);
    setPinError('');
  };

  const closePendingActivation = () => {
    setPendingService(null);
    setPendingChecked(false);
    setPinError('');
  };

  const services = [
    { image: settingsIcon, label: 'Settings', path: '/settings', desc: 'App preferences' },
    { image: trustIcon, label: 'Trust Score', path: '/trust-score', desc: 'View your financial identity' },
    { label: 'Interswitch QuickStart', path: '/services/interswitch-quickstart', desc: 'Run inline checkout, pay-bill, and verification in TEST mode' },
    { icon: HandCoins, label: 'Loans', path: '/loans', desc: 'Apply and repay credit-based loans' },
    { label: 'Merchant Dashboard', path: '/merchant-dashboard', desc: 'Record and view merchant/agent transactions' },
    { label: 'Transaction Search', path: '/transactions/search', desc: 'Search and analyze your transactions' },
    { label: 'Fraud / Dispute Reporting', path: '/fraud-dispute', desc: 'Report a transaction issue or suspected fraud' },
  ];

  return (
    <>
      {pendingService && (
        <div className="fixed inset-0 z-50  backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-[10px] border border-[#0C436A] bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="md:text-[17px] text-[15px] font-bold text-foreground">
                  Enter PIN to activate {pendingService.charAt(0).toUpperCase() + pendingService.slice(1)}
                </h2>
                <p className="md:text-sm text-[11px] text-muted-foreground mt-1">
                  Enter your 4-digit PIN to confirm and activate this service on your account.
                </p>
              </div>
              <button
                type="button"
                onClick={closePendingActivation}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close activation screen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-6 pb-2 flex flex-col items-center">
              <PinInput onComplete={handlePinComplete} label="Enter your 4-digit PIN" />
              {pinError && <p className="text-red-500 text-center mt-2">{pinError}</p>}
            </div>
          </div>
        </div>
      )}
      <div className="py-4 space-y-6 animate-fade-in">
        <h1 className="text-[17px] font-[600] text-foreground">Services</h1>

        <div className="space-y-3">
          <div className="w-full flex items-center gap-4 p-4 rounded-[10px] border border-border text-left">
            <div className="w-12 h-12 flex items-center justify-center">
              <span
                className="block w-6 h-6"
                style={{
                  backgroundColor: '#0A4065',
                  WebkitMaskImage: `url(${escrowIcon})`,
                  maskImage: `url(${escrowIcon})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Escrow Activation</p>
              <p className="md:text-sm text-[12px] text-muted-foreground">Enable before accessing the Escrow page</p>
            </div>
            <Switch
              checked={!!currentUser?.escrowActivated || (pendingService === 'escrow' && pendingChecked)}
              onCheckedChange={(checked) => handleToggle('escrow', checked)}
              aria-label="Toggle escrow activation"
            />
          </div>

          <div className="w-full flex items-center gap-4 p-4 rounded-[10px]  border border-border text-left">
            <div className="w-12 h-12 flex items-center justify-center">
              <Lock className="w-6 h-6 text-[#0A4065]" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Piggy Activation</p>
              <p className="md:text-sm text-[12px] text-muted-foreground">Enable before accessing the Piggy page</p>
            </div>
            <Switch
              checked={!!currentUser?.piggyActivated || (pendingService === 'piggy' && pendingChecked)}
              onCheckedChange={(checked) => handleToggle('piggy', checked)}
              aria-label="Toggle piggy activation"
            />
          </div>

          <div className="w-full flex items-center gap-4 p-4 rounded-[10px] border border-border text-left">
            <div className="w-12 h-12 flex items-center justify-center">
              <span
                className="block w-6 h-6"
                style={{
                  backgroundColor: '#0A4065',
                  WebkitMaskImage: `url(${ajoIcon})`,
                  maskImage: `url(${ajoIcon})`,
                  WebkitMaskRepeat: 'no-repeat',
                  maskRepeat: 'no-repeat',
                  WebkitMaskSize: 'contain',
                  maskSize: 'contain',
                  WebkitMaskPosition: 'center',
                  maskPosition: 'center',
                }}
              />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">Ajo Activation</p>
              <p className="md:text-sm text-[12px] text-muted-foreground">Enable before accessing the Ajo page</p>
            </div>
            <Switch
              checked={!!currentUser?.ajoActivated || (pendingService === 'ajo' && pendingChecked)}
              onCheckedChange={(checked) => handleToggle('ajo', checked)}
              aria-label="Toggle ajo activation"
            />
          </div>
        </div>

        <div className="space-y-3">
          {services.map(s => {
            const Icon = s.icon;
            return (
              <button key={s.label} onClick={() => navigate(s.path!)}
                className="w-full flex items-center gap-4 p-4 rounded-[10px] border border-border hover:bg-muted/50 transition-colors text-left">
                <div className="w-12 h-12 flex items-center justify-center">
                  {s.image ? (
                    <span
                      className="block w-6 h-6"
                      style={{
                        backgroundColor: '#0A4065',
                        WebkitMaskImage: `url(${s.image})`,
                        maskImage: `url(${s.image})`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                      }}
                    />
                  ) : Icon ? (
                    <Icon className="w-6 h-6 text-[#0A4065]" />
                  ) : null}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{s.label}</p>
                  <p className="md:text-sm text-[12px] text-muted-foreground">{s.desc}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            );
          })}
        </div>

        {/* Font Size */}
        <div className="border-border rounded-[10px] p-4">
          <div className="flex items-center gap-3 mb-3">
            <Type className="w-5 h-5 text-primary" />
            <p className="font-semibold text-foreground">Font Size: {fontSize}px</p>
          </div>
          <input type="range" min={12} max={22} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full accent-primary" />
        </div>
      </div>
    </>
  );
};

export default ServicesPage;
