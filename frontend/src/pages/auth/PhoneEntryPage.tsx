import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { ChevronRight } from 'lucide-react';
import { checkUserExistsByPhone } from '@/lib/backendApi';
import iphoneIcon from '@/assets/icons/iphone.png';
import escrowIcon from '@/assets/icons/escrow.png';
import bagIcon from '@/assets/icons/bag.png';

const onboardingSlides = [
  {
    image: iphoneIcon,
    title: 'Offline Payments',
    description: 'Send and receive money even without internet using QR codes, NFC, or Bluetooth.',
  },
  {
    image: escrowIcon,
    title: 'Escrow Protection',
    description: 'Safe online transactions. Funds are locked until delivery is confirmed.',
  },
  {
    image: bagIcon,
    title: 'Financial Identity',
    description: 'Build your Trust Score and unlock future financial services without credit history.',
  },
];

const PhoneEntryPage = () => {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const navigate = useNavigate();
  const { findUserByPhone } = useStore();

  const handleContinue = async () => {
    if (phone.length < 10) return;
    const cleanPhone = phone.replace(/\D/g, '').slice(-10);
    setChecking(true);
    setError('');

    let exists: boolean;
    try {
      exists = await checkUserExistsByPhone(cleanPhone);
    } catch {
      // Fallback to local cache when backend is unavailable.
      exists = !!findUserByPhone(cleanPhone);
      setError('Backend unavailable. Falling back to local records.');
    } finally {
      setChecking(false);
    }

    const existing = exists;
    if (existing) {
      navigate('/auth/login', { state: { phone: cleanPhone } });
    } else {
      navigate('/auth/register', { state: { phone: cleanPhone } });
    }
  };

  return (
    <div className="min-h-screen bg-background max-w-5xl mx-auto flex flex-col">
      {/* Onboarding slides */}
      <div className="px-6 pt-10 pb-6">
        <div className="flex items-center gap-2 mb-8">
          <img src="/logo.svg" alt="TrustPay logo" className="w-10 h-10 object-contain" />
          <span className="font-bold md:text-2xl text-[16px] text-primary">inter-pay</span>
        </div>

        <div className="space-y-4 mb-8">
          {onboardingSlides.map((slide, index) => {
            return (
              <div key={index} className="flex items-start gap-4 p-4 rounded-[10px] animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                  <span
                    className="block w-6 h-6"
                    aria-label={slide.title}
                    role="img"
                    style={{
                      backgroundColor: '#0E4F7F',
                      WebkitMaskImage: `url(${slide.image})`,
                      maskImage: `url(${slide.image})`,
                      WebkitMaskRepeat: 'no-repeat',
                      maskRepeat: 'no-repeat',
                      WebkitMaskSize: 'contain',
                      maskSize: 'contain',
                      WebkitMaskPosition: 'center',
                      maskPosition: 'center',
                    }}
                  />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">{slide.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{slide.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Phone input */}
      <div className="flex-1 px-6 pb-10 flex flex-col justify-end">
        <h2 className="text-[17px] font-bold text-foreground mb-1">Get Started</h2>
        <p className="text-muted-foreground mb-4">Enter your phone number to continue</p>

        <div className="flex items-center gap-3 p-4 rounded-[10px] bg-card border border-[#0E4F7F] mb-4">
          <span className="text-[15px] font-[500]">+234</span>
          <input
            type="tel"
            placeholder=""
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            className="flex-1  text-foreground text-[15px] font-medium outline-none placeholder:text-muted-foreground"
            inputMode="numeric"
          />
        </div>

        <button
          onClick={handleContinue}
          disabled={phone.length < 10 || checking}
          className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold text-lg flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
        >
          {checking ? 'Checking...' : 'Continue'} <ChevronRight className="w-5 h-5" />
        </button>
        {error && <p className="text-sm text-amber-700 mt-3">{error}</p>}
      </div>
    </div>
  );
};

export default PhoneEntryPage;
