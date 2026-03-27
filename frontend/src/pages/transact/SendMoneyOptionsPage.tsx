import { useNavigate } from 'react-router-dom';
import receiveIcon from '@/assets/icons/receiver.png';
import qrCodeIcon from '@/assets/icons/scan.png';
import escrowIcon from '@/assets/icons/escrow.png';
import intern from '@/assets/icons/international.png';

const SendMoneyOptionsPage = () => {
  const navigate = useNavigate();

  const options = [
    {
      image: receiveIcon,
      title: 'Enter Receiver Details',
      description: 'Type account number and send directly.',
      path: '/transact/send',
    },
    {
      image: qrCodeIcon,
      title: 'Scan Receiver Barcode',
      description: 'Use camera to scan receiver QR code.',
      path: '/transact/scan',
    },
    {
      image: escrowIcon,
      title: 'Escrow',
      description: 'Send securely using escrow.',
      path: '/escrow',
    },
    {
      image: intern,
      title: 'International',
      description: 'Send money internationally.',
      path: '/cross-border',
    },
  ];

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground mb-2">Send Money</h1>
      <p className="text-muted-foreground mb-6">Choose how you want to find the receiver.</p>

      <div className="space-y-4">
        {options.map((option) => {
          return (
            <button
              key={option.title}
              onClick={() => navigate(option.path)}
              className="w-full rounded-[10px] bg-[#F2F5F7] border border-[#0C4168] p-5 text-left hover:bg-[#EAF0F3] transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 flex items-center justify-center">
                  {option.image ? (
                    <span
                      className="block w-6 h-6"
                      aria-label={option.title}
                      role="img"
                      style={{
                        backgroundColor: '#0D4975',
                        WebkitMaskImage: `url(${option.image})`,
                        maskImage: `url(${option.image})`,
                        WebkitMaskRepeat: 'no-repeat',
                        maskRepeat: 'no-repeat',
                        WebkitMaskSize: 'contain',
                        maskSize: 'contain',
                        WebkitMaskPosition: 'center',
                        maskPosition: 'center',
                      }}
                    />
                  ) : null}
                </div>
                <div>
                  <p className="font-semibold text-foreground">{option.title}</p>
                  <p className="text-sm text-muted-foreground">{option.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SendMoneyOptionsPage;
