import { useEffect, useMemo, useState } from 'react';
import {
  createInterswitchPayBillLink,
  fetchInterswitchQuickstartConfig,
  verifyInterswitchTransaction,
} from '@/lib/backendApi';

declare global {
  interface Window {
    webpayCheckout?: (payload: Record<string, unknown>) => void;
  }
}

type QuickstartConfig = {
  merchantCode: string;
  payItemId: string;
  mode: 'TEST' | 'LIVE';
  inlineCheckoutScriptUrl: string;
  redirectCheckoutUrl: string;
};

const testCards = [
  { brand: 'Verve', number: '5061050254756707864', expiry: '06/26', cvv: '111', pin: '1111', otp: '-' },
  { brand: 'Verve', number: '5060990580000217499', expiry: '03/50', cvv: '111', pin: '1111', otp: '-' },
  { brand: 'Visa', number: '4000000000002503', expiry: '03/50', cvv: '11', pin: '1111', otp: '-' },
  { brand: 'Mastercard', number: '5123450000000008', expiry: '01/39', cvv: '100', pin: '1111', otp: '123456' },
];

const isValidRedirectUrl = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const normalizeRedirectUrl = (value: string) => value.trim();

const InterswitchQuickstartPage = () => {
  const [config, setConfig] = useState<QuickstartConfig | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [email, setEmail] = useState('test@example.com');
  const [amountNaira, setAmountNaira] = useState('100');
  const [redirectUrl, setRedirectUrl] = useState(`${window.location.origin}/transact`);
  const [callbackPayload, setCallbackPayload] = useState<Record<string, unknown> | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, unknown> | null>(null);
  const [verifyError, setVerifyError] = useState('');
  const [payBillResponse, setPayBillResponse] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [processing, setProcessing] = useState(false);

  const amountKobo = useMemo(() => {
    const parsed = Number(amountNaira);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [amountNaira]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        const remoteConfig = await fetchInterswitchQuickstartConfig();
        if (!active) return;
        setConfig(remoteConfig);
      } catch {
        if (!active) return;
        setError('Failed to load Interswitch config from backend.');
      } finally {
        if (active) {
          setLoadingConfig(false);
        }
      }
    };

    init();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!config?.inlineCheckoutScriptUrl) return;

    const existing = document.querySelector(`script[src="${config.inlineCheckoutScriptUrl}"]`) as HTMLScriptElement | null;
    if (existing) {
      setScriptReady(true);
      return;
    }

    const script = document.createElement('script');
    script.src = config.inlineCheckoutScriptUrl;
    script.async = true;
    script.onload = () => setScriptReady(true);
    script.onerror = () => {
      setError('Unable to load checkout script.');
      setScriptReady(false);
    };

    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [config?.inlineCheckoutScriptUrl]);

  const handleInlineCheckout = () => {
    if (!config) return;
    if (!scriptReady || !window.webpayCheckout) {
      setError('Checkout script not ready yet.');
      return;
    }
    if (!amountKobo || !email.trim()) {
      setError('Enter a valid amount and email.');
      return;
    }
    if (!isValidRedirectUrl(redirectUrl)) {
      setError('Enter a valid absolute redirect URL (http/https).');
      return;
    }
    const normalizedRedirectUrl = normalizeRedirectUrl(redirectUrl);

    setError('');
    setVerifyError('');
    setCallbackPayload(null);
    setVerifyResult(null);

    const txnRef = `test_${Date.now()}`;

    window.webpayCheckout({
      merchant_code: config.merchantCode,
      pay_item_id: config.payItemId,
      txn_ref: txnRef,
      amount: amountKobo,
      currency: 566,
      cust_email: email,
      site_redirect_url: String(normalizedRedirectUrl),
      mode: config.mode,
      onComplete: async (response: Record<string, unknown>) => {
        setCallbackPayload(response);
        try {
          const verification = await verifyInterswitchTransaction(txnRef, String(amountKobo));
          setVerifyResult(verification);
          setVerifyError('');
        } catch {
          setVerifyError('Server-side verification failed.');
        }
      },
    });
  };

  const handleCreatePayBillLink = async () => {
    if (!amountKobo || !email.trim()) {
      setError('Enter a valid amount and email.');
      return;
    }
    if (!isValidRedirectUrl(redirectUrl)) {
      setError('Enter a valid absolute redirect URL (http/https).');
      return;
    }
    const normalizedRedirectUrl = normalizeRedirectUrl(redirectUrl);

    setError('');
    setProcessing(true);
    setPayBillResponse(null);

    try {
      const result = await createInterswitchPayBillLink({
        amount: String(amountKobo),
        redirectUrl: normalizedRedirectUrl,
        customerId: email,
        customerEmail: email,
        currencyCode: '566',
      });
      setPayBillResponse(result);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to create pay-bill link.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="py-4 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Interswitch QuickStart</h1>
        <p className="text-sm text-muted-foreground mt-1">Accept your first payment in test mode on this page.</p>
      </div>

      <div className="rounded-2xl border border-[#0C436A] p-4 space-y-2 bg-card">
        <p className="font-semibold text-foreground">Sandbox Credentials</p>
        {loadingConfig ? (
          <p className="text-sm text-muted-foreground">Loading credentials...</p>
        ) : config ? (
          <div className="grid md:grid-cols-2 gap-2 text-sm">
            <p><span className="font-medium">Merchant Code:</span> {config.merchantCode}</p>
            <p><span className="font-medium">Pay Item ID:</span> {config.payItemId}</p>
            <p><span className="font-medium">Mode:</span> {config.mode}</p>
            <p><span className="font-medium">Script Ready:</span> {scriptReady ? 'Yes' : 'No'}</p>
          </div>
        ) : (
          <p className="text-sm text-destructive">Could not load config.</p>
        )}
      </div>

      <div className="rounded-2xl border border-[#0C436A] p-4 space-y-4 bg-card">
        <p className="font-semibold text-foreground">Payment Input</p>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            value={amountNaira}
            onChange={(event) => setAmountNaira(event.target.value.replace(/[^\d.]/g, ''))}
            className="w-full p-3 rounded-xl bg-[#F2F5F7] border border-[#0C436A]"
            placeholder="Amount in NGN"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full p-3 rounded-xl bg-[#F2F5F7] border border-[#0C436A]"
            placeholder="Customer email"
          />
          <input
            value={redirectUrl}
            onChange={(event) => setRedirectUrl(event.target.value)}
            className="w-full p-3 rounded-xl bg-[#F2F5F7] border border-[#0C436A]"
            placeholder="Redirect URL"
          />
        </div>
        <p className="text-xs text-muted-foreground">Amount in kobo: {amountKobo.toLocaleString()}</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleInlineCheckout}
            className="px-4 py-2 rounded-xl gradient-primary text-primary-foreground font-semibold"
            disabled={!config || processing}
          >
            Path A: Inline Checkout
          </button>
          <button
            type="button"
            onClick={handleCreatePayBillLink}
            className="px-4 py-2 rounded-xl border border-[#0C436A] text-foreground font-semibold"
            disabled={!config || processing}
          >
            Path C: Create Pay-Bill Link
          </button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      {payBillResponse && (
        <div className="rounded-2xl border border-[#0C436A] p-4 bg-card space-y-2">
          <p className="font-semibold text-foreground">Pay-Bill Response</p>
          <pre className="text-xs bg-[#F2F5F7] p-3 rounded-xl overflow-auto">{JSON.stringify(payBillResponse, null, 2)}</pre>
          {typeof payBillResponse.paymentUrl === 'string' && (
            <a
              href={payBillResponse.paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-block px-4 py-2 rounded-xl gradient-primary text-primary-foreground font-semibold"
            >
              Open Payment URL
            </a>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-[#0C436A] p-4 bg-card space-y-3">
        <p className="font-semibold text-foreground">Checkout Callback + Verification</p>
        {callbackPayload ? (
          <pre className="text-xs bg-[#F2F5F7] p-3 rounded-xl overflow-auto">{JSON.stringify(callbackPayload, null, 2)}</pre>
        ) : (
          <p className="text-sm text-muted-foreground">No callback payload yet.</p>
        )}
        {verifyResult && (
          <pre className="text-xs bg-[#F2F5F7] p-3 rounded-xl overflow-auto">{JSON.stringify(verifyResult, null, 2)}</pre>
        )}
        {verifyError && <p className="text-sm text-destructive">{verifyError}</p>}
      </div>

      <div className="rounded-2xl border border-[#0C436A] p-4 bg-card">
        <p className="font-semibold text-foreground mb-3">Step 3 Test Cards</p>
        <div className="overflow-auto">
          <table className="w-full text-sm border border-[#0C436A]">
            <thead>
              <tr className="bg-[#F2F5F7]">
                <th className="p-2 border border-[#0C436A] text-left">Brand</th>
                <th className="p-2 border border-[#0C436A] text-left">Card Number</th>
                <th className="p-2 border border-[#0C436A] text-left">Expiry</th>
                <th className="p-2 border border-[#0C436A] text-left">CVV</th>
                <th className="p-2 border border-[#0C436A] text-left">PIN</th>
                <th className="p-2 border border-[#0C436A] text-left">OTP</th>
              </tr>
            </thead>
            <tbody>
              {testCards.map((card) => (
                <tr key={card.number}>
                  <td className="p-2 border border-[#0C436A]">{card.brand}</td>
                  <td className="p-2 border border-[#0C436A]">{card.number}</td>
                  <td className="p-2 border border-[#0C436A]">{card.expiry}</td>
                  <td className="p-2 border border-[#0C436A]">{card.cvv}</td>
                  <td className="p-2 border border-[#0C436A]">{card.pin}</td>
                  <td className="p-2 border border-[#0C436A]">{card.otp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InterswitchQuickstartPage;
