import { useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { computeUserTrustScore } from '@/lib/trustScore';

const TrustScorePage = () => {
  const { trustScore, transactions, savingsGroups, escrows, billPayments, currentUser } = useStore();

  const derivedTrustScore = useMemo(() => computeUserTrustScore({
    currentUser,
    transactions,
    savingsGroups,
    escrows,
    billPayments,
    fallback: trustScore,
  }), [billPayments, currentUser, escrows, savingsGroups, transactions, trustScore]);

  const components = [
    { label: 'Transaction Volume', value: derivedTrustScore.transactionVolume, max: 100 },
    { label: 'Savings Discipline', value: derivedTrustScore.savingsDiscipline, max: 100 },
    { label: 'Escrow Reliability', value: derivedTrustScore.escrowReliability, max: 100 },
    { label: 'Bill Payment Consistency', value: derivedTrustScore.billPaymentConsistency, max: 100 },
  ];

  const tips = [
    'Complete more transactions to boost volume score',
    'Join and contribute to Ajo groups regularly',
    'Always release escrow payments on time',
    'Pay your bills before the due date',
    'Maintain a consistent savings habit',
  ];

  const scoreColor = derivedTrustScore.overall >= 700 ? 'text-success' : derivedTrustScore.overall >= 400 ? 'text-warning' : 'text-destructive';

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground mb-6">Trust Score</h1>

      {/* Score Gauge */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative w-40 h-40">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--border))" strokeWidth="10" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="hsl(var(--accent))" strokeWidth="10"
              strokeDasharray={`${(derivedTrustScore.overall / 850) * 327} 327`} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-4xl font-bold ${scoreColor}`}>{derivedTrustScore.overall}</span>
            <span className="text-xs text-muted-foreground">/ 850</span>
          </div>
        </div>
      </div>

      <div className="border border-gray-300 rounded-2xl bg-[#F2F5F7] p-4">
        {/* Components */}
        <div className="space-y-4 mb-8">
          {components.map(c => (
            <div key={c.label} className="bg-[#F2F5F7] rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-foreground">{c.label}</p>
                <p className="text-sm font-bold text-primary">{c.value}%</p>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div className="gradient-accent h-2 rounded-full transition-all" style={{ width: `${c.value}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* Tips */}
        <h3 className="font-semibold text-foreground mb-3">Tips to Improve</h3>
        <div className="space-y-2">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-[#F2F5F7]">
              <span className="text-secondary font-bold text-sm mt-0.5">{i + 1}</span>
              <p className="text-sm text-foreground">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TrustScorePage;
