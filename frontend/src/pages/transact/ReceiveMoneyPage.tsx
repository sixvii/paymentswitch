import { useStore } from '@/store/useStore';
import { Copy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

const ReceiveMoneyPage = () => {
  const { currentUser } = useStore();
  const fullName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
  const qrPayload = JSON.stringify({
    type: 'interpay-receiver',
    version: 1,
    accountNumber: currentUser?.accountNumber || '',
    fullName,
    walletId: currentUser?.walletId || '',
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <div className="py-4 animate-fade-in px-4">
      <h1 className="text-[17px] font-bold text-foreground mb-6">Receive Money</h1>

      <div className="flex flex-col items-center rounded-[10px] border border-gray-300 border-dashed p-6">
        <div className=" p-4 rounded-[10px] mb-6 shadow-sm">
          <QRCodeSVG
            value={qrPayload}
            size={240}
            level="H"
          />
        </div>

        <p className="text-muted-foreground text-sm mb-2">Your Account Number</p>
        <button onClick={() => copyToClipboard(currentUser?.accountNumber || '')}
          className="flex items-center gap-4 px-4 py-2 rounded-[10px] border border-border mb-4">
          <span className="md:text-lg text-[14px] font-[600] text-[#0C436A]">{currentUser?.accountNumber}</span>
          <Copy className="w-4 h-4 text-muted-foreground" />
        </button>

        <p className="text-muted-foreground text-sm mb-2">Wallet ID</p>
        <button onClick={() => copyToClipboard(currentUser?.walletId || '')}
          className="flex items-center gap-4 px-4 py-2 rounded-[10px] border border-border">
          <span className="md:text-lg text-[14px] font-[600] text-[#0C436A]">{currentUser?.walletId}</span>
          <Copy className="w-4 h-4 text-muted-foreground" />
        </button>

        <p className="text-center text-muted-foreground md:text-sm text-[12px] mt-8 px-4">
          Share your QR code or account number with the sender to receive payment
        </p>
      </div>
    </div>
  );
};

export default ReceiveMoneyPage;
