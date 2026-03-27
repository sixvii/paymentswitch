import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Banknote, Phone, Wifi, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchBackendRequests, fetchUserByAccount } from '@/lib/backendApi';
import PinInput from '@/components/ui/PinInput';

type RequestType = 'airtime' | 'data' | 'money';

const networkOptions = ['MTN', 'Airtel', 'Glo', '9mobile'];

const requestOptions: Record<RequestType, { label: string; icon: React.ElementType; desc: string }> = {
  airtime: {
    label: 'Airtime Request',
    icon: Phone,
    desc: 'Request airtime support from your network.',
  },
  data: {
    label: 'Data Request',
    icon: Wifi,
    desc: 'Request data support for internet access.',
  },
  money: {
    label: 'Money Request',
    icon: Banknote,
    desc: 'Request direct wallet support.',
  },
};

const RequestsPage = () => {
  const { currentUser, users, userRequests, createUserRequest, respondToUserRequest, declineUserRequest, hydrateBackendState } = useStore();

  const [selectedType, setSelectedType] = useState<RequestType>('money');
  const [requestedFromAccount, setRequestedFromAccount] = useState('');
  const [requestedFromName, setRequestedFromName] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');
  const [network, setNetwork] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [pendingApproval, setPendingApproval] = useState<{ requestId: string; amount: number } | null>(null);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    const account = requestedFromAccount.trim();
    if (account.length !== 10) {
      setRequestedFromName('');
      return;
    }

    let active = true;
    void (async () => {
      try {
        const remote = await fetchUserByAccount(account);
        if (!active) return;
        setRequestedFromName(`${remote.firstName} ${remote.lastName}`);
      } catch {
        if (!active) return;
        const cached = users.find((user) => user.accountNumber === account);
        setRequestedFromName(cached ? `${cached.firstName} ${cached.lastName}` : '');
      }
    })();

    return () => {
      active = false;
    };
  }, [requestedFromAccount, users]);

  const myRequests = useMemo(
    () => userRequests.filter((request) => request.requesterId === currentUser?.id),
    [userRequests, currentUser?.id],
  );

  const incomingRequests = useMemo(
    () => userRequests.filter((request) => request.requestedFromAccount === currentUser?.accountNumber && request.status === 'pending'),
    [userRequests, currentUser?.accountNumber],
  );

  useEffect(() => {
    const loadRequests = async () => {
      try {
        const requests = await fetchBackendRequests();
        hydrateBackendState({ userRequests: requests });
      } catch {
        // Requests page should still render with locally available state if sync fails.
      }
    };

    void loadRequests();
  }, [hydrateBackendState]);

  const handleCreateRequest = async () => {
    const result = await createUserRequest({
      type: selectedType,
      amount: Number(amount),
      requestedFromAccount,
      requesterPhone,
      network,
      note: note.trim() || undefined,
    });

    if (!result.success) {
      toast.error(result.message);
      return;
    }

    toast.success(result.message);
    setRequestedFromAccount('');
    setRequesterPhone('');
    setNetwork('');
    setAmount('');
    setNote('');
  };

  const handleApprove = (requestId: string, requestedAmount: number) => {
    setPendingApproval({ requestId, amount: requestedAmount });
    setPinError('');
  };

  const handleApproveWithPin = async (pin: string) => {
    if (!currentUser) {
      setPinError('Please login first');
      return;
    }

    if (pin !== currentUser.pin) {
      setPinError('Incorrect PIN');
      return;
    }

    if (!pendingApproval) return;

    const result = await respondToUserRequest(pendingApproval.requestId, pendingApproval.amount);
    if (!result.success) {
      toast.error(result.message);
      return;
    }

    setPendingApproval(null);
    setPinError('');
    toast.success(result.message);
  };

  const handleDecline = async (requestId: string) => {
    const result = await declineUserRequest(requestId);
    if (!result.success) {
      toast.error(result.message);
      return;
    }
    toast.success(result.message);
  };

  return (
    <div className="py-4 space-y-6 animate-fade-in">
      {pendingApproval && (
        <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center px-6">
          <div className="w-full max-w-lg rounded-[10px] border border-[#0C436A] bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[17px] font-bold text-foreground">Confirm Request Approval</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter your 4-digit PIN to approve this request and complete the transfer.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPendingApproval(null);
                  setPinError('');
                }}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="Close PIN confirmation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="pt-6 pb-2 flex flex-col items-center">
              <PinInput onComplete={handleApproveWithPin} label="Enter your 4-digit PIN" />
              {pinError && <p className="text-red-500 text-center mt-2">{pinError}</p>}
            </div>
          </div>
        </div>
      )}

      <h1 className="text-[17px] font-bold text-foreground">Requests</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {(Object.entries(requestOptions) as [RequestType, (typeof requestOptions)[RequestType]][]).map(([type, option]) => {
          const Icon = option.icon;
          const isActive = selectedType === type;

          return (
            <button
              key={type}
              onClick={() => {
                setSelectedType(type);
                setNetwork('');
              }}
              className={`text-left p-4 rounded-[10px] border transition-colors ${
                isActive ? 'border-[#0C436A] bg-[#F2F5F7]' : 'border-border  hover:bg-muted/50'
              }`}
            >
              <div className="w-11 h-11 rounded-xl bg-[#F2F5F7] border border-[#0C436A] flex items-center justify-center mb-3">
                <Icon className="w-5 h-5 text-[#0C436A]" />
              </div>
              <p className="font-semibold text-foreground">{option.label}</p>
              <p className="text-xs text-muted-foreground mt-1">{option.desc}</p>
            </button>
          );
        })}
      </div>

      <div className="rounded-[10px] border border-[#0C436A] p-4 space-y-4">
        <p className="font-semibold text-foreground">Create {requestOptions[selectedType].label}</p>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Request From (Account Number)</label>
          <input
            type="text"
            value={requestedFromAccount}
            onChange={(e) => setRequestedFromAccount(e.target.value.replace(/\D/g, '').slice(0, 10))}
            inputMode="numeric"
            maxLength={10}
            placeholder="Enter account number"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Recipient Full Name</label>
          <input
            type="text"
            value={requestedFromName}
            readOnly
            placeholder="Account holder name will appear here"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Amount (NGN)</label>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            placeholder="Enter amount"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
          />
        </div>

        {(selectedType === 'airtime' || selectedType === 'data') && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Requester Phone Number</label>
              <input
                type="text"
                value={requesterPhone}
                onChange={(e) => setRequesterPhone(e.target.value.replace(/\D/g, '').slice(0, 15))}
                inputMode="numeric"
                placeholder="Enter your phone number"
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Network</label>
              <select
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
              >
                <option value="">Select network</option>
                {networkOptions.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Add a short reason"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none resize-none"
          />
        </div>

        <button
          onClick={() => { void handleCreateRequest(); }}
          className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold"
        >
          Send Request
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">Incoming Requests</h2>
        {incomingRequests.length > 0 ? incomingRequests.map((request) => (
          <div key={request.id} className="rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-foreground capitalize">{request.type} request</p>
              <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase text-[#208F9A]">
                pending
              </span>
            </div>
            <p className="text-[17px] font-bold text-foreground mt-2">NGN {request.amount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground mt-1">From: {request.requesterName}</p>
            {request.requesterPhone && <p className="text-sm text-muted-foreground mt-1">Phone: {request.requesterPhone}</p>}
            {request.network && <p className="text-sm text-muted-foreground mt-1">Network: {request.network}</p>}
            {request.note && <p className="text-sm text-muted-foreground mt-1">{request.note}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => { handleApprove(request.id, request.amount); }}
                className="px-4 py-2 rounded-[10px] gradient-primary text-primary-foreground text-sm font-semibold"
              >
                Approve
              </button>
              <button
                onClick={() => { void handleDecline(request.id); }}
                className="px-4 py-2 rounded-[10px] border border-[#0C436A] text-foreground text-sm font-semibold"
              >
                Decline
              </button>
            </div>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">No incoming pending requests.</p>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">My Request History</h2>
        {myRequests.length > 0 ? myRequests.map((request) => (
          <div key={request.id} className="rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-foreground capitalize">{request.type} request</p>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                request.status === 'approved'
                  ? 'text-[#0C436A]'
                  : request.status === 'declined'
                    ? 'text-red-500'
                    : 'text-[#208F9A]'
              }`}>
                {request.status}
              </span>
            </div>
            <p className="text-[17px] font-bold text-foreground mt-2">NGN {request.amount.toLocaleString()}</p>
            <p className="text-sm text-muted-foreground mt-1">From: {request.requestedFromName} ({request.requestedFromAccount})</p>
            {request.requesterPhone && <p className="text-sm text-muted-foreground mt-1">Phone: {request.requesterPhone}</p>}
            {request.network && <p className="text-sm text-muted-foreground mt-1">Network: {request.network}</p>}
            {request.note && <p className="text-sm text-muted-foreground mt-1">{request.note}</p>}
            <p className="text-xs text-muted-foreground mt-2">{new Date(request.createdAt).toLocaleString('en-NG')}</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        )}
      </div>
    </div>
  );
};

export default RequestsPage;
