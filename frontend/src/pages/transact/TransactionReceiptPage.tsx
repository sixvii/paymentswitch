import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { ArrowLeft, CheckCircle2, Share2 } from 'lucide-react';
import { fetchBackendTransactionById } from '@/lib/backendApi';
import type { Transaction } from '@/types';

const getTransactionTypeLabel = (type: string) => {
  if (type === 'send') return 'Transfer';
  if (type === 'receive') return 'Receive';
  if (type === 'airtime') return 'Buy Airtime';
  if (type === 'data') return 'Buy Data';
  if (type === 'bills') return 'Pay Bills';
  if (type === 'insurance') return 'Insurance';
  if (type === 'escrow') return 'Escrow';
  if (type === 'ajo') return 'Ajo';
  if (type === 'cross-border') return 'Cross-Border Transfer';
  return 'Transaction';
};

const getRequestTypeLabel = (type: string) => {
  if (type === 'money') return 'Money Request';
  if (type === 'airtime') return 'Airtime Request';
  if (type === 'data') return 'Data Request';
  return 'Request';
};

const TransactionReceiptPage = () => {
  const navigate = useNavigate();
  const { transactionId } = useParams<{ transactionId: string }>();
  const { transactions, userRequests } = useStore();
  const [backendTransaction, setBackendTransaction] = useState<Transaction | null>(null);
  const [isLoadingTransaction, setIsLoadingTransaction] = useState(false);

  const requestId = transactionId?.startsWith('request-') ? transactionId.replace('request-', '') : null;

  const transaction = useMemo(
    () => transactions.find((tx) => tx.id === transactionId),
    [transactions, transactionId],
  );

  const request = useMemo(
    () => (requestId ? userRequests.find((entry) => entry.id === requestId) : null),
    [requestId, userRequests],
  );

  useEffect(() => {
    let active = true;

    const loadFromBackend = async () => {
      if (!transactionId || requestId || transaction) return;
      setIsLoadingTransaction(true);

      try {
        const result = await fetchBackendTransactionById(transactionId);
        if (!active) return;
        setBackendTransaction(result);
      } catch {
        if (!active) return;
        setBackendTransaction(null);
      } finally {
        if (active) {
          setIsLoadingTransaction(false);
        }
      }
    };

    loadFromBackend();

    return () => {
      active = false;
    };
  }, [requestId, transaction, transactionId]);

  const resolvedTransaction = transaction || backendTransaction;

  if (isLoadingTransaction && !request && !resolvedTransaction) {
    return (
      <div className="py-8 animate-fade-in">
        <p className="text-sm text-muted-foreground text-center">Loading transaction receipt...</p>
      </div>
    );
  }

  if (!resolvedTransaction && !request) {
    return (
      <div className="py-8 animate-fade-in">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center mb-6"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <div className="rounded-2xl  border border-border p-6 text-center">
          <p className="font-semibold text-foreground">Transaction not found</p>
          <button
            type="button"
            onClick={() => navigate('/transact')}
            className="mt-4 px-6 py-3 rounded-2xl gradient-primary text-primary-foreground font-semibold"
          >
            Back to Transact
          </button>
        </div>
      </div>
    );
  }

  const date = request
    ? new Date(request.respondedAt || request.createdAt)
    : new Date(resolvedTransaction!.timestamp);
  const typeLabel = request ? getRequestTypeLabel(request.type) : getTransactionTypeLabel(resolvedTransaction!.type);
  const statusLabel = request
    ? request.status === 'approved'
      ? 'Request Approved'
      : request.status === 'declined'
        ? 'Request Declined'
        : 'Request Pending'
    : 'Transaction Successful';
  const sourceName = request ? request.requesterName : resolvedTransaction!.senderName;
  const sourceAccount = request ? request.requestedFromAccount : resolvedTransaction!.senderAccount;
  const beneficiaryName = request ? request.requestedFromName : resolvedTransaction!.receiverName;
  const beneficiaryAccount = request ? request.requestedFromAccount : resolvedTransaction!.receiverAccount;
  const amount = request
    ? (request.status === 'approved' ? (request.respondedAmount ?? request.amount) : request.amount)
    : resolvedTransaction!.amount;
  const displayStatus = request ? request.status : resolvedTransaction!.status;
  const statusColorClass = displayStatus === 'success' || displayStatus === 'approved'
    ? 'text-success'
    : displayStatus === 'pending'
      ? 'text-amber-600'
      : 'text-destructive';
  const referenceId = request ? `REQ-${request.id}` : resolvedTransaction!.id;

  const handleShare = async () => {
    const shareText = `Receipt\nType: ${typeLabel}\nAmount: NGN ${amount.toLocaleString()}.00\nDate: ${date.toLocaleDateString('en-NG')} ${date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}\nReference: ${referenceId}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Transaction Receipt', text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
      }
    } catch {
      // Ignore share cancellation/errors silently.
    }
  };

  return (
    <div className="py-4 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-full flex items-center justify-center"
        >
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="text-[17px] font-bold text-foreground">Receipt</h1>
        <button
          type="button"
          onClick={handleShare}
          className="w-10 h-10 rounded-full flex items-center justify-center"
        >
          <Share2 className="w-5 h-5 text-primary" />
        </button>
      </div>

      <div className="rounded-[10px] border border-[#0C436A] overflow-hidden">
        <div className="p-5 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <p className="md:text-[15.5px] text-[15px] font-bold text-foreground">{statusLabel}</p>
            <CheckCircle2 className="md:w-5 md:h-5 w-5 h-5 text-success" />
          </div>
          <span className="inline-flex px-3 py-1 rounded-[6px] border border-[#093A5B] text-primary text-[13px] font-semibold">
            {typeLabel}
          </span>
        </div>

        <div className="p-5 border-b border-border grid grid-cols-2 gap-3">
          <div>
            <p className="text-[13px] text-muted-foreground">Date</p>
            <p className="text-[14px] font-semibold text-foreground">{date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
          </div>
          <div className="text-right">
            <p className="text-[13px] text-muted-foreground">Time</p>
            <p className="text-[14px] font-semibold text-foreground">{date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <div className="col-span-2">
            <p className="text-[13px] text-muted-foreground">Transaction ID</p>
            <p className="text-[14px] font-[395] text-foreground break-all">{referenceId}</p>
          </div>
        </div>

        <div className="p-5 border-b border-border">
          <p className="text-[13px] text-muted-foreground mb-1">Source Account</p>
          <p className="text-[14.5px] font-bold text-foreground">{sourceName}</p>
          <p className="text-[13px] text-muted-foreground mt-1">{sourceAccount}</p>
        </div>

        <div className="p-5 border-b border-border">
          <p className="text-[13px] text-muted-foreground mb-1">Beneficiary Details</p>
          <p className="text-[14.5px] font-bold text-foreground">{beneficiaryName}</p>
          <p className="text-[13px] text-muted-foreground mt-1">{beneficiaryAccount}</p>
        </div>

        <div className="p-5 border-b border-border flex items-center justify-between">
          <p className="text-[14px] font-bold text-foreground">Amount</p>
          <p className="text-[16px] font-bold text-foreground">NGN {amount.toLocaleString()}.00</p>
        </div>

        <div className="p-5 flex items-center justify-between">
          <p className="text-[14px] font-bold text-foreground">Status</p>
          <p className={`text-[14px] font-bold uppercase ${statusColorClass}`}>{displayStatus}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => navigate('/transact')}
        className="w-full mt-6 py-4 rounded-2xl gradient-primary text-primary-foreground font-semibold text-[14px]"
      >
        Done
      </button>

     
    </div>
  );
};

export default TransactionReceiptPage;
