import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';
import { Check } from 'lucide-react';
import {
  createCommittedBackendTransaction,
  createIdempotencyKey,
  fetchInterswitchQuickstartConfig,
  fetchUserByAccount,
  verifyInterswitchTransaction,
} from '@/lib/backendApi';
import TransactionSuccessAction from '@/components/ui/TransactionSuccessAction';

declare global {
  interface Window {
    webpayCheckout?: (payload: Record<string, unknown>) => void;
  }
}

type SendState = {
  receiverAccount?: string;
  receiverName?: string;
};

type QuickstartConfig = {
  merchantCode: string;
  payItemId: string;
  mode: 'TEST' | 'LIVE';
  inlineCheckoutScriptUrl: string;
};

const SendMoneyPage = () => {
  const location = useLocation();
  const { currentUser, balance, setBalance, addTransaction, findUserByAccount } = useStore();

  const [step, setStep] = useState<'form' | 'pin' | 'interswitch' | 'success'>('form');
  const [receiverAccount, setReceiverAccount] = useState('');
  const [receiverName, setReceiverName] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);
  const [interswitchReference, setInterswitchReference] = useState('');
  const [interswitchConfig, setInterswitchConfig] = useState<QuickstartConfig | null>(null);
  const [interswitchScriptReady, setInterswitchScriptReady] = useState(false);
  const [loadingInterswitchConfig, setLoadingInterswitchConfig] = useState(true);
  const autoOpenedInlineCheckoutRef = useRef(false);

  useEffect(() => {
    let active = true;

    const loadConfig = async () => {
      try {
        const config = await fetchInterswitchQuickstartConfig();
        if (!active) return;
        setInterswitchConfig(config);
      } catch {
        if (!active) return;
        setError('Unable to load Interswitch configuration right now.');
      } finally {
        if (active) setLoadingInterswitchConfig(false);
      }
    };

    void loadConfig();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!interswitchConfig?.inlineCheckoutScriptUrl) return;

    const existing = document.querySelector(`script[src="${interswitchConfig.inlineCheckoutScriptUrl}"]`) as HTMLScriptElement | null;
    if (existing) {
      setInterswitchScriptReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = interswitchConfig.inlineCheckoutScriptUrl;
    script.async = true;
    script.onload = () => setInterswitchScriptReady(true);
    script.onerror = () => {
      setInterswitchScriptReady(false);
      setError('Unable to load Interswitch checkout script.');
    };

    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [interswitchConfig?.inlineCheckoutScriptUrl]);

  const handleAccountLookup = useCallback(async (account: string) => {
    setReceiverAccount(account);
    if (account.length === 10) {
      try {
        const remote = await fetchUserByAccount(account);
        setReceiverName(`${remote.firstName} ${remote.lastName}`);
      } catch {
        const cached = findUserByAccount(account);
        if (cached) {
          setReceiverName(`${cached.firstName} ${cached.lastName}`);
        } else {
          setReceiverName('');
        }
      }
    } else {
      setReceiverName('');
    }
  }, [findUserByAccount]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const accountFromQuery = (params.get('account') || params.get('accountNumber') || '').trim();
    const state = (location.state as SendState | null) || null;
    const stateAccount = state?.receiverAccount || '';
    const rawAccount = accountFromQuery || stateAccount;
    if (!rawAccount) return;

    const account = rawAccount.replace(/\D/g, '').slice(0, 10);
    if (!/^\d{10}$/.test(account)) return;

    void handleAccountLookup(account);
  }, [handleAccountLookup, location.search, location.state]);

  const handleSend = () => {
    if (!receiverAccount || !amount) {
      setError('Please fill all required fields');
      return;
    }
    if (receiverAccount.length !== 10) {
      setError('Enter a valid 10-digit receiver account number');
      return;
    }
    if (!receiverName) {
      setError('Receiver account not found');
      return;
    }
    if (Number(amount) > balance) {
      setError('Insufficient balance');
      return;
    }
    if (receiverAccount === currentUser?.accountNumber) {
      setError('Cannot send to yourself');
      return;
    }
    setError('');
    setStep('pin');
  };

  const handlePinConfirm = async (pin: string) => {
    if (pin !== currentUser?.pin) {
      setError('Incorrect PIN');
      return;
    }

    try {
      setError('');
      setIsSubmitting(true);
      autoOpenedInlineCheckoutRef.current = false;
      setInterswitchReference(`SEND-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

      setStep('interswitch');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to process transfer right now. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenInlineInterswitchPayment = () => {
    if (!interswitchConfig) {
      setError('Interswitch configuration not loaded yet.');
      return;
    }
    if (!interswitchScriptReady || !window.webpayCheckout) {
      setError('Interswitch checkout is still loading. Please try again.');
      return;
    }

    const amountKobo = Math.round(Number(amount) * 100);
    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      setError('Enter a valid transfer amount.');
      return;
    }

    setError('');

    window.webpayCheckout({
      merchant_code: interswitchConfig.merchantCode,
      pay_item_id: interswitchConfig.payItemId,
      txn_ref: interswitchReference,
      amount: amountKobo,
      currency: 566,
      cust_email: currentUser?.email || 'customer@example.com',
      site_redirect_url: `${window.location.origin}/transact/send`,
      mode: interswitchConfig.mode,
      onComplete: () => {
        void handleCompleteInterswitchPayment();
      },
    });
  };

  useEffect(() => {
    if (step !== 'interswitch') return;
    if (!interswitchReference) return;
    if (!interswitchConfig || !interswitchScriptReady) return;
    if (autoOpenedInlineCheckoutRef.current) return;

    autoOpenedInlineCheckoutRef.current = true;
    handleOpenInlineInterswitchPayment();
  }, [step, interswitchReference, interswitchConfig, interswitchScriptReady]);

  const handleCompleteInterswitchPayment = async () => {
    if (!interswitchReference) {
      setError('Missing Interswitch reference. Please try again.');
      return;
    }

    try {
      setError('');
      setIsVerifyingPayment(true);
      const amt = Number(amount);
      const amountKobo = String(Math.round(amt * 100));

      await verifyInterswitchTransaction(interswitchReference, amountKobo);

      const committed = await createCommittedBackendTransaction({
        idempotencyKey: createIdempotencyKey('send'),
        type: 'send',
        amount: amt,
        senderAccount: currentUser?.accountNumber || '',
        receiverAccount,
        senderName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        receiverName: receiverName || receiverAccount,
        description,
        status: 'success',
      }, balance, balance - amt);

      setBalance(committed.balance);
      addTransaction(committed.transaction);
      setTransactionId(committed.transaction.id);
      setStep('success');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to verify Interswitch payment. Please try again.');
    } finally {
      setIsVerifyingPayment(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-[#0E5485] flex items-center justify-center mb-6 animate-pulse-success">
          <Check className="w-6 h-6 text-success-foreground" />
        </div>
        <h2 className="text-[17px] font-bold text-foreground mb-2">Payment Successful!</h2>
        <p className="text-muted-foreground mb-2">₦{Number(amount).toLocaleString()} sent to</p>
        <p className="font-semibold text-foreground mb-8">{receiverName || receiverAccount}</p>
        <TransactionSuccessAction
          transactionId={transactionId}
          className="py-2 px-8 rounded-[10px] gradient-primary text-primary-foreground font-[500]"
          receiptLabel="Done"
        />
      </div>
    );
  }

  if (step === 'pin') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in">
        <h2 className="text-xl font-bold text-foreground mb-2">Confirm Payment</h2>
        <p className="text-muted-foreground mb-2">Sending ₦{Number(amount).toLocaleString()} to</p>
        <p className="font-semibold text-foreground mb-8">{receiverName || receiverAccount}</p>
        <PinInput label="Enter your PIN" onComplete={handlePinConfirm} />
        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  if (step === 'interswitch') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">Complete Payment on Interswitch</h2>
        <p className="text-muted-foreground mb-2">Transfer amount: ₦{Number(amount).toLocaleString()}</p>
        <p className="text-muted-foreground mb-6">Receiver: {receiverName || receiverAccount}</p>
        {interswitchReference && (
          <p className="text-sm text-foreground mb-4">Reference: {interswitchReference}</p>
        )}

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
            onClick={handleOpenInlineInterswitchPayment}
            disabled={loadingInterswitchConfig || !interswitchScriptReady}
            className="w-full py-3 rounded-[10px] gradient-primary text-primary-foreground font-semibold disabled:opacity-60"
          >
            {loadingInterswitchConfig ? 'Loading Interswitch...' : 'Open Interswitch Payment Here'}
          </button>
          <button
            onClick={() => void handleCompleteInterswitchPayment()}
            disabled={isVerifyingPayment}
            className="w-full py-3 rounded-[10px] border border-border text-foreground font-semibold disabled:opacity-60"
          >
            {isVerifyingPayment ? 'Verifying Payment...' : 'I Have Completed Payment'}
          </button>
        </div>

        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground mb-6">Send Money</h1>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Receiver Account Number</label>
          <input type="text" value={receiverAccount} onChange={(e) => void handleAccountLookup(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="Enter 10-digit account number" inputMode="numeric"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Receiver Full Name</label>
          <input
            type="text"
            value={receiverName}
            readOnly
            placeholder="Receiver name will appear automatically"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none"
          />
          {receiverAccount.length === 10 && !receiverName && (
            <p className="text-destructive text-sm mt-2 font-medium">Receiver account not found</p>
          )}
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Amount (NGN)</label>
          <input type="text" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter amount" inputMode="numeric"
            className="w-full p-4 rounded-[10px] border bg-[#F2F5F7] border-border text-foreground outline-none focus:border-primary" />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Description (Optional)</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this for?"
            className="w-full p-4 rounded-[10px] border bg-[#F2F5F7] border-border text-foreground outline-none focus:border-primary" />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <button onClick={handleSend} disabled={isSubmitting} className="w-full md:py-4 py-3 rounded-[10px] gradient-primary text-primary-foreground font-semibold text-[15px] mt-4 disabled:opacity-60">
          {isSubmitting ? 'Processing...' : 'Send'}
        </button>
      </div>
    </div>
  );
};

export default SendMoneyPage;
