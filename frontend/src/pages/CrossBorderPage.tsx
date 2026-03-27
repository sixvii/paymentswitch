import { useState, useEffect } from 'react';
import { fetchConversionRate } from '@/lib/currencyApi';
import { banksByCurrency } from '@/lib/banksData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/store/useStore';
import { createCommittedBackendTransaction, createIdempotencyKey } from '@/lib/backendApi';
import TransactionSuccessAction from '@/components/ui/TransactionSuccessAction';

const currencies = [
  { code: 'NGN', name: 'Nigerian Naira' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'EUR', name: 'Euro' },
  { code: 'KES', name: 'Kenyan Shilling' },
];

const CrossBorderPage = () => {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const { balance, setBalance, currentUser, addTransaction } = useStore();
  const [currency, setCurrency] = useState('USD'); // currency to send out
  const [recipient, setRecipient] = useState('');
  const [recipientBank, setRecipientBank] = useState('');
  const [bankSearch, setBankSearch] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [reference, setReference] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [conversionRate, setConversionRate] = useState<number | null>(null);
  const [convertedAmount, setConvertedAmount] = useState<number | null>(null);

  const handleSend = async () => {
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0 || !recipient || !recipientBank || !recipientName) {
      toast({ title: 'Enter all details correctly' });
      return;
    }
    if (amt > balance) {
      toast({ title: 'Insufficient main balance' });
      return;
    }

    if (!currentUser) {
      toast({ title: 'Please login first' });
      return;
    }

    setLoading(true);

    try {
      const committed = await createCommittedBackendTransaction({
        idempotencyKey: createIdempotencyKey('cross-border'),
        type: 'cross-border',
        amount: amt,
        senderAccount: currentUser.accountNumber,
        receiverAccount: recipient,
        senderName: `${currentUser.firstName} ${currentUser.lastName}`,
        receiverName: recipientName,
        description: `IMTO payout to ${recipientName} (${recipientBank}, ${currency})`,
        status: 'success',
      }, balance, balance - amt);

      setLoading(false);
      setSuccess(true);
      setBalance(committed.balance);
      addTransaction(committed.transaction);
      const ref = committed.transaction.id || ('IMTO-' + Math.floor(100000 + Math.random() * 900000));
      setTransactionId(committed.transaction.id);
      setReference(ref);
      toast({ title: 'Remittance Sent!', description: `Reference: ${ref}` });
    } catch {
      setLoading(false);
      toast({ title: 'Unable to send remittance right now' });
    }
  };

  // Always convert from NGN to selected currency
  useEffect(() => {
    async function getRate() {
      if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
        setConversionRate(null);
        setConvertedAmount(null);
        return;
      }
      if (currency === 'NGN') {
        setConversionRate(1);
        setConvertedAmount(Number(amount));
        return;
      }
      setConversionRate(null);
      setConvertedAmount(null);
      const rate = await fetchConversionRate('NGN', currency);
      if (rate) {
        setConversionRate(rate);
        setConvertedAmount(Number(amount) * rate);
      }
    }
    getRate();
  }, [amount, currency]);

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 md:px-8">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-[17px] font-[600] mb-2">Cross-Border Remittance</h1>
          <p className="text-muted-foreground max-w-xl">
            Instantly send money to friends, family, or business partners across borders. Choose a currency, enter the recipient’s details, and your funds will be delivered securely.
          </p>
        </div>
        <div className="hidden md:block">
          <span className="inline-block rounded-[6px] bg-[#0E5486] px-6 py-2 text-white font-[400] text-[14px] shadow">International</span>
        </div>
      </div>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-[#093A5B] bg-primary/5 px-4 py-3 md:py-6">
        <span className="text-[14px] text-muted-foreground">Main Balance</span>
        <span className="font-bold text-[19px] text-primary">₦{balance.toLocaleString()}</span>
      </div>
      <div className=" rounded-xl border border-[#0E5486] p-6 md:p-10 md:max-w-4xl mx-auto">
        <form
          onSubmit={e => { e.preventDefault(); handleSend(); }}
          className="space-y-6"
        >
          <div>
            <label className="block mb-1 font-[400] text-[14px]">Amount (NGN)</label>
            <Input
              type="number"
              placeholder="Amount to send in NGN"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              min={1}
              className="h-12 md:text-lg text-[14px]"
            />
            <div className="mt-6">
              <label className="block mb-1 text-xs text-muted-foreground">Converted Amount ({currency})</label>
              <Input
                type="text"
                readOnly
                value={convertedAmount !== null ? `${currency} ${convertedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}
                className="h-10 text-base bg-muted-foreground/10 border-muted-foreground/20 cursor-not-allowed"
                tabIndex={-1}
              />
              {conversionRate && (
                <div className="text-xs text-muted-foreground mt-1">1 NGN ≈ {currency} {conversionRate.toLocaleString(undefined, { maximumFractionDigits: 4 })}</div>
              )}
            </div>
          </div>
          <div>
            <label className="block mb-1 font-[400] text-[14px]">Currency</label>
            <select
              className="w-full border rounded-[6px] h-12 px-3 text-[14px]"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
            >
              {currencies.map(c => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 font-[400] text-[14px]">Recipient Bank Name</label>
            <Input
              type="text"
              placeholder="Search bank name..."
              value={bankSearch}
              onChange={e => setBankSearch(e.target.value)}
              className="h-12 md:text-[14px] text-[14px] mb-2"
            />
            {bankSearch.trim() && (
              <div className="max-h-40 overflow-y-auto border rounded bg-background">
                {(banksByCurrency[currency] || [])
                  .filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase()))
                  .map(b => (
                    <div
                      key={b.code}
                      className={`px-3 py-2 cursor-pointer hover:bg-accent ${recipientBank === b.name ? 'bg-accent text-primary' : ''}`}
                      onClick={() => { setRecipientBank(b.name); setBankSearch(b.name); }}
                    >
                      {b.name}
                    </div>
                  ))}
                {((banksByCurrency[currency] || []).filter(b => b.name.toLowerCase().includes(bankSearch.toLowerCase())).length === 0) && (
                  <div className="px-3 py-2 text-muted-foreground text-sm">No banks found</div>
                )}
              </div>
            )}
            {recipientBank && (
              <div className="mt-1 text-xs text-muted-foreground">Selected: <span className="font-semibold">{recipientBank}</span></div>
            )}
          </div>
          <div>
            <label className="block mb-1 font-[400] text-[14px]">Recipient Full Name</label>
            <Input
              type="text"
              placeholder="Recipient Full Name"
              value={recipientName}
              onChange={e => setRecipientName(e.target.value)}
              className="h-12  text-[14px]"
            />
          </div>
          <div>
            <label className="block mb-1 font-[400] text-[14px]">Recipient Account</label>
            <Input
              type="text"
              placeholder="Recipient Bank Account Number"
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              className="h-12 text-[14px]"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full h-12 text-base font-semibold rounded-xl">
            {loading ? 'Sending...' : 'Send Money'}
          </Button>
        </form>
        {success && (
          <div className="mt-8 p-6 border rounded-xl bg-muted text-center">
            <div className="text-[14px] font-semibold text-success mb-2">Remittance Sent!</div>
            <div className="text-[14px] my-2">Reference: <span className="font-poppins font-[500]">{reference}</span></div>
            <div className="text-[13px] text-muted-foreground">Funds will be delivered to the recipient's account or wallet.</div>
            {transactionId && (
              <TransactionSuccessAction
                transactionId={transactionId}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-primary text-primary-foreground"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CrossBorderPage;
