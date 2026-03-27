import { useMemo, useState } from 'react';
import { Lock, Wallet } from 'lucide-react';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';

const formatDateInput = (isoDate: string) => {
  const date = new Date(isoDate);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const LockedFundsPage = () => {
  const {
    currentUser,
    balance,
    createLockedFund,
    addToLockedFund,
  } = useStore();

  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [unlockDate, setUnlockDate] = useState('');
  const [error, setError] = useState('');
  const [showPinStep, setShowPinStep] = useState(false);
  const [pendingLock, setPendingLock] = useState<{ name: string; amount: number; unlockDate: string } | null>(null);
  const [topUpInputs, setTopUpInputs] = useState<Record<string, string>>({});

  const now = new Date();

  // Use currentUser.lockedFunds, fallback to [] if undefined
  const lockedFunds = useMemo(() => currentUser?.lockedFunds ?? [], [currentUser?.lockedFunds]);

  const activeLockedTotal = useMemo(
    () => lockedFunds.filter((entry) => entry.status === 'locked').reduce((sum, entry) => sum + entry.amount, 0),
    [lockedFunds],
  );

  const sortedFunds = useMemo(
    () => [...lockedFunds].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [lockedFunds],
  );

  const handleCreate = () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (!unlockDate) {
      setError('Select an unlock date');
      return;
    }

    setPendingLock({
      name,
      amount: numericAmount,
      unlockDate,
    });
    setShowPinStep(true);
    setError('');
  };

  const handlePinConfirm = async (pin: string) => {
    if (!pendingLock) return;

    const result = await createLockedFund({
      ...pendingLock,
      pin,
    });

    if (!result.success) {
      setError(result.message);
      return;
    }

    setName('');
    setAmount('');
    setUnlockDate('');
    setPendingLock(null);
    setShowPinStep(false);
    setError('');
  };

  const handleTopUp = async (fundId: string) => {
    const numericAmount = Number(topUpInputs[fundId] || '0');
    const result = await addToLockedFund(fundId, numericAmount);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setTopUpInputs((prev) => ({ ...prev, [fundId]: '' }));
    setError('');
  };

  return (
    <div className="py-4 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[17px] font-bold text-foreground">Piggy</h1>
        <p className="text-sm text-muted-foreground">Save from your main balance, set an unlock date, and move it back when due.</p>
        <p className="text-xs text-muted-foreground mt-1">{currentUser?.piggyActivated ? 'Piggy is active' : 'Activate Piggy in Services to continue'}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[#0C436A] p-4">
          <p className="text-xs text-muted-foreground mb-1">Main Balance</p>
          <p className="text-xl font-bold text-foreground">₦{balance.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-[#0C436A] p-4">
          <p className="text-xs text-muted-foreground mb-1">Piggy Total</p>
          <p className="text-xl font-bold text-foreground">₦{activeLockedTotal.toLocaleString()}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#0C436A] p-4 space-y-3">
        <h2 className="font-semibold text-foreground">Create Piggy Plan</h2>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Plan Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. School Fees"
            className="w-full p-4 rounded-2xl bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Amount</label>
            <input
              type="text"
              value={amount}
              onChange={(event) => setAmount(event.target.value.replace(/\D/g, ''))}
              placeholder="Enter amount"
              inputMode="numeric"
              className="w-full p-4 rounded-2xl bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Unlock Date</label>
            <input
              type="date"
              value={unlockDate}
              min={formatDateInput(new Date().toISOString())}
              onChange={(event) => setUnlockDate(event.target.value)}
              className="w-full p-4 rounded-2xl bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
            />
          </div>
        </div>

        {error && <p className="text-destructive text-sm font-medium">{error}</p>}

        {showPinStep ? (
          <div className="rounded-2xl border border-[#0C436A] bg-[#F2F5F7] p-4">
            <PinInput label="Enter your PIN to lock this fund" onComplete={handlePinConfirm} />
            <button
              type="button"
              onClick={() => {
                setShowPinStep(false);
                setPendingLock(null);
              }}
              className="w-full mt-4 py-3 rounded-xl border border-[#0C436A] text-foreground font-semibold"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleCreate}
            className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-semibold inline-flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4" />
            Add to Piggy
          </button>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">My Piggy Plans</h2>

        {sortedFunds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#0C436A] p-8 text-center">
            <Wallet className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold text-foreground">No Piggy plan yet</p>
            <p className="text-sm text-muted-foreground">Your Piggy savings plans will appear here.</p>
          </div>
        ) : (
          sortedFunds.map((fund) => {
            const unlockAt = new Date(fund.unlockDate);
            const isUnlocked = now.getTime() >= unlockAt.getTime();
            const canTopUp = fund.status === 'locked' && !isUnlocked;

            return (
              <div key={fund.id} className="rounded-2xl border border-[#0C436A] bg-[#F2F5F7] p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-foreground">{fund.name}</p>
                    <p className="text-sm text-muted-foreground">Unlock: {unlockAt.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${fund.status === 'released' ? 'bg-success/15 text-success' : isUnlocked ? 'bg-amber-100 text-amber-800' : 'bg-primary/10 text-primary'}`}>
                    {fund.status === 'released' ? 'Released' : isUnlocked ? 'Auto Releasing' : 'Locked'}
                  </span>
                </div>

                <p className="text-xl font-bold text-foreground">₦{fund.amount.toLocaleString()}</p>

                {canTopUp && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={topUpInputs[fund.id] || ''}
                      onChange={(event) => setTopUpInputs((prev) => ({ ...prev, [fund.id]: event.target.value.replace(/\D/g, '') }))}
                      placeholder="Add amount"
                      inputMode="numeric"
                      className="flex-1 p-3 rounded-xl bg-card border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
                    />
                    <button
                      type="button"
                      onClick={() => { void handleTopUp(fund.id); }}
                      className="px-4 rounded-xl border border-[#0C436A] text-foreground font-semibold"
                    >
                      Add
                    </button>
                  </div>
                )}

                {fund.status === 'released' && (
                  <p className="text-sm text-success font-medium">Moved on {new Date(fund.releasedAt || fund.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default LockedFundsPage;
