import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';
import StatusBadge from '@/components/ui/StatusBadge';
import { ArrowLeft, Check, Lock, ShieldAlert, Unlock, X } from 'lucide-react';
import TransactionSuccessAction from '@/components/ui/TransactionSuccessAction';
import { createBackendEscrow, fetchBackendAccountState, fetchBackendEscrows, updateBackendEscrow } from '@/lib/backendApi';

const EscrowPage = () => {
  const navigate = useNavigate();
  const { currentUser, users, escrows, balance, setBalance, hydrateBackendState, addNotification } = useStore();

  const [view, setView] = useState<'list' | 'create' | 'pin' | 'release-pin' | 'success'>('list');
  const [sellerWalletId, setSellerWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [error, setError] = useState('');
  const [selectedEscrowId, setSelectedEscrowId] = useState('');
  const [transactionId, setTransactionId] = useState('');

  const normalizedSellerWalletId = sellerWalletId.trim().toLowerCase();
  const matchedSeller = users.find(
    (user) => user.escrowWalletId?.trim().toLowerCase() === normalizedSellerWalletId,
  );
  const recipientFullName = matchedSeller ? `${matchedSeller.firstName} ${matchedSeller.lastName}` : '';

  useEffect(() => {
    const loadEscrows = async () => {
      if (!currentUser) return;

      try {
        const [backendEscrows, accountState] = await Promise.all([
          fetchBackendEscrows(),
          fetchBackendAccountState(),
        ]);
        hydrateBackendState({ escrows: backendEscrows });
        setBalance(accountState.balance);
      } catch {
        // Keep existing local UI state if backend refresh fails.
      }
    };

    void loadEscrows();
  }, [currentUser, hydrateBackendState, setBalance]);

  const refreshEscrowState = async () => {
    const [backendEscrows, accountState] = await Promise.all([
      fetchBackendEscrows(),
      fetchBackendAccountState(),
    ]);
    hydrateBackendState({ escrows: backendEscrows });
    setBalance(accountState.balance);
  };

  if (!currentUser?.escrowActivated) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2">Escrow Not Activated</h2>
          <p className="text-muted-foreground mb-6">Please activate escrow from the Services page</p>
          <button onClick={() => navigate('/services')} className="py-3 px-8 rounded-[10px] gradient-primary text-primary-foreground font-[500]">
            Go to Services
          </button>
        </div>
      </div>
    );
  }

  const handleCreate = () => {
    if (!sellerWalletId || !amount || !deadline) { setError('Fill all fields'); return; }
    if (Number(amount) > balance) { setError('Insufficient balance'); return; }
    setError('');
    setView('pin');
  };

  const handlePinConfirm = async (pin: string) => {
    if (pin !== currentUser?.pin) { setError('Incorrect PIN'); return; }
    const amt = Number(amount);

    try {
      const created = await createBackendEscrow({
        sellerWalletId: sellerWalletId.trim(),
        amount: amt,
        description,
        deliveryDeadline: deadline,
      });

      setBalance(created.balance);
      await refreshEscrowState();
      setTransactionId(created.escrow.id);
      setView('success');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to lock escrow right now. Please try again.');
    }
  };

  const handleSellerAccept = async (escrowId: string) => {
    try {
      await updateBackendEscrow(escrowId, 'accept');
      await refreshEscrowState();
      addNotification('Escrow accepted by seller. Delivery is now in progress.');
    } catch {
      setError('Unable to accept escrow right now. Please try again.');
    }
  };

  const handleSellerDecline = async (escrowId: string) => {
    try {
      await updateBackendEscrow(escrowId, 'decline');
      await refreshEscrowState();
      addNotification('Escrow was declined by seller. Buyer has been refunded.');
    } catch {
      setError('Unable to decline escrow right now. Please try again.');
    }
  };

  const handleRelease = (escrowId: string) => {
    setSelectedEscrowId(escrowId);
    setView('release-pin');
  };

  const handleReleasePin = async (pin: string) => {
    if (pin !== currentUser?.pin) { setError('Incorrect PIN'); return; }
    const selectedEscrow = escrows.find((entry) => entry.id === selectedEscrowId);
    if (!selectedEscrow) {
      setError('Escrow not found');
      return;
    }
    if (selectedEscrow.buyerWalletId !== currentUser?.escrowWalletId) {
      setError('Only buyer can release this escrow');
      return;
    }

    try {
      await updateBackendEscrow(selectedEscrowId, 'release');
      await refreshEscrowState();
      addNotification('Escrow released to seller.');
      setView('list');
    } catch {
      setError('Unable to release escrow right now. Please try again.');
    }
  };

  const handleCancel = async (escrowId: string) => {
    try {
      await updateBackendEscrow(escrowId, 'cancel');
      await refreshEscrowState();
      addNotification('Escrow cancelled and refunded.');
    } catch {
      setError('Unable to cancel escrow right now. Please try again.');
    }
  };

  const handleRaiseDispute = async (escrowId: string) => {
    try {
      await updateBackendEscrow(escrowId, 'dispute');
      await refreshEscrowState();
      const escrow = escrows.find((entry) => entry.id === escrowId);
      if (escrow) {
        addNotification(`Dispute opened for escrow ${escrow.id.slice(0, 6).toUpperCase()}.`);
      }
    } catch {
      setError('Unable to open dispute right now. Please try again.');
    }
  };

  const handleMediatorDecision = async (escrowId: string, decision: 'release' | 'refund') => {
    try {
      await updateBackendEscrow(escrowId, decision === 'release' ? 'resolve-release' : 'resolve-refund');
      await refreshEscrowState();
      addNotification(decision === 'release'
        ? 'Mediator resolved dispute: payment released to seller.'
        : 'Mediator resolved dispute: refunded buyer.');
    } catch {
      setError('Unable to apply mediator decision right now. Please try again.');
    }
  };

  if (view === 'success') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-scale-in">
        <div className="w-20 h-20 rounded-full bg-[#0E5485] flex items-center justify-center mb-6 animate-pulse-success">
          <Check className="w-10 h-10 text-success-foreground" />
        </div>
        <h2 className="text-[17px] font-bold text-foreground mb-2">Escrow Created!</h2>
        <p className="text-muted-foreground">₦{Number(amount).toLocaleString()} locked in escrow</p>
        <TransactionSuccessAction
          transactionId={transactionId}
          className="mt-8 py-3 px-8 rounded-[10px] gradient-primary text-primary-foreground font-semibold"
          receiptLabel="Done"
        />
      </div>
    );
  }

  if (view === 'pin') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in">
        <h2 className="text-xl font-bold text-foreground mb-8">Enter PIN to Lock Escrow</h2>
        <PinInput label="Enter your PIN" onComplete={handlePinConfirm} />
        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  if (view === 'release-pin') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center animate-fade-in">
        <h2 className="text-xl font-bold text-foreground mb-8">Enter PIN to Release Payment</h2>
        <PinInput label="Enter your PIN" onComplete={handleReleasePin} />
        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="py-4 animate-fade-in">
        <button onClick={() => setView('list')} className="w-10 h-10 rounded-full flex items-center justify-center mb-6">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="border border-[#0C436A] rounded-[10px] p-4">
          <h1 className="text-[17px] font-bold text-foreground mb-6">Create Escrow</h1>
          <p className="text-sm text-muted-foreground mb-4">Your Escrow Wallet: <span className="font-semibold text-foreground">{currentUser?.escrowWalletId}</span></p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Seller Wallet ID</label>
              <input type="text" value={sellerWalletId} onChange={(e) => setSellerWalletId(e.target.value)}
                placeholder="Enter seller's escrow wallet ID" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Recipient</label>
              <input
                type="text"
                value={recipientFullName}
                placeholder="Will be verified on submit"
                readOnly
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Amount (NGN)</label>
              <input type="text" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter amount" inputMode="numeric" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Description</label>
              <input type="text" value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this escrow for?" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Delivery Deadline</label>
              <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]" />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button onClick={handleCreate} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold text-[15px] md:text-[17px] mt-4">
              Lock Amount in Escrow
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground mb-2">Escrow</h1>
      <p className="text-sm text-muted-foreground mb-1">Wallet: {currentUser?.escrowWalletId}</p>
      <p className="text-xs text-muted-foreground mb-6">Buyer can release early. Otherwise, release happens automatically at delivery deadline.</p>

      <button onClick={() => setView('create')} className="w-full md:py-4 py-2.5 md:rounded-[10px] rounded-[10px] gradient-primary text-primary-foreground font-semibold md:text-[17px] text-[15px] mb-6">
        + Create Escrow
      </button>

      <div className="space-y-3">
        {escrows.length > 0 ? escrows.map(e => (
          <div key={e.id} className="bg-card rounded-[10px] p-4 space-y-3">
            {(() => {
              const createdAtMs = new Date(e.createdAt).getTime();
              const isWithinCancelWindow = Number.isFinite(createdAtMs) && (Date.now() - createdAtMs) <= (4 * 60 * 60 * 1000);

              return (
                <>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-foreground">₦{e.amount.toLocaleString()}</p>
              <StatusBadge status={e.status === 'released' ? 'paid' : e.status === 'pending_delivery' ? 'unpaid' : e.status === 'disputed' ? 'disputed' : e.status === 'cancelled' ? 'cancelled' : 'pending'} />
            </div>
            <p className="text-sm text-muted-foreground">{e.description}</p>
            <p className="text-xs text-muted-foreground">Seller: {e.sellerWalletId}</p>
            <p className="text-xs text-muted-foreground">Deadline: {e.deliveryDeadline}</p>
            {e.penalty > 0 && (
              <p className="text-xs text-destructive">Late penalty: ₦{e.penalty.toLocaleString()}</p>
            )}
            {e.status === 'pending_acceptance' && currentUser?.escrowWalletId === e.sellerWalletId && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => { void handleSellerAccept(e.id); }} className="flex-1 py-2 rounded-xl bg-success text-success-foreground font-semibold text-sm">
                  Accept Escrow
                </button>
                <button onClick={() => { void handleSellerDecline(e.id); }} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm">
                  Decline
                </button>
              </div>
            )}
            {e.status === 'pending_delivery' && currentUser?.escrowWalletId === e.buyerWalletId && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => handleRelease(e.id)} className="flex-1 py-2 rounded-xl bg-success text-success-foreground font-semibold text-sm flex items-center justify-center gap-1">
                  <Unlock className="w-4 h-4" /> Release
                </button>
                {isWithinCancelWindow && (
                  <button onClick={() => { void handleCancel(e.id); }} className="flex-1 py-2 rounded-xl bg-destructive text-destructive-foreground font-semibold text-sm flex items-center justify-center gap-1">
                    <X className="w-4 h-4" /> Cancel
                  </button>
                )}
              </div>
            )}
            {e.status === 'pending_delivery' && currentUser?.escrowWalletId === e.buyerWalletId && !isWithinCancelWindow && (
              <p className="text-xs text-muted-foreground">Cancellation window has expired. Buyer can only cancel within 4 hours of escrow creation.</p>
            )}
            {e.status === 'pending_delivery' && (
              <button
                onClick={() => { void handleRaiseDispute(e.id); }}
                className="w-full py-2 rounded-xl border border-destructive text-destructive font-semibold text-sm flex items-center justify-center gap-1"
              >
                <ShieldAlert className="w-4 h-4" /> Raise Dispute
              </button>
            )}
            {e.status === 'disputed' && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">Mediator/Admin Decision (optional)</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { void handleMediatorDecision(e.id, 'release'); }}
                    className="flex-1 py-2 rounded-[10px] bg-success text-success-foreground font-semibold text-sm"
                  >
                    Release to Seller
                  </button>
                  <button
                    onClick={() => { void handleMediatorDecision(e.id, 'refund'); }}
                    className="flex-1 py-2 rounded-[10px] bg-destructive text-destructive-foreground font-semibold text-sm"
                  >
                    Refund Buyer
                  </button>
                </div>
              </div>
            )}
                </>
              );
            })()}
          </div>
        )) : (
          <p className="text-center py-8 text-muted-foreground">No escrow transactions yet</p>
        )}
      </div>
    </div>
  );
};

export default EscrowPage;
