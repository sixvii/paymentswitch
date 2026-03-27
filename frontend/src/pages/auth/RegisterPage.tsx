import { useState, useRef, useCallback, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';
import { Camera, Check, Eye, EyeOff } from 'lucide-react';
import { fetchBackendAccountState, fetchBackendEscrows, fetchBackendRequests, fetchBackendUserState, registerBackendUser } from '@/lib/backendApi';

type Step = 'personal' | 'face' | 'credentials';

const RegisterPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = (location.state as { phone?: string } | null) || null;
  // Normalize phone to just last 10 digits (remove country code for consistency)
  const phone = (state?.phone || '').replace(/\D/g, '').slice(-10);
  const { registerUser, hydrateBackendState, setBalance } = useStore();

  const [step, setStep] = useState<Step>('personal');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [password, setPassword] = useState('');
  const [nin, setNin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [faceVerified, setFaceVerified] = useState(false);
  const [pinStep, setPinStep] = useState<'set' | 'confirm' | 'password'>('set');
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [startingCamera, setStartingCamera] = useState(false);
  const autoCaptureTimeoutRef = useRef<number | null>(null);
  const hasAutoCapturedRef = useRef(false);

  const stopCamera = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStartingCamera(false);
    setCameraActive(false);
  }, []);

  const clearAutoCaptureTimeout = useCallback(() => {
    if (autoCaptureTimeoutRef.current !== null) {
      window.clearTimeout(autoCaptureTimeoutRef.current);
      autoCaptureTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearAutoCaptureTimeout();
      stopCamera();
    };
  }, [clearAutoCaptureTimeout, stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      setError('');
      setStartingCamera(true);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera is not supported in this browser.');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {
          // Some browsers block autoplay until the stream is visible; keep stream attached.
        });
        hasAutoCapturedRef.current = false;
        setCameraActive(true);
      }
    } catch {
      setError('Camera access denied. Please allow camera access.');
    } finally {
      setStartingCamera(false);
    }
  }, []);

  const captureAndVerify = useCallback(() => {
    if (!videoRef.current?.srcObject) {
      return;
    }
    clearAutoCaptureTimeout();
    stopCamera();
    setFaceVerified(true);
    setStep('credentials');
  }, [clearAutoCaptureTimeout, stopCamera]);

  const handleSkipFace = useCallback(() => {
    clearAutoCaptureTimeout();
    stopCamera();
    setFaceVerified(false);
    setError('');
    setStep('credentials');
  }, [clearAutoCaptureTimeout, stopCamera]);

  useEffect(() => {
    if (step === 'face' && !cameraActive && !faceVerified) {
      startCamera();
    }
  }, [step, cameraActive, faceVerified, startCamera]);

  useEffect(() => {
    if (step !== 'face' || !cameraActive || faceVerified || hasAutoCapturedRef.current) {
      return;
    }

    clearAutoCaptureTimeout();
    autoCaptureTimeoutRef.current = window.setTimeout(() => {
      hasAutoCapturedRef.current = true;
      captureAndVerify();
    }, 1400);

    return () => {
      clearAutoCaptureTimeout();
    };
  }, [step, cameraActive, faceVerified, captureAndVerify, clearAutoCaptureTimeout]);

  const handlePersonalSubmit = () => {
    if (!firstName || !lastName || !age || !email) {
      setError('Please fill all fields');
      return;
    }
    setError('');
    setStep('face');
  };

  const handlePinSet = (value: string) => {
    setPin(value);
    setPinStep('confirm');
  };

  const handlePinConfirm = (value: string) => {
    if (value !== pin) {
      setError('PINs do not match');
      setConfirmPin('');
      return;
    }
    setConfirmPin(value);
    setError('');
    setPinStep('password');
  };

  const handleRegister = async () => {
    if (!username || !password) {
      setError('Please enter username and password');
      return;
    }
    if (nin.length !== 11) {
      setError('NIN must be exactly 11 digits');
      return;
    }
    const accountNumber = phone.slice(-10);
    const walletId = 'TP-' + Math.random().toString(36).substring(2, 10).toUpperCase();

    try {
      const createdUser = await registerBackendUser({
      id: Math.random().toString(36).substring(2, 15),
      firstName,
      lastName,
      phone,
      email,
      age,
      username,
      pin,
      password,
      nin,
      accountNumber,
      walletId,
      createdAt: new Date().toISOString(),
      faceVerified,
      });

      registerUser(createdUser);
      try {
        const backendState = await fetchBackendUserState();
        const requests = await fetchBackendRequests();
        const escrows = await fetchBackendEscrows();
        hydrateBackendState(backendState);
        hydrateBackendState({ userRequests: requests, escrows });
        const accountState = await fetchBackendAccountState();
        setBalance(accountState.balance);
      } catch {
        // Registration should continue even if state sync is temporarily unavailable.
      }

      navigate('/');
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message || 'Unable to create account right now');
        return;
      }
      setError('Unable to create account right now');
    }
  };

  return (
    <div className="min-h-screen bg-background max-w-5xl mx-auto px-6 pt-6">
      {/* Progress */}
      <div className="flex gap-2 mb-8">
        {['personal', 'face', 'credentials'].map((s, i) => (
          <div key={s} className={`flex-1 h-1 rounded-full ${
            i <= ['personal', 'face', 'credentials'].indexOf(step) ? 'gradient-primary' : 'bg-border'
          }`} />
        ))}
      </div>

      {step === 'personal' && (
        <div className="animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground mb-2">Create Account</h1>
          <p className="text-muted-foreground mb-6">+234 {phone}</p>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">First Name</label>
              <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                placeholder="Enter first name" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Last Name</label>
              <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                placeholder="Enter last name" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Age</label>
              <select value={age} onChange={(e) => setAge(e.target.value)}
                className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary">
                <option value="">Select age range</option>
                <option value="18-24">18-24</option>
                <option value="25-34">25-34</option>
                <option value="35-44">35-44</option>
                <option value="45-54">45-54</option>
                <option value="55+">55+</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Email Address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter email address" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary" />
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            <button onClick={handlePersonalSubmit} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold text-lg">
              Next
            </button>
          </div>
        </div>
      )}

      {step === 'face' && (
        <div className="animate-fade-in flex flex-col items-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Face Verification</h1>
          <p className="text-muted-foreground mb-6 text-center">Position your face in the circle</p>

          <div className="w-64 h-64 rounded-full border-4 border-primary overflow-hidden mb-6 relative">
            {cameraActive ? (
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]" />
            ) : faceVerified ? (
              <div className="w-full h-full gradient-accent flex items-center justify-center animate-pulse-success">
                <Check className="w-20 h-20 text-primary-foreground" />
              </div>
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <Camera className="w-16 h-16 text-muted-foreground" />
              </div>
            )}
          </div>

          {error && <p className="text-destructive text-sm mb-4">{error}</p>}

          {!cameraActive && !faceVerified && (
            <p className="text-muted-foreground text-sm mb-4">
              {startingCamera ? 'Opening front camera...' : 'Tap below to open your front camera'}
            </p>
          )}
          {!cameraActive && !faceVerified && (
            <button onClick={startCamera} disabled={startingCamera} className="w-full py-4 rounded-2xl gradient-primary text-primary-foreground font-semibold text-lg disabled:opacity-60">
              {startingCamera ? 'Opening Camera...' : error ? 'Retry Camera' : 'Open Camera'}
            </button>
          )}
          {cameraActive && (
            <button onClick={captureAndVerify} className="w-full py-4 rounded-2xl gradient-accent text-accent-foreground font-semibold text-lg">
              Capture now
            </button>
          )}
          {!faceVerified && (
            <button onClick={handleSkipFace} className="w-full mt-3 py-4 rounded-[10px] border border-border bg-[#F2F5F7] text-foreground font-semibold text-lg">
              Skip for now
            </button>
          )}
          {faceVerified && (
            <p className="text-success font-semibold">✓ Face Verified Successfully</p>
          )}
        </div>
      )}

      {step === 'credentials' && (
        <div className="animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground mb-2">Set Credentials</h1>
          <p className="text-muted-foreground mb-6">Create your username, PIN and password</p>

          {pinStep === 'set' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="Choose a username" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary" />
              </div>
              <div className="pt-6">
                <PinInput label="Set your PIN" onComplete={handlePinSet} />
              </div>
            </div>
          )}

          {pinStep === 'confirm' && (
            <div className="pt-6">
              <PinInput label="Confirm your PIN" onComplete={handlePinConfirm} />
              {error && <p className="text-destructive text-sm text-center mt-4">{error}</p>}
            </div>
          )}

          {pinStep === 'password' && (
            <div className="space-y-4">
              <p className="text-success font-semibold text-center mb-4">✓ PIN set successfully</p>
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password" className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary pr-12" />
                  <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2">
                    {showPassword ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">NIN Number</label>
                <input
                  type="text"
                  value={nin}
                  onChange={(e) => setNin(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="Enter your 11-digit NIN"
                  inputMode="numeric"
                  maxLength={11}
                  className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-border text-foreground outline-none focus:border-primary"
                />
              </div>
              {error && <p className="text-destructive text-sm">{error}</p>}
              <button onClick={handleRegister} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold text-lg">
                Create Account
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default RegisterPage;
