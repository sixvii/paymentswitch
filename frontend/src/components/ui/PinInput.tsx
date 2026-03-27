import { useEffect, useRef, useState } from 'react';

interface PinInputProps {
  length?: number;
  onComplete: (pin: string) => void;
  label?: string;
}

const PinInput = ({ length = 4, onComplete, label }: PinInputProps) => {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  const handleChange = (index: number, value: string) => {
    if (isProcessing) return;
    if (!/^\d*$/.test(value)) return;
    const newValues = [...values];
    newValues[index] = value.slice(-1);
    setValues(newValues);

    if (value && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    if (newValues.every(v => v !== '') && newValues.join('').length === length) {
      const completedPin = newValues.join('');
      setIsProcessing(true);

      completionTimeoutRef.current = setTimeout(() => {
        void Promise.resolve(onComplete(completedPin)).finally(() => {
          setIsProcessing(false);
          setValues(Array(length).fill(''));
          inputRefs.current[0]?.focus();
        });
      }, 620);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !values[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {label && <p className="text-foreground font-semibold text-lg">{label}</p>}
      {isProcessing ? (
        <div className="fixed inset-0 z-[100]  backdrop-blur-sm flex flex-col items-center justify-center gap-3 px-4">
          <img
            src="/logo.svg"
            alt="logo"
            className="w-16 h-16 object-contain animate-bounce"
            style={{ animationDuration: '280ms', animationIterationCount: 2 }}
          />
          <p className="text-sm font-semibold text-foreground"></p>
        </div>
      ) : (
        <div className="flex gap-3">
          {values.map((value, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={value}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 border-border bg-card text-foreground focus:border-primary focus:outline-none transition-colors"
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default PinInput;
