import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AjoPage from '@/pages/AjoPage';
import { useStore } from '@/store/useStore';
import type { SavingsGroup, User } from '@/types';

const backendMocks = vi.hoisted(() => ({
  fetchBackendUserState: vi.fn(),
  fetchUserByUsername: vi.fn(),
  searchUsersByUsername: vi.fn(),
  updateBackendUserState: vi.fn(),
  commitBackendBalance: vi.fn(),
  createBackendTransaction: vi.fn(),
}));

vi.mock('@/lib/backendApi', () => ({
  AUTH_EXPIRED_EVENT: 'backend-auth-expired',
  clearBackendAuthToken: vi.fn(),
  commitBackendBalance: backendMocks.commitBackendBalance,
  createBackendTransaction: backendMocks.createBackendTransaction,
  createBackendUserRequest: vi.fn(),
  createIdempotencyKey: vi.fn(() => 'test-idempotency-key'),
  fetchBackendUserState: backendMocks.fetchBackendUserState,
  fetchUserByUsername: backendMocks.fetchUserByUsername,
  respondBackendUserRequest: vi.fn(),
  searchUsersByUsername: backendMocks.searchUsersByUsername,
  updateBackendUserPreferences: vi.fn(),
  updateBackendUserState: backendMocks.updateBackendUserState,
}));

const baseTrustScore = {
  overall: 450,
  transactionVolume: 60,
  savingsDiscipline: 50,
  escrowReliability: 70,
  billPaymentConsistency: 55,
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextWeekday = (targetDay: number) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (targetDay - date.getDay() + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date;
};

const buildUser = (): User => ({
  id: 'u-1',
  firstName: 'Wes',
  lastName: 'Side',
  phone: '08000000001',
  email: 'wes@example.com',
  age: '28',
  username: 'wes-side',
  pin: '1234',
  password: 'pass',
  accountNumber: '1000000001',
  walletId: 'WALLET1',
  createdAt: new Date().toISOString(),
  faceVerified: true,
  ajoActivated: true,
  ajoUsername: 'wes',
});

const buildGroup = (creator: User): SavingsGroup => {
  const now = new Date();
  const firstDate = new Date(now.getFullYear(), now.getMonth(), 15);

  return {
    id: 'g-1',
    name: 'payyo',
    creatorUsername: creator.ajoUsername || '',
    totalMembers: 2,
    contributionAmount: 10000,
    frequency: 'weekly',
    frequencyDay: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][firstDate.getDay()],
    firstContributionDate: formatDateInput(firstDate),
    latePenalty: 0,
    totalMonths: 1,
    totalWeeks: 0,
    members: [
      {
        ajoUsername: creator.ajoUsername || '',
        fullName: `${creator.firstName} ${creator.lastName}`,
        slots: 1,
        paymentMode: 'manual',
        accepted: true,
        contributions: [],
      },
      {
        ajoUsername: 'doe',
        fullName: 'Doe John',
        slots: 1,
        paymentMode: 'manual',
        accepted: true,
        contributions: [],
      },
    ],
    payoutOrder: ['wes', 'doe'],
    nextPayoutIndex: 0,
    payoutEnabled: false,
    autoPayoutEnabled: false,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
};

const renderPage = () => render(
  <MemoryRouter>
    <AjoPage />
  </MemoryRouter>,
);

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();

  backendMocks.fetchBackendUserState.mockRejectedValue(new Error('offline'));
  backendMocks.searchUsersByUsername.mockResolvedValue([]);
  backendMocks.fetchUserByUsername.mockRejectedValue(new Error('not found'));
  backendMocks.updateBackendUserState.mockResolvedValue({
    escrows: [],
    savingsGroups: [],
    userRequests: [],
    paycodeHistory: [],
    lockedFunds: [],
  });
  backendMocks.commitBackendBalance.mockImplementation(async (nextBalance: number) => nextBalance);
  backendMocks.createBackendTransaction.mockResolvedValue({});

  useStore.setState({
    currentUser: null,
    isAuthenticated: false,
    users: [],
    balance: 50000,
    transactions: [],
    escrows: [],
    loans: [],
    savingsGroups: [],
    billPayments: [],
    userRequests: [],
    trustScore: baseTrustScore,
    notifications: [],
    fontSize: 15,
  });
});

