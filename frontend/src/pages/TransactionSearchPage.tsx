import { useState, useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { fetchBackendTransactions } from '@/lib/backendApi';
import { useStore } from '@/store/useStore';
import type { Transaction } from '@/types';

const TransactionSearchPage = () => {
  const { transactions: localTransactions } = useStore();
  const [query, setQuery] = useState('');
  const [serverTransactions, setServerTransactions] = useState<Transaction[]>([]);
  const [filtered, setFiltered] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [backendError, setBackendError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const data = await fetchBackendTransactions(500);
        if (!active) return;
        setServerTransactions(data);
      } catch {
        if (!active) return;
        setBackendError('Unable to reach backend API. Showing in-app transaction history.');
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const mergedTransactions = useMemo(() => {
    const mergedMap = new Map<string, Transaction>();
    [...serverTransactions, ...localTransactions].forEach((tx) => {
      if (!mergedMap.has(tx.id)) {
        mergedMap.set(tx.id, tx);
      }
    });

    return [...mergedMap.values()].sort((a, b) => (
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  }, [serverTransactions, localTransactions]);


  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      setFiltered(mergedTransactions);
      return;
    }
    setFiltered(
      mergedTransactions.filter(
        (tx) =>
          tx.id.toLowerCase().includes(q) ||
          tx.type.toLowerCase().includes(q) ||
          (tx.receiverName && tx.receiverName.toLowerCase().includes(q)) ||
          (tx.senderName && tx.senderName.toLowerCase().includes(q)) ||
          (tx.amount && tx.amount.toString().includes(q))
      )
    );
  }, [query, mergedTransactions]);

  return (
    <div className="md:max-w-[1300px] mx-auto py-8 px-4">
      <h1 className="text-[17px] font-[600] mb-4 md:mb-8">Transaction Search & Analytics</h1>
      {isLoading && <p className="text-sm text-muted-foreground mb-4">Loading backend transactions...</p>}
      {backendError && <p className="text-sm text-amber-700 mb-4">{backendError}</p>}
      <div className="flex gap-2 mb-4">
        <Input
          placeholder="Search by ID, type, name, or amount"
          className='h-12 border border-[#0E5486] focus:ring-0 '
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        
      </div>
      <div className="overflow-x-auto mt-10">
        <table className="min-w-full border border-[#0E5486] text-[14px]">
          <thead>
            <tr className="bg-muted">
              <th className="p-2 border border-[#0E5486]">ID</th>
              <th className="p-2 border border-[#0E5486]">Type</th>
              <th className="p-2 border border-[#0E5486]">Amount</th>
              <th className="p-2 border border-[#0E5486]">Status</th>
              <th className="p-2 border border-[#0E5486]">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="text-center p-4">No transactions found</td></tr>
            ) : (
              filtered.map(tx => (
                <tr key={tx.id}>
                  <td className="p-2 border border-[#0E5486] font-poppins">{tx.id}</td>
                  <td className="p-2 border border-[#0E5486]">{tx.type}</td>
                  <td className="p-2 border border-[#0E5486]">₦{tx.amount.toLocaleString()}</td>
                  <td className="p-2 border border-[#0E5486]">{tx.status}</td>
                  <td className="p-2 border border-[#0E5486]">{new Date(tx.timestamp).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TransactionSearchPage;
