import { describe, expect, it } from 'vitest';
import { computeUserTrustScore } from '@/lib/trustScore';

const fallback = {
  overall: 450,
  transactionVolume: 60,
  savingsDiscipline: 50,
  escrowReliability: 70,
  billPaymentConsistency: 55,
};

describe('computeUserTrustScore', () => {
  it('computes score using only current user scoped activity', () => {
    const currentUser = {
      id: 'u-1',
      firstName: 'A',
      lastName: 'B',
      phone: '08000000001',
      email: 'a@example.com',
      age: '28',
      username: 'alpha',
      pin: '1234',
      password: 'pw',
      accountNumber: '1000000001',
      walletId: 'WALLET-A',
      createdAt: new Date().toISOString(),
      faceVerified: true,
      ajoUsername: 'alpha-ajo',
    };

    const result = computeUserTrustScore({
      currentUser,
      transactions: [
        {
          id: 'tx-a1',
          type: 'send',
          amount: 1000,
          senderAccount: '1000000001',
          receiverAccount: '1000000002',
          senderName: 'Alpha',
          receiverName: 'Beta',
          description: 'mine',
          status: 'success',
          timestamp: new Date().toISOString(),
        },
        {
          id: 'tx-b1',
          type: 'send',
          amount: 1000,
          senderAccount: '9999999999',
          receiverAccount: '8888888888',
          senderName: 'Other',
          receiverName: 'Other2',
          description: 'not mine',
          status: 'success',
          timestamp: new Date().toISOString(),
        },
      ],
      savingsGroups: [
        {
          id: 'g-1',
          name: 'Ajo',
          creatorUsername: 'alpha-ajo',
          totalMembers: 1,
          contributionAmount: 1000,
          frequency: 'weekly',
          frequencyDay: 'monday',
          latePenalty: 0,
          totalMonths: 1,
          members: [
            {
              ajoUsername: 'alpha-ajo',
              fullName: 'A B',
              slots: 1,
              paymentMode: 'manual',
              accepted: true,
              contributions: [
                {
                  id: 'c-1',
                  groupId: 'g-1',
                  memberUsername: 'alpha-ajo',
                  amount: 1000,
                  date: new Date().toISOString(),
                  status: 'paid',
                },
              ],
            },
          ],
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      ],
      escrows: [
        {
          id: 'e-1',
          buyerWalletId: 'WALLET-A',
          buyerName: 'A B',
          sellerWalletId: 'WALLET-X',
          sellerName: 'X Y',
          amount: 1000,
          description: 'mine',
          deliveryDeadline: new Date().toISOString(),
          status: 'released',
          createdAt: new Date().toISOString(),
          penalty: 0,
        },
        {
          id: 'e-2',
          buyerWalletId: 'WALLET-Z',
          buyerName: 'Not Mine',
          sellerWalletId: 'WALLET-Y',
          sellerName: 'Not Mine',
          amount: 1000,
          description: 'not mine',
          deliveryDeadline: new Date().toISOString(),
          status: 'disputed',
          createdAt: new Date().toISOString(),
          penalty: 0,
        },
      ],
      billPayments: [],
      fallback,
    });

    expect(result.transactionVolume).toBe(4);
    expect(result.savingsDiscipline).toBe(100);
    expect(result.escrowReliability).toBe(100);
    expect(result.billPaymentConsistency).toBe(0);
    expect(result.overall).toBeGreaterThan(0);
  });
});
