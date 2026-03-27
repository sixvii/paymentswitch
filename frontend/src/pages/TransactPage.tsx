import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Send, QrCode, Phone, Wifi, Zap, Shield, Bus, Users, Wallet, ArrowDownLeft } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';
import type { Transaction } from '@/types';
import escrowIcon from '@/assets/icons/escrow.png';
import billsIcon from '@/assets/icons/bills.png';
import ajoIcon from '@/assets/icons/ajo.png';
import qrCodeIcon from '@/assets/icons/qr-code.png';
import receiveIcon from '@/assets/icons/receive.png';
import { Globe } from 'lucide-react';

const TransactPage = () => {
  const navigate = useNavigate();
  const { currentUser, transactions, userRequests } = useStore();
  const [tab, setTab] = useState<'transfer' | 'payment'>('transfer');
  const [activityTab, setActivityTab] = useState<'recent' | 'request'>('recent');

  const myTransactions = transactions.filter((tx) => (
    tx.senderAccount === currentUser?.accountNumber || tx.receiverAccount === currentUser?.accountNumber
  ));

  const requestTransactions = userRequests.filter((request) => (
    request.requestedFromAccount === currentUser?.accountNumber || request.requesterId === currentUser?.id
  ));

  const transferMethods = [
    { icon: Send, label: 'Send via Account', path: '/transact/send' },
    { icon: QrCode, image: qrCodeIcon, label: 'Scan QR Code', path: '/transact/scan' },
  ];

  const paymentCards = [
    { icon: Phone, label: 'Buy Airtime', path: '/transact/airtime', color: 'gradient-primary' },
    { icon: Wifi, label: 'Buy Data', path: '/transact/data', color: 'gradient-accent' },
    { icon: Zap, image: billsIcon, label: 'Pay Bills', path: '/transact/bills', color: 'gradient-card' },
    { icon: Shield, label: 'Pay Insurance', path: '/transact/insurance', color: 'gradient-primary' },
    { icon: Bus, label: 'Waka Now', path: '/transact/waka', color: 'gradient-accent' },
    { icon: Users, image: ajoIcon, label: 'Ajo', path: '/ajo', color: 'gradient-card' },
    { icon: Wallet, image: escrowIcon, label: 'Escrow', path: '/escrow', color: 'gradient-primary' },
  ];

  const transactionVisuals: Record<Transaction['type'], { icon: React.ElementType; image?: string; color: string }> = {
    send: { icon: Send, color: 'gradient-primary' },
    receive: { icon: ArrowDownLeft, image: receiveIcon, color: 'gradient-accent' },
    airtime: { icon: Phone, color: 'gradient-primary' },
    data: { icon: QrCode, color: 'gradient-card' },
    bills: { icon: Zap, image: billsIcon, color: 'gradient-primary' },
    insurance: { icon: Shield, color: 'gradient-card' },
    escrow: { icon: Wallet, image: escrowIcon, color: 'gradient-accent' },
    ajo: { icon: Users, image: ajoIcon, color: 'gradient-accent' },
    'cross-border': { icon: Globe, color: 'gradient-card' },
  };

  return (
    <div className="py-4 space-y-6 animate-fade-in">
      {/* Tabs */}
      <div className="flex gap-2">
        <button onClick={() => setTab('transfer')}
          className={`flex-1 py-3 rounded-[10px] font-semibold md:text-sm text-[12px] transition-colors ${
            tab === 'transfer' ? 'gradient-primary text-primary-foreground' : 'bg-card text-foreground border border-border'
          }`}>
          Money Transfer
        </button>
        <button onClick={() => setTab('payment')}
          className={`flex-1 py-3 rounded-[10px] font-semibold md:text-sm text-[12px] transition-colors ${
            tab === 'payment' ? 'gradient-primary text-primary-foreground' : 'bg-card text-foreground border border-border'
          }`}>
          Payments
        </button>
      </div>

      {tab === 'transfer' && (
        <div className="space-y-3">
          {transferMethods.map(m => {
            const Icon = m.icon;
            return (
              <button key={m.label} onClick={() => navigate(m.path)}
                className="w-full flex items-center gap-4 p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] hover:bg-[#EAF0F3] transition-colors">
                <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center">
                  {m.image ? (
                    <img src={m.image} alt={m.label} className="w-6 h-6 object-contain brightness-0 invert" />
                  ) : (
                    <Icon className="w-6 h-6 text-primary-foreground" />
                  )}
                </div>
                <span className="font-semibold text-foreground">{m.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {tab === 'payment' && (
        <div className="grid grid-cols-2 gap-3">
          {paymentCards.map(p => {
            const Icon = p.icon;
            return (
              <button key={p.label} onClick={() => navigate(p.path)}
                className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-card hover:bg-muted/50 transition-colors">
                <div className={`w-14 h-14 rounded-xl ${p.color} flex items-center justify-center`}>
                  {p.image ? (
                    <img src={p.image} alt={p.label} className="w-7 h-7 object-contain brightness-0 invert" />
                  ) : (
                    <Icon className="w-7 h-7 text-primary-foreground" />
                  )}
                </div>
                <span className="text-sm font-semibold text-foreground text-center">{p.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Recent Transactions */}
      <div className="mt-8 border border-[#0C436A] rounded-[10px] p-4">
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setActivityTab('recent')}
            className={`px-4 py-2 rounded-[10px] md:text-sm text-[12px] font-semibold ${activityTab === 'recent' ? 'gradient-primary text-primary-foreground' : 'bg-card border border-border text-foreground'}`}
          >
            Recent
          </button>
          <button
            onClick={() => setActivityTab('request')}
            className={`px-4 py-2 rounded-[10px] md:text-sm text-[12px] font-semibold ${activityTab === 'request' ? 'gradient-primary text-primary-foreground' : 'bg-card border border-border text-foreground'}`}
          >
            Request
          </button>
        </div>

        {activityTab === 'recent' ? (
          <>
            <h2 className="font-semibold text-foreground mb-3">Recent Transactions</h2>
            <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-smooth overscroll-contain pr-1">
              {myTransactions.map((tx) => {
                const visual = transactionVisuals[tx.type];
                const Icon = visual.icon;
                const isDebit = ['send', 'airtime', 'data', 'bills', 'insurance', 'escrow', 'ajo', 'cross-border'].includes(tx.type);
                const title = tx.type === 'send'
                  ? `Transfer to ${tx.receiverName}`
                  : tx.type === 'receive'
                    ? `Received from ${tx.senderName}`
                    : tx.type === 'cross-border'
                      ? `Cross-Border to ${tx.receiverName}`
                    : tx.type === 'airtime'
                      ? 'Airtime'
                      : tx.type === 'data'
                        ? 'Data'
                        : tx.type === 'bills'
                          ? 'Bills'
                          : tx.type === 'insurance'
                            ? 'Insurance'
                            : tx.type === 'escrow'
                              ? 'Escrow'
                              : 'Ajo';
                const date = new Date(tx.timestamp);

                return (
                  <button
                    key={tx.id}
                    onClick={() => navigate(`/transact/receipt/${tx.id}`)}
                    className="w-full flex items-center gap-3 p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] hover:bg-[#EAF0F3] transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{title}</p>
                      <p className="text-xs text-muted-foreground">
                        {date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} | {date.toLocaleDateString('en-NG')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-[15px] font-bold ${isDebit ? 'text-foreground' : 'text-[#01684A]'}`}>
                        {isDebit ? '-' : '+'}₦{tx.amount.toLocaleString()}
                      </p>
                      <StatusBadge status={tx.status} />
                    </div>
                  </button>
                );
              })}
              {myTransactions.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No transactions yet</p>
              )}
            </div>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-foreground mb-3">Request Transactions</h2>
            <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-smooth overscroll-contain pr-1">
              {requestTransactions.length > 0 ? requestTransactions.map((request) => {
                const isIncoming = request.requestedFromAccount === currentUser?.accountNumber;
                return (
                  <button
                    key={request.id}
                    type="button"
                    onClick={() => navigate(`/transact/receipt/request-${request.id}`)}
                    className="w-full flex items-center gap-3 p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] hover:bg-[#EAF0F3] transition-colors text-left"
                  >
                    <div className="w-12 h-12 rounded-[10px] gradient-primary flex items-center justify-center">
                      <ArrowDownLeft className="w-6 h-6 text-primary-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-[600] text-foreground truncate">
                        {isIncoming ? `Request from ${request.requesterName}` : `Request to ${request.requestedFromName}`}
                      </p>
                      <p className="md:text-sm text-[12px] text-muted-foreground">
                        {new Date(request.createdAt).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} | {new Date(request.createdAt).toLocaleDateString('en-NG')}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-foreground">₦{request.amount.toLocaleString()}</p>
                      <StatusBadge status={request.status === 'approved' ? 'success' : request.status === 'declined' ? 'failed' : 'pending'} />
                    </div>
                  </button>
                );
              }) : (
                <p className="text-center py-8 text-muted-foreground">No request transactions yet</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TransactPage;