describe('AjoPage', () => {
  it('validates first contribution date matches selected weekly day', () => {
    const user = buildUser();
    useStore.setState({ currentUser: user, isAuthenticated: true, users: [user] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /create group/i }));

    fireEvent.change(screen.getByPlaceholderText(/enter group name/i), { target: { value: 'alpha ajo' } });
    fireEvent.change(screen.getByPlaceholderText(/number of members/i), { target: { value: '2' } });
    fireEvent.change(screen.getByPlaceholderText(/weekly\/monthly amount/i), { target: { value: '10000' } });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. monday/i), { target: { value: 'Monday' } });

    const nextTuesday = getNextWeekday(2);
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();
    if (!dateInput) return;
    fireEvent.change(dateInput, { target: { value: formatDateInput(nextTuesday) } });
    fireEvent.change(screen.getByPlaceholderText(/duration in months/i), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /^create group$/i }));

    expect(screen.getByText(/must fall on monday/i)).toBeInTheDocument();
  });

  it('allows save button in up/down modes and keeps UI functional', () => {
    const user = buildUser();
    const group = buildGroup(user);
    useStore.setState({ currentUser: user, isAuthenticated: true, users: [user], savingsGroups: [group] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /payyo/i }));

    const saveButton = screen.getByRole('button', { name: /save payout schedule/i });

    fireEvent.click(screen.getByRole('button', { name: /bottom to top/i }));
    expect(saveButton).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /top to bottom/i }));
    expect(saveButton).toBeEnabled();
  });

  it('activates scheduled contribution date in calendar and opens detail panel', () => {
    const user = buildUser();
    const group = buildGroup(user);
    useStore.setState({ currentUser: user, isAuthenticated: true, users: [user], savingsGroups: [group] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /payyo/i }));

    const dayButton = screen.getAllByRole('button').find((button) => (
      String(button.className).includes('bg-[#093A5B]')
    ));

    expect(dayButton).toBeDefined();
    if (!dayButton) return;

    fireEvent.click(dayButton);

    expect(screen.getByText(/payout details for this contribution date/i)).toBeInTheDocument();
    expect(screen.getByText(/payout date:/i)).toBeInTheDocument();
  });

  it('searches and adds a member, then shows Added state', async () => {
    const creator = buildUser();
    const group: SavingsGroup = {
      ...buildGroup(creator),
      members: [
        {
          ajoUsername: creator.ajoUsername || '',
          fullName: `${creator.firstName} ${creator.lastName}`,
          slots: 1,
          paymentMode: 'manual',
          accepted: true,
          contributions: [],
        },
      ],
      totalMembers: 5,
      payoutOrder: ['wes'],
    };

    const candidate = {
      id: 'u-2',
      accountNumber: '1000000002',
      firstName: 'King',
      lastName: 'Zero',
      walletId: 'WALLET2',
      username: 'king00',
      ajoUsername: 'king00',
      ajoActivated: true,
    };

    backendMocks.searchUsersByUsername.mockResolvedValue([candidate]);
    useStore.setState({ currentUser: creator, isAuthenticated: true, users: [creator], savingsGroups: [group] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /payyo/i }));
    fireEvent.change(screen.getByPlaceholderText(/search by username/i), { target: { value: 'king00' } });

    const suggestionButton = await screen.findByRole('button', { name: /king zero/i });
    fireEvent.click(suggestionButton);

    await waitFor(() => {
      expect(screen.getAllByText(/@king00/i).length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText(/@king00/i).length).toBeGreaterThan(0);
  });

  it('allows invited user to accept and choose slot count', async () => {
    const creator = buildUser();
    const invited: User = {
      ...buildUser(),
      id: 'u-2',
      firstName: 'King',
      lastName: 'Zero',
      username: 'king00',
      ajoUsername: 'king00',
      phone: '08000000002',
      email: 'king@example.com',
      accountNumber: '1000000002',
      walletId: 'WALLET2',
    };

    const group: SavingsGroup = {
      ...buildGroup(creator),
      members: [
        {
          ajoUsername: creator.ajoUsername || '',
          fullName: `${creator.firstName} ${creator.lastName}`,
          slots: 1,
          paymentMode: 'manual',
          accepted: true,
          contributions: [],
        },
        {
          ajoUsername: invited.ajoUsername || '',
          fullName: `${invited.firstName} ${invited.lastName}`,
          slots: 0,
          paymentMode: 'manual',
          accepted: false,
          contributions: [],
        },
      ],
      totalMembers: 5,
      payoutOrder: ['wes'],
    };

    useStore.setState({ currentUser: invited, isAuthenticated: true, users: [creator, invited], savingsGroups: [group] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /payyo/i }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));

    await waitFor(() => {
      expect(screen.getByText(/@king00 • 2 slot\(s\)/i)).toBeInTheDocument();
    });
    expect(screen.getAllByText(/accepted/i).length).toBeGreaterThan(0);
  });

  it('respects creator slots during group creation', async () => {
    const creator = buildUser();
    useStore.setState({ currentUser: creator, isAuthenticated: true, users: [creator], savingsGroups: [] });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /create group/i }));

    fireEvent.change(screen.getByPlaceholderText(/enter group name/i), { target: { value: 'slot-test' } });
    fireEvent.change(screen.getByPlaceholderText(/number of members/i), { target: { value: '5' } });
    fireEvent.change(screen.getByPlaceholderText(/how many slots you want/i), { target: { value: '3' } });
    fireEvent.change(screen.getByPlaceholderText(/weekly\/monthly amount/i), { target: { value: '10000' } });
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. monday/i), { target: { value: 'Monday' } });

    const nextMonday = getNextWeekday(1);
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement | null;
    expect(dateInput).not.toBeNull();
    if (!dateInput) return;
    fireEvent.change(dateInput, { target: { value: formatDateInput(nextMonday) } });
    fireEvent.change(screen.getByPlaceholderText(/duration in months/i), { target: { value: '1' } });

    fireEvent.click(screen.getByRole('button', { name: /^create group$/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /slot-test/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /slot-test/i }));
    expect(screen.getByText(/@wes • 3 slot\(s\)/i)).toBeInTheDocument();
  });
});
