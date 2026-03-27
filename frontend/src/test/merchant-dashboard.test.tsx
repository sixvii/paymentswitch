import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MerchantDashboardPage from '@/pages/MerchantDashboardPage';

const backendMocks = vi.hoisted(() => ({
  fetchBackendTransactions: vi.fn(),
  createBackendTransaction: vi.fn(),
  createIdempotencyKey: vi.fn(() => 'merchant-idem-key'),
}));

vi.mock('@/lib/backendApi', () => ({
  fetchBackendTransactions: backendMocks.fetchBackendTransactions,
  createBackendTransaction: backendMocks.createBackendTransaction,
  createIdempotencyKey: backendMocks.createIdempotencyKey,
}));

vi.mock('@/store/useStore', () => ({
  useStore: () => ({
    currentUser: {
      firstName: 'Merchant',
      lastName: 'Owner',
      accountNumber: '1000000001',
    },
  }),
}));

describe('MerchantDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backendMocks.fetchBackendTransactions.mockResolvedValue([]);
    backendMocks.createBackendTransaction.mockResolvedValue({
      id: 'tx-1',
      type: 'send',
      amount: 5000,
      senderAccount: '1000000001',
      receiverAccount: '1234567890',
      senderName: 'Merchant Owner',
      receiverName: '1234567890',
      description: 'Merchant dashboard: send',
      status: 'success',
      timestamp: new Date().toISOString(),
    });
  });

  it('blocks submission for invalid customer account format', async () => {
    render(<MerchantDashboardPage />);

    fireEvent.change(screen.getByPlaceholderText(/customer account number/i), { target: { value: 'John Doe' } });
    fireEvent.change(screen.getByPlaceholderText(/sale amount/i), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /record transaction/i }));

    expect(await screen.findByText(/must be 10 to 15 digits/i)).toBeInTheDocument();
    expect(backendMocks.createBackendTransaction).not.toHaveBeenCalled();
  });

  it('submits normalized account number for valid transaction', async () => {
    render(<MerchantDashboardPage />);

    fireEvent.change(screen.getByPlaceholderText(/customer account number/i), { target: { value: ' 1234567890 ' } });
    fireEvent.change(screen.getByPlaceholderText(/sale amount/i), { target: { value: '5000' } });
    fireEvent.click(screen.getByRole('button', { name: /record transaction/i }));

    await waitFor(() => {
      expect(backendMocks.createBackendTransaction).toHaveBeenCalled();
    });

    expect(backendMocks.createBackendTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        receiverAccount: '1234567890',
        receiverName: '1234567890',
        amount: 5000,
      }),
    );
  });
});
