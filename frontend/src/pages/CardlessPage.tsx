

import { useState, useRef, useEffect } from 'react';
import PinInput from '@/components/ui/PinInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/store/useStore';
import { CreditCard, Loader2, Copy } from 'lucide-react';
import { cancelBackendPaycode, createBackendPaycode, fetchBackendPaycodes } from '@/lib/backendApi';
import TransactionSuccessAction from '@/components/ui/TransactionSuccessAction';

type PaycodeStatus = 'active' | 'expired' | 'used' | 'cancelled';
type PaycodeHistoryItem = {
  id?: string;
  code: string;
  amount: number;
  createdAt: string;
  status?: PaycodeStatus;
  expiresAt?: string;
};

const CardlessPage = () => {
  const { toast } = useToast();
  const { currentUser, isAuthenticated, balance, setBalance } = useStore();
  const [amount, setAmount] = useState('');
  const [paycode, setPaycode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paycodeHistory, setPaycodeHistory] = useState<PaycodeHistoryItem[]>([]);
  useEffect(() => {
    let active = true;

    if (!isAuthenticated || !currentUser?.id) {
      setPaycode(null);
      setPaycodeStatus(null);
      setPaycodeCountdown(0);
      setPaycodeHistory([]);
      return () => {
        active = false;
      };
    }

    setPaycode(null);
    setPaycodeStatus(null);
    setPaycodeCountdown(0);
    setPaycodeHistory([]);

    void fetchBackendPaycodes()
      .then((records) => {
        if (!active) return;

        const now = Date.now();
        const normalizedHistory = (records || []).map((entry) => {
          const expiresAtMs = entry.expiresAt ? new Date(entry.expiresAt).getTime() : null;
          const shouldExpire = entry.status === 'active' && (!!expiresAtMs && expiresAtMs <= now);
          const normalizedStatus: PaycodeStatus = shouldExpire
            ? 'expired'
            : (entry.status || 'expired');
          return {
            ...entry,
            status: normalizedStatus,
          };
        });

        setPaycodeHistory(normalizedHistory);

        const activeCode = normalizedHistory.find((entry) => entry.status === 'active');
        if (!activeCode) {
          return;
        }

        setPaycode(activeCode.code);
        setShowPaycode(true);
        setPaycodeStatus('active');
        const expiresIn = activeCode.expiresAt
          ? Math.max(0, Math.floor((new Date(activeCode.expiresAt).getTime() - now) / 1000))
          : 0;
        setPaycodeCountdown(expiresIn);
      })
      .catch(() => {
        if (!active) return;
        // Keep current in-memory state if backend fetch is unavailable.
      });

    return () => {
      active = false;
    };
  }, [isAuthenticated, currentUser?.id]);
  const [copied, setCopied] = useState(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const cooldownRef = useRef<NodeJS.Timeout | null>(null);
  const [showPinStep, setShowPinStep] = useState(false);
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const [pendingPin, setPendingPin] = useState<string>('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showPaycode, setShowPaycode] = useState(true);
  const [paycodeStatus, setPaycodeStatus] = useState<PaycodeStatus | null>(null);
  const [transactionId, setTransactionId] = useState('');
  const [paycodeCountdown, setPaycodeCountdown] = useState<number>(0);
  const paycodeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (paycodeTimerRef.current) clearInterval(paycodeTimerRef.current);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, []);

  useEffect(() => {
    if (paycodeStatus !== 'active' || !paycode) {
      if (paycodeTimerRef.current) {
        clearInterval(paycodeTimerRef.current);
        paycodeTimerRef.current = null;
      }
      return;
    }

    if (paycodeTimerRef.current) clearInterval(paycodeTimerRef.current);
    paycodeTimerRef.current = setInterval(() => {
      setPaycodeCountdown((prev) => {
        if (prev <= 1) {
          const expiredAt = new Date().toISOString();
          setPaycodeStatus('expired');
          setPaycodeHistory((current) => {
            const next: PaycodeHistoryItem[] = current.map((entry) => (
              entry.code === paycode && entry.status === 'active'
                ? { ...entry, status: 'expired', expiresAt: entry.expiresAt || expiredAt }
                : entry
            ));
            return next;
          });
          if (paycodeTimerRef.current) {
            clearInterval(paycodeTimerRef.current);
            paycodeTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (paycodeTimerRef.current) {
        clearInterval(paycodeTimerRef.current);
        paycodeTimerRef.current = null;
      }
    };
  }, [paycodeStatus, paycode]);

  // Step 1: Validate and show PIN/confirm dialog
  const handleGeneratePaycode = () => {
    if (cooldown > 0) {
      toast({ title: `Please wait ${cooldown} seconds before requesting a new paycode.` });
      return;
    }
    if (!isAuthenticated || !currentUser) {
      toast({ title: 'Please login to use this feature' });
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      toast({ title: 'Enter a valid amount' });
      return;
    }
    const amt = Number(amount);
    if (amt > balance) {
      toast({ title: 'Insufficient balance' });
      return;
    }
    setPendingAmount(amt);
    if (amt >= 50000) {
      setShowConfirm(true);
    } else {
      setShowPinStep(true);
    }
  };

  // Step 2: Handle PIN entry and paycode generation
  const handlePinConfirm = (pin: string) => {
    setPendingPin(pin);
    if (!currentUser) return;
    if (pin !== currentUser.pin) {
      toast({ title: 'Incorrect PIN' });
      return;
    }
    if (!pendingAmount) return;
    const amountToProcess = pendingAmount;
    setShowPinStep(false);
    setLoading(true);
    setTimeout(async () => {
      try {
        const created = await createBackendPaycode(amountToProcess);
        setBalance(created.balance);
        setTransactionId(created.paycode.id);

        const normalizedHistory: PaycodeHistoryItem[] = [
          {
            id: created.paycode.id,
            code: created.paycode.code,
            amount: created.paycode.amount,
            createdAt: created.paycode.createdAt,
            status: created.paycode.status,
            expiresAt: created.paycode.expiresAt,
          },
          ...paycodeHistory.map((entry) => (
            entry.status === 'active' ? { ...entry, status: 'expired' as PaycodeStatus } : entry
          )),
        ];

        setPaycode(created.paycode.code);
        setShowPaycode(true);
        setPaycodeStatus('active');
        const expiresIn = Math.max(0, Math.floor((new Date(created.paycode.expiresAt).getTime() - Date.now()) / 1000));
        setPaycodeCountdown(expiresIn);
        setPaycodeHistory(normalizedHistory);
      } catch {
        setLoading(false);
        toast({ title: 'Unable to generate paycode right now' });
        return;
      }

      setLoading(false);
      toast({ title: 'Paycode generated!', description: 'Use this code at ATM/POS.' });
      setCooldown(300); // 5 minutes
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, 1200);
  };

  // Step 3: Cancel paycode (invalidate)
  const handleCancelPaycode = () => {
    if (!paycode) return;

    const target = paycodeHistory.find((entry) => entry.code === paycode && entry.status === 'active');
    if (!target?.id) {
      setPaycodeStatus('cancelled');
      setShowPaycode(false);
      return;
    }

    void (async () => {
      try {
        await cancelBackendPaycode(target.id!);
        setPaycodeStatus('cancelled');
        setShowPaycode(false);
        if (paycodeTimerRef.current) clearInterval(paycodeTimerRef.current);
        setPaycodeHistory((current) => current.map((entry) => (
          entry.id === target.id ? { ...entry, status: 'cancelled' as PaycodeStatus } : entry
        )));
      } catch {
        toast({ title: 'Unable to cancel paycode right now' });
      }
    })();
  };

  // Step 4: Confirm dialog for large amounts
  const handleConfirmProceed = () => {
    setShowConfirm(false);
    setShowPinStep(true);
  };
  const handleConfirmCancel = () => {
    setShowConfirm(false);
    setPendingAmount(null);
  };


  return (
    <div className="max-w-4xl mx-auto py-8 md:px-4 px-2 lg:px-0">
      <div className="flex items-center gap-2 mb-2">
        <CreditCard className="w-6 h-6 text-primary" />
        <h1 className="text-[17px] font-bold">Cardless Withdrawal</h1>
      </div>
      <p className="text-muted-foreground mb-4 md:text-sm text-[12px]">Generate a secure paycode for ATM/POS withdrawal without your card.</p>
      <div className="mb-4 flex items-center justify-between rounded-[10px] border border-[#093A5B] bg-primary/5 px-4 py-3 md:py-6">
        <span className="text-[14px] text-muted-foreground">Main Balance</span>
        <span className="font-bold text-[19px] text-primary">₦{balance.toLocaleString()}</span>
      </div>
      <div className="space-y-4">
        <Input
          type="number"
          min={1}
          step={100}
          placeholder="Enter amount (₦)"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className="md:text-[17px] text-[15px] font-[450] px-5 py-7 rounded-[10px] border-[#093A5B]  h-14 text-foreground focus:ring-1 focus:ring-[#093A5B] focus:ring-offset-0 focus-visible:ring-1 focus-visible:ring-[#093A5B] focus-visible:ring-offset-0"
        />
        <Button onClick={handleGeneratePaycode} disabled={loading || cooldown > 0 || showPinStep || showConfirm} className="w-full h-14 md:text-base text-[13px] font-[500] rounded-[10px]">
          {loading ? (<><Loader2 className="animate-spin mr-2" />Generating...</>) : (cooldown > 0 ? `Wait ${cooldown}s` : 'Generate Paycode')}
        </Button>
        <div className="mt-6">
          <div className="border-2 border-dashed border-primary/40 rounded-[10px] bg-background/80 p-6 min-h-[120px] flex flex-col items-center justify-center">
            {paycode && showPaycode ? (
              <>
                <div className="flex items-center justify-between w-full mb-2">
                  <div className="text-[15px] font-semibold">Your Paycode</div>
                  <span className={`text-xs px-2 py-1 rounded-full ml-2 ${paycodeStatus === 'active' ? 'bg-primary/10 text-primary' : paycodeStatus === 'expired' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'}`}>{paycodeStatus === 'active' ? 'Active' : paycodeStatus === 'expired' ? 'Expired' : 'Used'}</span>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <span className={`text-[23px] font-poppins font-[450] select-all ${!showPaycode ? 'blur-sm' : ''}`}>{showPaycode ? paycode : '••••••'}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-1"
                    onClick={() => {
                      if (showPaycode) {
                        navigator.clipboard.writeText(paycode);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1200);
                      }
                    }}
                    title="Copy paycode"
                  >
                    <Copy className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-1"
                    onClick={() => setShowPaycode((v) => !v)}
                    title={showPaycode ? 'Hide paycode' : 'Show paycode'}
                  >
                    {showPaycode ? <span className="text-xs">Hide</span> : <span className="text-xs">Show</span>}
                  </Button>
                </div>
                {copied && <div className="text-[14px] text-success font-medium mt-1">Copied!</div>}
                <div className="text-[14px] text-muted-foreground mt-2">Use this code at any supported ATM or POS for cardless withdrawal.</div>
                <div className="text-xs text-muted-foreground mt-2">Expires in: {paycodeCountdown > 0 ? `${Math.floor(paycodeCountdown/60)}m ${paycodeCountdown%60}s` : 'Expired'}</div>
                <div className="flex gap-2 mt-3">
                  {paycodeStatus === 'active' && (
                    <Button variant="outline" size="sm" onClick={handleCancelPaycode}>Cancel Paycode</Button>
                  )}
                  {transactionId && (
                    <TransactionSuccessAction
                      transactionId={transactionId}
                      className="inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium bg-primary text-primary-foreground"
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="text-muted-foreground text-sm">Your generated paycode will appear here.</div>
            )}
          </div>
        </div>
      </div>

      {/* PIN entry modal/step */}
      {showPinStep && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-[10px] p-6 shadow-xl w-full max-w-xs mx-auto flex flex-col items-center">
            <PinInput label="Enter your PIN to generate paycode" onComplete={handlePinConfirm} />
            <Button className="mt-4 w-full" variant="outline" onClick={() => { setShowPinStep(false); setPendingAmount(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Confirmation dialog for large amounts */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-[10px] p-6 shadow-xl w-full max-w-xs mx-auto flex flex-col items-center">
            <div className="font-semibold text-lg mb-2">Confirm Paycode Generation</div>
            <div className="text-sm mb-4">You are about to generate a paycode for <span className="font-bold">₦{pendingAmount?.toLocaleString()}</span>. Proceed?</div>
            <div className="flex gap-2 w-full">
              <Button className="flex-1" onClick={handleConfirmProceed}>Proceed</Button>
              <Button className="flex-1" variant="outline" onClick={handleConfirmCancel}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Paycode history section */}
      {paycodeHistory.length > 0 && (
        <div className="mt-10 md:mt-12">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-[405] text-[14px]">Recent Paycodes</h2>
            <button
              className="text-[13px] text-[#093A5B] underline hover:text-destructive/80 transition-colors"
              onClick={() => {
                setPaycodeHistory([]);
              }}
              title="Clear all paycode history"
            >
              Clear History
            </button>
          </div>
          <div className="space-y-3">
            {paycodeHistory.map((item, idx) => (
              <div key={item.code + idx} className="rounded-[10px] border border-[#093A5B] shadow-sm flex items-center justify-between md:py-4 px-4 py-3">
                <div>
                  <div className="font-poppins font-[450] text-[15px]">{item.code}</div>
                  <div className="md:text-[14px] text-[12px] font-[500] text-[#093A5B] ">₦{item.amount.toLocaleString()} &middot; {new Date(item.createdAt).toLocaleString()}</div>
                </div>
                <span className={`text-xs border px-4 py-1 rounded-[10px] ${
                  item.status === 'active'
                    ? 'border-[#093A5B] text-primary'
                    : item.status === 'cancelled'
                      ? 'border-destructive text-destructive'
                      : 'border-muted-foreground/40 text-muted-foreground'
                }`}>
                  {item.status === 'active' ? 'Active' : item.status === 'cancelled' ? 'Cancelled' : 'Expired'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CardlessPage;
