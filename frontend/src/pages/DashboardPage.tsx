import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { ChevronRight } from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge';

type Period = 'week' | 'month' | '6months';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { transactions, currentUser } = useStore();
  const [period, setPeriod] = useState<Period>('week');

  const now = new Date();

  const getPeriodStart = (selectedPeriod: Period) => {
    if (selectedPeriod === 'week') {
      const start = new Date(now);
      const day = start.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      return start;
    }

    if (selectedPeriod === 'month') {
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    }

    return new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
  };

  const periodStart = getPeriodStart(period);
  const myTransactions = transactions.filter((tx) => {
    const myAccount = currentUser?.accountNumber;
    if (!myAccount) return false;
    return tx.senderAccount === myAccount || tx.receiverAccount === myAccount;
  });

  const filtered = myTransactions.filter((tx) => {
    const d = new Date(tx.timestamp);
    return d.getTime() >= periodStart.getTime() && d.getTime() <= now.getTime();
  });

  const formatRangeDate = (date: Date) => date.toLocaleDateString('en-NG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const periodRangeLabel = `${formatRangeDate(periodStart)} - ${formatRangeDate(now)}`;

  const totalSpending = filtered
    .filter(tx => tx.type !== 'receive')
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Breakdown by type
  const breakdown: Record<string, number> = {};
  filtered.filter(tx => tx.type !== 'receive').forEach(tx => {
    const cat = tx.type === 'send'
      ? 'Transfers'
      : tx.type === 'cross-border'
        ? 'Cross-Border'
        : tx.type === 'airtime'
          ? 'Airtime'
          : tx.type === 'data'
            ? 'Data'
            : tx.type === 'bills'
              ? 'Bills'
              : tx.type === 'escrow'
                ? 'Escrow'
                : tx.type === 'ajo'
                  ? 'Ajo'
                  : 'Others';
    breakdown[cat] = (breakdown[cat] || 0) + tx.amount;
  });

  const sortedBreakdown = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);

  const periodLabels: Record<Period, string> = { week: 'This week', month: 'This month', '6months': 'Last 6 months' };

  return (
    <div className="py-4 space-y-6 animate-fade-in">
      {/* Spending dropdown (static) */}
      <div className="rounded-[10px]  border border-[#0C436A] p-4">
        <p className="text-foreground font-semibold">Spending</p>
      </div>

      {/* Period tabs */}
      <div className="flex gap-2">
        {(['week', 'month', '6months'] as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className={`md:px-4 px-4 py-2 rounded-[10px] border border-[#0C436A] md:text-sm text-[12px] font-medium transition-colors ${
              period === p ? 'gradient-primary text-primary-foreground' : ' text-foreground border border-border'
            }`}>
            {periodLabels[p]}
          </button>
        ))}
      </div>

      {/* Total Spending */}
      <div className="bg-muted/50 rounded-2xl p-6">
        <p className="text-muted-foreground text-sm">Total Spending</p>
        <p className="text-xs text-muted-foreground mt-1">{periodRangeLabel}</p>
        <p className="text-3xl font-bold text-primary mt-1">NGN {totalSpending.toLocaleString()}.00</p>

        {/* Breakdown */}
        <h3 className="font-semibold text-foreground mt-6 mb-4">Breakdown</h3>
        <div className="space-y-4 border border-[#0C436A] rounded-[10px] p-4">
          {sortedBreakdown.length > 0 ? sortedBreakdown.map(([cat, amount]) => {
            const pct = totalSpending > 0 ? ((amount / totalSpending) * 100).toFixed(2) : '0';
            return (
              <div key={cat}>
                <div className="w-full bg-muted rounded-full h-2 mb-2">
                  <div className="gradient-primary h-2 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-primary font-semibold">NGN {amount.toLocaleString()}.00</p>
                    <p className="text-sm text-muted-foreground">{cat} ({pct}%)</p>
                  </div>
                  <span className="text-muted-foreground">›</span>
                </div>
              </div>
            );
          }) : (
            <p className="text-center text-muted-foreground py-4">No spending data</p>
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="mt-8 border border-[#0C436A] rounded-[10px] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">Activity Log</h2>
          <button onClick={() => navigate('/transact')} className="text-[#093A5B] text-[12px] font-medium flex items-center gap-1">
            View All <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-smooth overscroll-contain pr-1">
          {filtered.slice(0, 10).map((tx) => {
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
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-[#F2F5F7] border border-[#0C436A] hover:bg-[#EAF0F3] transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{title}</p>
                  <p className="text-xs text-muted-foreground">
                    {date.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })} | {date.toLocaleDateString('en-NG')}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-[15px] font-bold ${isDebit ? 'text-foreground' : 'text-success'}`}>
                    {isDebit ? '-' : '+'}₦{tx.amount.toLocaleString()}
                  </p>
                  <StatusBadge status={tx.status} />
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">No activity for this period</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
