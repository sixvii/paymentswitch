import { useState } from 'react';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';
import { Check, Wifi, Zap, Phone, Tv } from 'lucide-react';
import elecIcon from '@/assets/icons/elec.png';
import { createCommittedBackendTransaction, createIdempotencyKey } from '@/lib/backendApi';
import TransactionSuccessAction from '@/components/ui/TransactionSuccessAction';

interface BillPageProps {
  category: 'airtime' | 'data' | 'bills' | 'insurance';
  title: string;
}

const providers: Record<string, string[]> = {
  airtime: ['MTN', 'Airtel', 'Glo', '9mobile'],
  data: ['MTN', 'Airtel', 'Glo', '9mobile'],
  bills: ['EKEDC', 'IKEDC', 'AEDC', 'PHEDC', 'DSTV', 'GOtv', 'StarTimes'],
  insurance: ['AXA Mansard', 'Leadway', 'AIICO'],
};

const billTypeConfig = {
  electricity: {
    label: 'Electricity',
    icon: Zap,
    providers: ['EKEDC', 'IKEDC', 'AEDC', 'PHEDC'],
    accountLabel: 'Meter Number',
  },
  internet: {
    label: 'Internet',
    icon: Wifi,
    providers: ['Smile', 'Spectranet', 'FiberOne', 'Starlink'],
    accountLabel: 'Customer ID',
  },
  airtime: {
    label: 'Airtime',
    icon: Phone,
    providers: ['MTN', 'Airtel', 'Glo', '9mobile'],
    accountLabel: 'Phone Number',
  },
  tv: {
    label: 'TV',
    icon: Tv,
    providers: ['DSTV', 'GOtv', 'StarTimes'],
    accountLabel: 'Smart Card Number',
  },
} as const;

type BillType = keyof typeof billTypeConfig;

const BillPaymentPage = ({ category, title }: BillPageProps) => {
  const { currentUser, balance, setBalance, addTransaction, addBillPayment } = useStore();

  const [step, setStep] = useState<'form' | 'pin' | 'success'>('form');
  const [provider, setProvider] = useState('');
  const [accountNum, setAccountNum] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [selectedBillType, setSelectedBillType] = useState<BillType | null>(null);
  const [transactionId, setTransactionId] = useState('');

  const isBillsCategory = category === 'bills';
  const selectedBillConfig = selectedBillType ? billTypeConfig[selectedBillType] : null;
  const providerOptions = isBillsCategory
    ? (selectedBillConfig?.providers ?? [])
    : (providers[category] || []);

  const handleSubmit = () => {
    if (!provider || !amount) { setError('Fill all fields'); return; }
    if (Number(amount) > balance) { setError('Insufficient balance'); return; }
    setStep('pin');
  };

  const handlePin = async (pin: string) => {
    if (pin !== currentUser?.pin) { setError('Incorrect PIN'); return; }
    const amt = Number(amount);
    try {
      const txType = category === 'airtime' ? 'airtime' : category === 'data' ? 'data' : 'bills';
      const committed = await createCommittedBackendTransaction({
        idempotencyKey: createIdempotencyKey('bill'),
        type: txType,
        amount: amt,
        senderAccount: currentUser?.accountNumber || '',
        receiverAccount: provider,
        senderName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        receiverName: provider,
        description: `${title} - ${provider}`,
        status: 'success',
      }, balance, balance - amt);

      setBalance(committed.balance);
      addTransaction(committed.transaction);
      setTransactionId(committed.transaction.id);
      addBillPayment({
        id: committed.transaction.id,
        category,
        provider,
        accountNumber: accountNum,
        amount: amt,
        status: 'success',
        timestamp: committed.transaction.timestamp,
      });
      setStep('success');
    } catch {
      setError('Unable to process payment right now. Please try again.');
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-[#0E5485] flex items-center justify-center mb-6 animate-pulse-success">
          <Check className="w-10 h-10 text-success-foreground" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h2>
        <p className="text-muted-foreground">₦{Number(amount).toLocaleString()} paid to {provider}</p>
        <TransactionSuccessAction
          transactionId={transactionId}
          className="mt-8 py-3 px-8 rounded-[10px] gradient-primary text-primary-foreground font-[500]"
          receiptLabel="Done"
        />
      </div>
    );
  }

  if (step === 'pin') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in">
        <h2 className="text-xl font-bold text-foreground mb-2">Confirm Payment</h2>
        <p className="text-muted-foreground mb-8">₦{Number(amount).toLocaleString()} to {provider}</p>
        <PinInput label="Enter your PIN" onComplete={handlePin} />
        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  if (isBillsCategory && !selectedBillType) {
    return (
      <div className="py-4 md:px-12 px-4 animate-fade-in">
        <h1 className="text-[17px] font-bold text-foreground mb-6">{title}</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {(Object.entries(billTypeConfig) as [BillType, (typeof billTypeConfig)[BillType]][]).map(([key, config]) => {
            const Icon = config.icon;

            return (
              <button
                key={key}
                onClick={() => {
                  setSelectedBillType(key);
                  setProvider('');
                  setAccountNum('');
                  setAmount('');
                  setError('');
                }}
                className="rounded-[10px] bg-[#F2F5F7] p-3.5 min-h-[80px] flex flex-col items-center justify-center gap-1.5 border border-[#0A4065] shadow-sm hover:bg-muted/40 transition-colors"
              >
                <div className="w-14 h-14 rounded-2xl bg-[#F2F5F7] flex items-center justify-center">
                  {key === 'electricity' ? (
                    <span
                      className="block w-6 h-6"
                      style={{
                        backgroundColor: '#0A4065',
                        WebkitMaskImage: `url(${elecIcon})`,
                        maskImage: `url(${elecIcon})`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                      }}
                    />
                  ) : (
                    <Icon className="w-6 h-6 text-primary" />
                  )}
                </div>
                <span className="text-[15px] font-semibold text-foreground leading-none">{config.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 md:px-0 px-4 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground mb-6">{title}</h1>
      {selectedBillConfig && (
        <p className="text-sm text-muted-foreground -mt-4 mb-6">{selectedBillConfig.label}</p>
      )}
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Provider</label>
          <select value={provider} onChange={(e) => setProvider(e.target.value)}
            className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary">
            <option value="">Select provider</option>
            {providerOptions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        {(category === 'bills' || category === 'insurance') && (
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {category === 'bills' ? (selectedBillConfig?.accountLabel || 'Account Number') : 'Policy Number'}
            </label>
            <input type="text" value={accountNum} onChange={(e) => setAccountNum(e.target.value)}
              placeholder="Enter number" className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
        )}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Amount (NGN)</label>
          <input type="text" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            placeholder="Enter amount" inputMode="numeric" className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
        </div>
        {error && <p className="text-destructive text-sm">{error}</p>}
        <button onClick={handleSubmit} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold md:text-lg text-[14px] mt-5">
          Pay Now
        </button>
      </div>
    </div>
  );
};

export default BillPaymentPage;
