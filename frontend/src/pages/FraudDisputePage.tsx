import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { createBackendDispute, fetchBackendDisputes, fetchBackendTransactionById } from '@/lib/backendApi';

type DisputeEntry = {
  id: string;
  transactionId: string;
  issue: string;
  status: 'open' | 'resolved';
  createdAt: string;
};

const FraudDisputePage = () => {
  const [disputes, setDisputes] = useState<DisputeEntry[]>([]);
  const { toast } = useToast();
  const [txId, setTxId] = useState('');
  const [issue, setIssue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await fetchBackendDisputes();
        if (!active) return;
        setDisputes(data);
      } catch {
        if (!active) return;
        toast({ title: 'Unable to load previous disputes right now.' });
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [toast]);

  const handleSubmit = async () => {
    if (!txId || !issue) {
      toast({ title: 'Please provide transaction ID and issue details.' });
      return;
    }

    setSubmitting(true);

    try {
      await fetchBackendTransactionById(txId.trim());
      const created = await createBackendDispute({ transactionId: txId.trim(), issue: issue.trim() });
      setDisputes((prev) => [created, ...prev.filter((entry) => entry.id !== created.id)]);
      setSubmitting(false);
      setSuccess(true);
      toast({ title: 'Dispute submitted', description: 'Our support team will review and contact you.' });
      setTxId('');
      setIssue('');
    } catch (error) {
      setSubmitting(false);
      const message = error instanceof Error ? error.message : 'Unable to submit dispute right now.';
      toast({ title: message });
    }
  };

  return (
    <div className="md:max-w-[1300px] mx-auto py-8 px-4">
      <h1 className="text-[17px] font-bold mb-4">Fraud / Dispute Reporting</h1>
      <div className="space-y-4">
        <Input
          placeholder="Transaction ID"
          className='h-12 border border-[#0E5486] ring-0 '
          value={txId}
          onChange={e => setTxId(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-3 py-2 min-h-[130px]"
          placeholder="Describe the issue (e.g. failed, wrong amount, not received, suspected fraud)"
          value={issue}
          onChange={e => setIssue(e.target.value)}
        />
        <Button onClick={handleSubmit} disabled={submitting} className="w-full">
          {submitting ? 'Submitting...' : 'Submit Dispute'}
        </Button>
        {success && (
          <div className="mt-6 p-4 border border-[#0E5486] rounded-[6px] bg-muted text-center">
            <div className="text-[14px] font-semibold">Dispute Submitted</div>
            <div className="text-[13px] text-muted-foreground">Our support team will review and contact you soon.</div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-[15px] font-semibold mb-3">My Disputes</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-[#0E5486] text-[14px]">
              <thead>
                <tr className="bg-muted">
                  <th className="p-2 border border-[#0E5486]">Transaction ID</th>
                  <th className="p-2 border border-[#0E5486]">Issue</th>
                  <th className="p-2 border border-[#0E5486]">Status</th>
                  <th className="p-2 border border-[#0E5486]">Date</th>
                </tr>
              </thead>
              <tbody>
                {disputes.length === 0 ? (
                  <tr><td colSpan={4} className="text-center p-4">No disputes yet</td></tr>
                ) : (
                  disputes.map((entry) => (
                    <tr key={entry.id}>
                      <td className="p-2 border border-[#0E5486] font-poppins">{entry.transactionId}</td>
                      <td className="p-2 border border-[#0E5486]">{entry.issue}</td>
                      <td className="p-2 border border-[#0E5486] uppercase">{entry.status}</td>
                      <td className="p-2 border border-[#0E5486]">{new Date(entry.createdAt).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FraudDisputePage;
