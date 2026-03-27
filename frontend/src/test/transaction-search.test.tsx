import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionSearchPage from '@/pages/TransactionSearchPage';

const backendMocks = vi.hoisted(() => ({
  fetchBackendTransactions: vi.fn(),
}));

const localTransactions = [
  {
    id: 'local-1',
    type: 'send',
    amount: 3500,
    senderAccount: '1000000001',
    receiverAccount: '1000000002',
    senderName: 'Local Sender',
    receiverName: 'Local Receiver',
    description: 'local tx',
    status: 'success' as const,
    timestamp: new Date('2026-03-20T12:00:00.000Z').toISOString(),
  },
];

vi.mock('@/lib/backendApi', () => ({
  fetchBackendTransactions: backendMocks.fetchBackendTransactions,
}));

vi.mock('@/store/useStore', () => ({
  useStore: () => ({
    transactions: localTransactions,
  }),
}));

describe('TransactionSearchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to local transaction history when backend is unavailable', async () => {
    backendMocks.fetchBackendTransactions.mockRejectedValue(new Error('offline'));

    render(<TransactionSearchPage />);

    expect(await screen.findByText(/showing in-app transaction history/i)).toBeInTheDocument();
    expect(screen.getByText('local-1')).toBeInTheDocument();
  });

  it('filters merged transactions by query text', async () => {
    backendMocks.fetchBackendTransactions.mockResolvedValue([
      {
        id: 'server-1',
        type: 'receive',
        amount: 9000,
        senderAccount: '1000000003',
        receiverAccount: '1000000001',
        senderName: 'Server Sender',
        receiverName: 'Test User',
        description: 'server tx',
        status: 'success',
        timestamp: new Date('2026-03-21T10:00:00.000Z').toISOString(),
      },
    ]);

    render(<TransactionSearchPage />);

    await waitFor(() => {
      expect(screen.getByText('server-1')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/search by id, type, name, or amount/i);
    fireEvent.change(searchInput, { target: { value: 'server sender' } });

    expect(screen.getByText('server-1')).toBeInTheDocument();
    expect(screen.queryByText('local-1')).not.toBeInTheDocument();
  });
});
