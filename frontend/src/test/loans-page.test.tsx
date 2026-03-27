import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LoansPage from '@/pages/LoansPage';

const storeMocks = vi.hoisted(() => ({
  getLoanLimit: vi.fn(),
  applyLoan: vi.fn(),
  repayLoan: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/store/useStore', () => ({
  useStore: () => ({
    currentUser: {
      id: 'u-1',
      firstName: 'Test',
      lastName: 'User',
      accountNumber: '1000000001',
    },
    trustScore: {
      overall: 620,
      transactionVolume: 60,
      savingsDiscipline: 50,
      escrowReliability: 70,
      billPaymentConsistency: 55,
    },
    loans: [
      {
        id: 'loan-1',
        borrowerId: 'u-1',
        borrowerName: 'Test User',
        type: 'business',
        amount: 10000,
        status: 'active',
        createdAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + 86400000).toISOString(),
      },
    ],
    getLoanLimit: storeMocks.getLoanLimit,
    applyLoan: storeMocks.applyLoan,
    repayLoan: storeMocks.repayLoan,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastMocks.error,
    success: toastMocks.success,
  },
}));

describe('LoansPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeMocks.getLoanLimit.mockImplementation((type: 'student' | 'business') => (
      type === 'student' ? 100000 : 1000000
    ));
    storeMocks.applyLoan.mockResolvedValue({ success: true, message: 'ok' });
    storeMocks.repayLoan.mockResolvedValue({ success: true, message: 'Loan repaid' });
  });

  it('disables apply action when user has active loan', () => {
    render(<LoansPage />);

    const applyButton = screen.getByRole('button', { name: /repay active loan first/i });
    expect(applyButton).toBeDisabled();
  });

  it('repays active loan and shows success toast', async () => {
    render(<LoansPage />);

    const repayButton = screen.getByRole('button', { name: /repay loan/i });
    fireEvent.click(repayButton);

    expect(storeMocks.repayLoan).toHaveBeenCalledWith('loan-1');

    await screen.findByRole('button', { name: /repay loan/i });
    expect(toastMocks.success).toHaveBeenCalledWith('Loan repaid');
  });
});
