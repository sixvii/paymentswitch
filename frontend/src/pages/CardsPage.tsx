import { useMemo, useState } from 'react';
import { CreditCard, Star, Trash2 } from 'lucide-react';
import { useStore } from '@/store/useStore';

const getBrandLabel = (brand: 'visa' | 'mastercard' | 'verve' | 'other') => {
  if (brand === 'visa') return 'Visa';
  if (brand === 'mastercard') return 'Mastercard';
  if (brand === 'verve') return 'Verve';
  return 'Card';
};

const detectBrand = (digits: string): 'visa' | 'mastercard' | 'verve' | 'other' => {
  if (digits.startsWith('4')) return 'visa';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'mastercard';
  if (/^(506|507|650)/.test(digits)) return 'verve';
  return 'other';
};

const formatCardInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 19);
  return digits.replace(/(.{4})/g, '$1 ').trim();
};

const maskCardNumber = (last4: string) => `•••• •••• •••• ${last4}`;

const getCardTone = (brand: 'visa' | 'mastercard' | 'verve' | 'other') => {
  if (brand === 'visa') return 'from-[#0D4E7D] via-[#0C628C] to-[#0E8AA0]';
  if (brand === 'mastercard') return 'from-[#0C436A] via-[#0D6B8B] to-[#2BA0A2]';
  if (brand === 'verve') return 'from-[#104B76] via-[#146085] to-[#2B8A9D]';
  return 'from-[#184B63] via-[#1C6880] to-[#3598A6]';
};

const CardsPage = () => {
  const { currentUser, cards, addCard, removeCard, setDefaultCard } = useStore();

  const fullName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();

  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [brand, setBrand] = useState<'visa' | 'mastercard' | 'verve' | 'other'>('visa');
  const [error, setError] = useState('');

  const cardNumberDigits = cardNumber.replace(/\D/g, '');
  const previewBrand = cardNumberDigits.length >= 1 ? detectBrand(cardNumberDigits) : brand;
  const previewNumber = cardNumberDigits
    ? `${cardNumberDigits.slice(0, 4).padEnd(4, '•')} ${cardNumberDigits.slice(4, 8).padEnd(4, '•')} ${cardNumberDigits.slice(8, 12).padEnd(4, '•')} ${cardNumberDigits.slice(12, 16).padEnd(4, '•')}`
    : '•••• •••• •••• ••••';
  const previewHolder = fullName || 'CARDHOLDER NAME';
  const previewExp = `${expiryMonth || 'MM'}/${expiryYear || 'YY'}`;

  const sortedCards = useMemo(
    () => [...cards].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
    [cards],
  );

  const handleAddCard = () => {
    const result = addCard({
      cardNumber,
      cardholderName: fullName,
      expiryMonth,
      expiryYear,
      brand,
    });

    if (!result.success) {
      setError(result.message);
      return;
    }

    setCardNumber('');
    setExpiryMonth('');
    setExpiryYear('');
    setBrand('visa');
    setError('');
  };

  return (
    <div className="py-4 md:px-0 px-2 space-y-6 animate-fade-in">
      <div>
        <h1 className="text-[17px] font-bold text-foreground">Cards</h1>
        <p className="text-sm text-muted-foreground">Add and manage your payment cards.</p>
      </div>

      <div className="rounded-[10px] border border-[#0C436A] p-4 space-y-3">
        <h2 className="font-semibold text-foreground">Add New Card</h2>

        <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${getCardTone(previewBrand)} p-5 text-white shadow-lg`}>
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
          <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10" />
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Inter-pay</p>
              <span className="text-xs font-semibold bg-white/15 px-2 py-1 rounded-full">{getBrandLabel(previewBrand)}</span>
            </div>
            <p className="text-xl tracking-[0.16em] font-semibold mb-6">{previewNumber}</p>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] uppercase text-white/70">Cardholder</p>
                <p className="text-sm font-semibold uppercase">{previewHolder}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase text-white/70">Expires</p>
                <p className="text-sm font-semibold">{previewExp}</p>
              </div>
            </div>
          </div>
        </div>

        <div className='pt-5'>
          <label className="text-sm font-medium text-foreground mb-2 block">Cardholder Name</label>
          <input
            type="text"
            value={fullName}
            readOnly
            placeholder="Cardholder name"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">Card Number</label>
          <input
            type="text"
            value={cardNumber}
            onChange={(event) => setCardNumber(formatCardInput(event.target.value))}
            placeholder="Enter card number"
            inputMode="numeric"
            className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Month</label>
            <input
              type="text"
              value={expiryMonth}
              onChange={(event) => setExpiryMonth(event.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="MM"
              inputMode="numeric"
              className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Year</label>
            <input
              type="text"
              value={expiryYear}
              onChange={(event) => setExpiryYear(event.target.value.replace(/\D/g, '').slice(0, 2))}
              placeholder="YY"
              inputMode="numeric"
              className="w-full p-4 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Brand</label>
            <select
              value={brand}
              onChange={(event) => setBrand(event.target.value as 'visa' | 'mastercard' | 'verve' | 'other')}
              className="w-full h-[56px] px-3 rounded-[10px] bg-[#F2F5F7] border border-[#0C436A] text-foreground outline-none focus:border-[#0C436A]"
            >
              <option value="visa">Visa</option>
              <option value="mastercard">Mastercard</option>
              <option value="verve">Verve</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {error && <p className="text-destructive text-sm font-medium">{error}</p>}

        <button
          type="button"
          onClick={handleAddCard}
          className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-semibold "
        >
          Save Card
        </button>
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-foreground">My Cards</h2>

        {sortedCards.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-[#0C436A] p-8 text-center">
            <CreditCard className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="font-semibold text-foreground">No cards added yet</p>
            <p className="text-sm text-muted-foreground">Your saved cards will appear here.</p>
          </div>
        ) : (
          sortedCards.map((card) => (
            <div key={card.id} className="rounded-[10px] border border-[#0C436A] bg-card p-4">
              <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${getCardTone(card.brand)} p-5 text-white shadow-sm`}>
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
                <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10" />
                <div className="relative">
                  <div className="flex items-center justify-between mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Inter-pay</p>
                    <div className="flex items-center gap-2">
                      {card.isDefault && (
                        <span className="px-2 py-1 rounded-full text-[10px] font-semibold bg-white/20">Default</span>
                      )}
                      <span className="text-xs font-semibold bg-white/15 px-2 py-1 rounded-full">{getBrandLabel(card.brand)}</span>
                    </div>
                  </div>

                  <p className="text-xl tracking-[0.16em] font-semibold mb-6">{maskCardNumber(card.last4)}</p>

                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[11px] uppercase text-white/70">Cardholder</p>
                      <p className="text-sm font-semibold uppercase">{card.cardholderName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] uppercase text-white/70">Expires</p>
                      <p className="text-sm font-semibold">{card.expiryMonth}/{card.expiryYear}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-3">
                <div className="flex items-center gap-2">
                  {!card.isDefault && (
                    <button
                      type="button"
                      onClick={() => setDefaultCard(card.id)}
                      className="px-3 py-2 rounded-xl border border-border text-xs font-semibold text-foreground inline-flex items-center gap-1"
                    >
                      <Star className="w-4 h-4" /> Set Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeCard(card.id)}
                    className="px-3 py-2 rounded-xl border border-red-600 text-xs font-semibold text-red-600 inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-4 h-4" /> Remove
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default CardsPage;
