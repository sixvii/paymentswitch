import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@/store/useStore';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createBackendTransaction, createIdempotencyKey, fetchBackendTransactions } from '@/lib/backendApi';
import type { Transaction } from '@/types';

const MerchantDashboardPage = () => {
  const { currentUser } = useStore();
  const [amount, setAmount] = useState('');
  const [customer, setCustomer] = useState('');
  const [type, setType] = useState<Transaction['type']>('send');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reference, setReference] = useState('');
  const [backendTransactions, setBackendTransactions] = useState<Transaction[]>([]);
  const [backendError, setBackendError] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        const txs = await fetchBackendTransactions();
        if (!active) return;
        setBackendTransactions(txs);
      } catch {
        if (!active) return;
        setBackendError('Unable to reach backend API.');
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, []);

  const merchantTransactions = useMemo(
    () => backendTransactions.filter((tx) => ['send', 'bills', 'receive', 'escrow'].includes(tx.type)),
    [backendTransactions],
  );

  const handleRecordSale = async () => {
    const normalizedCustomerAccount = customer.trim();
    const amountValue = Number(amount);

    if (!normalizedCustomerAccount) {
      setValidationError('Enter customer account number.');
      return;
    }

    if (!/^\d{10,15}$/.test(normalizedCustomerAccount)) {
      setValidationError('Customer account number must be 10 to 15 digits.');
      return;
    }

    if (!amount || Number.isNaN(amountValue) || amountValue <= 0) {
      setValidationError('Enter a valid sale amount.');
      return;
    }

    setValidationError('');
    setBackendError('');
    setSuccess(false);
    setLoading(true);
    try {
      const result = await createBackendTransaction({
        idempotencyKey: createIdempotencyKey('merchant'),
        type,
        amount: amountValue,
        senderAccount: currentUser?.accountNumber || 'MERCHANT',
        receiverAccount: normalizedCustomerAccount,
        senderName: `${currentUser?.firstName || 'Merchant'} ${currentUser?.lastName || ''}`.trim(),
        receiverName: normalizedCustomerAccount,
        description: `Merchant dashboard: ${type}`,
        status: 'success',
      });

      setBackendTransactions((prev) => [result, ...prev.filter((tx) => tx.id !== result.id)]);
      setReference(result.id);
      setSuccess(true);
      setAmount('');
      setCustomer('');
    } catch {
      setBackendError('Unable to record transaction right now.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="md:max-w-[1300px] mx-auto py-8 px-4">
      <h1 className="text-[17px] font-[600] mb-4 md:mb-7">Merchant / Agent Dashboard</h1>
      {backendError && <p className="text-sm text-amber-700 mb-4">{backendError}</p>}
      {validationError && <p className="text-sm text-red-600 mb-4">{validationError}</p>}
      <div className="space-y-5 mb-8">
        <Input
          placeholder="Customer Account Number"
          className='h-12 border border-[#0E5486]'
          value={customer}
          onChange={e => setCustomer(e.target.value)}
        />
        <Input
          type="number"
          placeholder="Sale Amount (₦)"
          className='h-12 border border-[#0E5486]'
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        <select
          className="w-full border border-[#0E5486] rounded-[6px] px-3 py-3 text-[14px] "
          value={type}
          onChange={e => setType(e.target.value as Transaction['type'])}
        >
          <option value="send">POS Sale</option>
          <option value="bills">Bulk Payment</option>
          <option value="receive">Cash-in</option>
          <option value="escrow">Cash-out</option>
        </select>
        <Button onClick={handleRecordSale} disabled={loading} className="w-full">
          {loading ? 'Recording...' : 'Record Transaction'}
        </Button>
        {success && (
          <div className="mt-6 p-4 border rounded-lg bg-muted text-center">
            <div className="text-[15px] font-semibold">Transaction Recorded!</div>
            <div className="text-[14px] my-2">Reference: <span className="font-mono">{reference}</span></div>
          </div>
        )}
      </div>
      <h2 className="text-[15.5px] font-[600] mb-4">Recent Merchant Transactions</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-[#0E5486] text-[14px]">
          <thead>
            <tr className="bg-muted">
              <th className="p-2 border border-[#0E5486]">Reference</th>
              <th className="p-2 border border-[#0E5486]">Type</th>
              <th className="p-2 border border-[#0E5486]">Customer</th>
              <th className="p-2 border border-[#0E5486]">Amount</th>
              <th className="p-2 border border-[#0E5486]">Status</th>
              <th className="p-2 border border-[#0E5486]">Date</th>
            </tr>
          </thead>
          <tbody>
            {merchantTransactions.length === 0 ? (
              <tr><td colSpan={6} className="text-center p-4">No merchant transactions yet</td></tr>
            ) : (
              merchantTransactions.map(tx => (
                <tr key={tx.id}>
                  <td className="p-2 border border-[#0E5486] font-poppins">{tx.id}</td>
                  <td className="p-2 border border-[#0E5486]">{tx.type}</td>
                  <td className="p-2 border border-[#0E5486]">{tx.receiverName}</td>
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

export default MerchantDashboardPage;
