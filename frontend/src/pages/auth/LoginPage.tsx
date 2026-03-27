import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';
import { Eye, EyeOff } from 'lucide-react';
import { fetchBackendAccountState, fetchBackendEscrows, fetchBackendRequests, fetchBackendUserState, loginBackendUser } from '@/lib/backendApi';

const LoginPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as { phone?: string } | null) || null;
  const [phone, setPhone] = useState((state?.phone || '').replace(/\D/g, '').slice(-10));
  const { setCurrentUser, upsertUser, hydrateBackendState, setBalance } = useStore();

  const [step, setStep] = useState<'username' | 'pin'>('username');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleUsernameSubmit = () => {
    if (phone.length < 10) {
      setError('Please enter a valid phone number');
      return;
    }

    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    setStep('pin');
    setError('');
  };

  const handlePinComplete = async (pin: string) => {
    if (phone.length < 10) {
      setError('Please enter a valid phone number');
      setStep('username');
      return;
    }

    try {
      const user = await loginBackendUser({
        phone,
        username,
        password,
        pin,
      });

      upsertUser(user);
      setCurrentUser(user);
      try {
        const backendState = await fetchBackendUserState();
        const requests = await fetchBackendRequests();
        const escrows = await fetchBackendEscrows();
        hydrateBackendState(backendState);
        hydrateBackendState({ userRequests: requests, escrows });
        const accountState = await fetchBackendAccountState();
        setBalance(accountState.balance);
      } catch {
        // Login should continue even if state sync is temporarily unavailable.
      }
      navigate('/');
    } catch (backendError) {
      // Backend login failed - don't fall back to local login
      // This ensures users must connect to backend for authentication
      if (backendError instanceof Error) {
        setError(backendError.message || 'Login failed. Please check your credentials.');
        return;
      }
      setError('Login failed. Unable to connect to backend server. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-background px-6 flex items-center">
      <div className="w-full max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-2"></h1>

        {step === 'username' ? (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Phone Number</label>
              <div className="flex items-center gap-3 p-4 rounded-[10px] bg-[#F2F5F7] border border-border">
                <span className="text-[15px] font-semibold text-foreground">+234</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="Enter your phone number"
                  className="flex-1 bg-transparent text-[15px] text-foreground outline-none"
                  inputMode="numeric"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username"
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary pr-12"
                />
                <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}
                </button>
              </div>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button onClick={handleUsernameSubmit} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold text-lg mt-4">
              Continue
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center pt-10">
            <PinInput label="Enter your PIN" onComplete={handlePinComplete} />
            {error && <p className="text-destructive text-sm mt-4">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
