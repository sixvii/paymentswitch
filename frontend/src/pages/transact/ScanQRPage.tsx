import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Camera } from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { fetchUserByAccount } from '@/lib/backendApi';

const ScanQRPage = () => {
  const navigate = useNavigate();
  const { findUserByAccount } = useStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let active = true;
    let resolving = false;
    let controls: { stop: () => void } | null = null;
    const reader = new BrowserMultiFormatReader();

    const stopCamera = () => {
      controls?.stop();
      controls = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setScanning(false);
    };

    const navigateToSend = (account: string, receiverName = '') => {
      const params = new URLSearchParams({ account });
      navigate(`/transact/send?${params.toString()}`, {
        state: {
          receiverAccount: account,
          receiverName,
        },
      });
    };

    const resolveReceiverName = async (account: string) => {
      const user = findUserByAccount(account);
      if (user) return `${user.firstName} ${user.lastName}`;

      try {
        const remote = await fetchUserByAccount(account);
        return `${remote.firstName} ${remote.lastName}`;
      } catch {
        return '';
      }
    };

    const resolveScannedAccount = async (text: string) => {
      const raw = text.trim();

      try {
        const data = JSON.parse(raw);
        const accountValue = data.account || data.accountNumber || data.receiverAccount;
        const account = typeof accountValue === 'string' ? accountValue.trim() : '';
        if (/^\d{10}$/.test(account)) {
          const resolvedFromDirectory = await resolveReceiverName(account);
          const payloadName = typeof data.fullName === 'string'
            ? data.fullName
            : (typeof data.name === 'string' ? data.name : '');
          const fullName = resolvedFromDirectory || payloadName;
          if (!fullName) {
            setError('Account owner not found for scanned QR.');
            return false;
          }
          navigateToSend(account, fullName);
          return true;
        }
      } catch {
        // Not JSON QR, continue parsing as plain account string.
      }

      // URL payload support, e.g. trustpay://pay?account=0123456789
      try {
        const url = new URL(raw);
        const account = (url.searchParams.get('account') || url.searchParams.get('accountNumber') || '').trim();
        if (/^\d{10}$/.test(account)) {
          const fullName = await resolveReceiverName(account);
          if (!fullName) {
            setError('Account owner not found for scanned QR.');
            return false;
          }
          navigateToSend(account, fullName);
          return true;
        }
      } catch {
        // Not a URL string.
      }

      // Plain-text fallback: extract first 10-digit account number found in payload.
      const accountMatch = raw.match(/\b\d{10}\b/);
      if (accountMatch) {
        const account = accountMatch[0];
        const fullName = await resolveReceiverName(account);
        if (!fullName) {
          setError('Account owner not found for scanned QR.');
          return false;
        }
        navigateToSend(account, fullName);
        return true;
      }

      if (/^\d{10}$/.test(raw)) {
        const fullName = await resolveReceiverName(raw);
        if (!fullName) {
          setError('Account owner not found for scanned QR.');
          return false;
        }
        navigateToSend(raw, fullName);
        return true;
      }

      return false;
    };

    const startScanner = async () => {
      if (!videoRef.current) return;
      setError('');

      try {
        controls = await reader.decodeFromConstraints(
          {
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          videoRef.current,
          (result, decodeError) => {
            if (!active) return;

            if (result) {
              if (resolving) return;
              resolving = true;
              void resolveScannedAccount(result.getText()).then((ok) => {
                if (!active) return;
                if (ok) {
                  stopCamera();
                  return;
                }
                setError('Invalid QR code. Scan a valid receiver QR.');
                resolving = false;
              });
              return;
            }

            if (decodeError && decodeError.name !== 'NotFoundException') {
              setError('Unable to decode QR. Keep camera steady and try again.');
            }
          },
        );

        const mediaStream = videoRef.current.srcObject as MediaStream | null;
        if (mediaStream) {
          streamRef.current = mediaStream;
        }
        setScanning(true);
      } catch {
        setError('Camera access denied or unavailable. Please allow back camera and try again.');
        setScanning(false);
      }
    };

    startScanner();

    return () => {
      active = false;
      stopCamera();
      if (typeof (reader as { stop?: () => void }).stop === 'function') {
        (reader as { stop: () => void }).stop();
      }
    };
  }, [findUserByAccount, navigate]);

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-6">Scan QR Code</h1>

      <div className="relative rounded-2xl overflow-hidden bg-card aspect-square max-w-sm mx-auto">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
        {!scanning && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <Camera className="w-16 h-16 text-muted-foreground animate-pulse" />
          </div>
        )}
        {scanning && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-48 h-48 border-2 border-secondary rounded-2xl" />
          </div>
        )}
      </div>

      {error && <p className="text-destructive text-center mt-4">{error}</p>}
      <p className="text-center text-muted-foreground text-sm mt-6 px-4">
        Point your back camera at receiver QR code to scan
      </p>
    </div>
  );
};

export default ScanQRPage;
