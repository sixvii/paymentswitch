import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Transaction, Escrow, SavingsGroup, TrustScore, BillPayment, Loan, UserRequest, LoanApplicationDetails, ChatMessage, ChatResponderMode, PaymentCard, LockedFund, Notification } from '@/types';
import { clearBackendAuthToken, commitBackendBalance, createBackendUserRequest, respondBackendUserRequest, updateBackendUserPreferences, updateBackendUserState, fetchBackendNotifications, markBackendNotificationAsRead, markAllBackendNotificationsAsRead, deleteBackendNotification, syncBackendAjoGroup, removeBackendAjoGroup } from '@/lib/backendApi';

type LoanType = 'student' | 'business';

interface AppState {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  users: User[];
  balance: number;

  // Data
  transactions: Transaction[];
  escrows: Escrow[];
  loans: Loan[];
  savingsGroups: SavingsGroup[];
  billPayments: BillPayment[];
  cards: PaymentCard[];
  // lockedFunds removed from global state
  userRequests: UserRequest[];
  chatByUser: Record<string, ChatMessage[]>;
  chatUnreadByUser: Record<string, number>;
  chatResponderMode: ChatResponderMode;
  trustScore: TrustScore;
  notifications: Notification[];
  unreadNotificationCount: number;

  // Settings
  fontSize: number;

  // Actions
  setCurrentUser: (user: User | null) => void;
  upsertUser: (user: User) => void;
  registerUser: (user: User) => void;
  login: (phone: string, password: string) => boolean;
  logout: () => void;
  setBalance: (balance: number) => void;
  addTransaction: (tx: Transaction) => void;
  addEscrow: (escrow: Escrow) => Promise<{ success: boolean; message: string }>;
  updateEscrow: (id: string, updates: Partial<Escrow>) => Promise<{ success: boolean; message: string }>;
  addSavingsGroup: (group: SavingsGroup) => Promise<{ success: boolean; message: string }>;
  updateSavingsGroup: (id: string, updates: Partial<SavingsGroup>) => Promise<{ success: boolean; message: string }>;
  removeSavingsGroup: (id: string) => Promise<{ success: boolean; message: string }>;
  addBillPayment: (bill: BillPayment) => void;
  addCard: (payload: Omit<PaymentCard, 'id' | 'createdAt' | 'isDefault' | 'last4'> & { cardNumber: string }) => { success: boolean; message: string };
  removeCard: (cardId: string) => void;
  setDefaultCard: (cardId: string) => void;
  createLockedFund: (payload: { name?: string; amount: number; unlockDate: string; pin: string }) => Promise<{ success: boolean; message: string }>;
  addToLockedFund: (lockedFundId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  releaseLockedFund: (lockedFundId: string) => Promise<{ success: boolean; message: string }>;
  autoReleaseMaturedLockedFunds: () => Promise<{ releasedCount: number }>;
  updateTrustScore: (score: Partial<TrustScore>) => void;
  setFontSize: (size: number) => void;
  addNotification: (message: string) => void;
  markAllNotificationsRead: () => void;
  fetchNotifications: (limit?: number) => Promise<{ success: boolean; message: string }>;
  markNotificationAsRead: (notificationId: string) => Promise<{ success: boolean; message: string }>;
  removeNotification: (notificationId: string) => Promise<{ success: boolean; message: string }>;
  findUserByPhone: (phone: string) => User | undefined;
  findUserByAccount: (account: string) => User | undefined;
  findUserByUsername: (username: string) => User | undefined;
  activateAjo: (username: string) => void;
  activateEscrow: () => void;
  setAjoActivation: (enabled: boolean, pin?: string) => Promise<{ success: boolean; message: string }>;
  setPiggyActivation: (enabled: boolean, pin?: string) => Promise<{ success: boolean; message: string }>;
  setEscrowActivation: (enabled: boolean, pin?: string) => Promise<{ success: boolean; message: string }>;
  setProfileImage: (image: string) => void;
  getLoanLimit: (type: LoanType) => number;
  applyLoan: (type: LoanType, amount: number, applicationDetails?: LoanApplicationDetails) => Promise<{ success: boolean; message: string }>;
  repayLoan: (loanId: string) => Promise<{ success: boolean; message: string }>;
  createUserRequest: (payload: {
    type: UserRequest['type'];
    amount: number;
    requestedFromAccount: string;
    requesterPhone?: string;
    network?: string;
    note?: string;
  }) => Promise<{ success: boolean; message: string }>;
  respondToUserRequest: (requestId: string, amount: number) => Promise<{ success: boolean; message: string }>;
  declineUserRequest: (requestId: string) => Promise<{ success: boolean; message: string }>;
  sendChatMessage: (text: string) => { success: boolean; message: string };
  retryChatMessage: (messageId: string) => void;
  clearChatHistory: () => void;
  markChatAsRead: () => void;
  setChatResponderMode: (mode: ChatResponderMode) => void;
  ensureBotConversationStarter: () => void;
  processAjoAutoPayments: () => void;
  hydrateBackendState: (payload: {
    escrows?: Escrow[];
    savingsGroups?: SavingsGroup[];
    userRequests?: UserRequest[];
    lockedFunds?: LockedFund[];
    loans?: Loan[];
    trustScore?: TrustScore;
  }) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const normalize = (value: string) => value.trim().toLowerCase();

const getPerfectBusinessRepaymentCount = (loans: Loan[]) => loans.filter(
  (loan) => loan.type === 'business' && loan.status === 'repaid' && !!loan.repaidAt && new Date(loan.repaidAt).getTime() <= new Date(loan.dueDate).getTime(),
).length;

const computeLoanLimit = (creditScore: number, type: LoanType, perfectBusinessRepayments: number) => {
  if (type === 'student') {
    if (creditScore >= 650) return 100000;
    if (creditScore >= 500) return 50000;
    return 0;
  }

  if (creditScore >= 600) return 1000000 + (perfectBusinessRepayments * 100000);
  if (creditScore >= 500) return 500000;
  return 0;
};

const getWeeklyKey = (date: Date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
};

const isTestMode = import.meta.env.MODE === 'test';

const getBiweeklyBucket = (groupStartAt: string, date: Date) => {
  const created = new Date(groupStartAt);
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((date.getTime() - created.getTime()) / msPerDay);
  if (diffDays < 0) return -1;
  return Math.floor(diffDays / 14);
};

const isDueToday = (group: SavingsGroup, now: Date) => {
  const frequencyDay = normalize(group.frequencyDay);
  const scheduleAnchor = group.firstContributionDate || group.createdAt;
  const firstContributionDate = new Date(scheduleAnchor);
  firstContributionDate.setHours(0, 0, 0, 0);
  const nowAtMidnight = new Date(now);
  nowAtMidnight.setHours(0, 0, 0, 0);

  if (nowAtMidnight.getTime() < firstContributionDate.getTime()) return false;

  if (group.frequency === 'monthly') {
    const dayNumber = Number.parseInt(frequencyDay.replace(/\D/g, ''), 10);
    if (!Number.isFinite(dayNumber)) return false;
    return now.getDate() === dayNumber;
  }

  const expectedDay = dayNames[now.getDay()];
  if (frequencyDay !== expectedDay) return false;

  if (group.frequency === 'weekly') return true;

  const bucket = getBiweeklyBucket(scheduleAnchor, now);
  return bucket >= 0 && bucket % 2 === 0;
};

const isSameContributionPeriod = (group: SavingsGroup, contributionDate: Date, now: Date) => {
  if (group.frequency === 'monthly') {
    return (
      contributionDate.getFullYear() === now.getFullYear() &&
      contributionDate.getMonth() === now.getMonth()
    );
  }

  if (group.frequency === 'weekly') {
    return getWeeklyKey(contributionDate) === getWeeklyKey(now);
  }

  const scheduleAnchor = group.firstContributionDate || group.createdAt;
  return getBiweeklyBucket(scheduleAnchor, contributionDate) === getBiweeklyBucket(scheduleAnchor, now);
};

const getLatestContributionTimestampForCurrentPeriod = (group: SavingsGroup, members: SavingsGroup['members'], now: Date) => {
  const timestamps = members.flatMap((member) => member.contributions
    .filter((contribution) => (
      contribution.status === 'paid' &&
      contribution.memberUsername !== '__PAYOUT__' &&
      isSameContributionPeriod(group, new Date(contribution.date), now)
    ))
    .map((contribution) => new Date(contribution.date).getTime()));

  if (timestamps.length === 0) return null;
  return Math.max(...timestamps);
};

const normalizePayoutOrderBySlots = (members: SavingsGroup['members'], currentOrder: string[]) => {
  const acceptedSlotUsernames = members
    .filter((member) => member.accepted)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .flatMap((member) => Array.from({ length: Math.max(member.slots, 1) }, () => member.ajoUsername));

  const remaining = acceptedSlotUsernames.reduce<Record<string, number>>((acc, username) => {
    acc[username] = (acc[username] || 0) + 1;
    return acc;
  }, {});

  const kept: string[] = [];
  currentOrder.forEach((username) => {
    if ((remaining[username] || 0) <= 0) return;
    kept.push(username);
    remaining[username] -= 1;
  });

  const appended: string[] = [];
  acceptedSlotUsernames.forEach((username) => {
    if ((remaining[username] || 0) <= 0) return;
    appended.push(username);
    remaining[username] -= 1;
  });

  return [...kept, ...appended];
};

const getChatUserKey = (user: User | null) => user?.id || 'guest';

const getSupportReply = (text: string, mode: ChatResponderMode) => {
  const normalized = text.toLowerCase();

  if (mode === 'bot') {
    if (normalized.includes('send') || normalized.includes('transfer') || normalized.includes('receive')) {
      return 'For Send/Receive, confirm account number, receiver name lookup, and PIN step. Do you want to test QR scan flow too, or are you fixing a specific transfer error?';
    }
    if (normalized.includes('ajo')) {
      return 'For Ajo, check activation in Services, contribution schedule, payout mode, and member acceptance. Are you trying to create a group, pay contribution, or fix an activation issue?';
    }
    if (normalized.includes('escrow')) {
      return 'For Escrow, confirm both users are activated, seller wallet ID is correct, and release/dispute conditions are met. Should we troubleshoot create escrow, accept/decline, or release flow?';
    }
    if (normalized.includes('card')) {
      return 'For Cards, verify cardholder name, number format, expiry, brand detection, and default card behavior on Home. Do you want to fix add-card validation or card display styling?';
    }
    if (normalized.includes('request')) {
      return 'For Requests, verify create -> incoming -> approve/decline flow and balance update after approval. Are you testing cross-user requests or a specific approval/decline bug?';
    }
    if (normalized.includes('error') || normalized.includes('bug') || normalized.includes('fix') || normalized.includes('not working')) {
      return 'I can help fix it. Share: 1) page name, 2) exact error text, 3) steps to reproduce, and 4) expected result. I will guide the fastest fix path.';
    }
    return 'I can help with project features and issue fixes. Which feature are you working on: Send/Receive, Ajo, Escrow, Requests, Cards, or QR Scan? If it is an issue, share the exact error and the page.';
  }

  if (normalized.includes('yes') && normalized.includes('agent card')) {
    return 'Great. To connect Agent Card, open Cards page, add/select your card, set it as default, then return here and tell me "Agent Card connected" so I can guide your next test.';
  }
  if (normalized === 'yes' || normalized.includes('connect') || normalized.includes('proceed')) {
    return 'Perfect. Do you want to connect to Agent Card now? Reply "yes agent card" to continue, or tell me the feature you want to fix first.';
  }
  if (normalized === 'no' || normalized.includes('not now')) {
    return 'No problem. Tell me what you want to do next: test a feature (Send/Receive, Ajo, Escrow, Requests, Cards, QR Scan) or fix an issue.';
  }
  if (normalized.includes('failed') || normalized.includes('error') || normalized.includes('bug') || normalized.includes('fix')) {
    return 'Let us fix this quickly. Share: 1) page name, 2) exact error text, 3) the step that fails, and 4) expected result. I will guide the exact fix path.';
  }
  if (normalized.includes('send') || normalized.includes('transfer') || normalized.includes('receive')) {
    return 'For transfer issues, confirm receiver account lookup, amount validation, PIN confirmation, and success receipt flow. Are you blocked at account lookup, PIN, or commit step?';
  }
  if (normalized.includes('qr') || normalized.includes('scan')) {
    return 'For QR issues, confirm camera permission, QR payload format, account parsing, and redirect to send screen with full name lookup. Do you want to test with a sample payload?';
  }
  if (normalized.includes('request')) {
    return 'For Requests, verify create -> incoming -> approve/decline and balance update after approval. Are you testing cross-user flow or a specific status update issue?';
  }
  if (normalized.includes('refund') || normalized.includes('reverse')) {
    return 'For reversal requests, include the transaction ID and approximate time so support can investigate quickly.';
  }
  return 'Support is here. Do you want to connect to Agent Card now? Reply yes or no. You can also share the feature (Send/Receive, Ajo, Escrow, Requests, Cards, QR) or a bug to fix.';
};

const getStartOfDay = (date: Date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const parseDateInput = (value: string) => {
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
  const parsed = new Date(`${normalized}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const syncBackendStateAuthoritative = async (payload: {
  escrows?: Escrow[];
  savingsGroups?: SavingsGroup[];
  lockedFunds?: LockedFund[];
  loans?: Loan[];
  trustScore?: TrustScore;
}) => {
  await updateBackendUserState(payload);
};

let piggyAutoReleaseInFlight = false;

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      users: [],
      balance: 50000,
      transactions: [],
      escrows: [],
      loans: [],
      savingsGroups: [],
      billPayments: [],
      cards: [],
      // lockedFunds removed from global state
      userRequests: [],
      chatByUser: {},
      chatUnreadByUser: {},
      chatResponderMode: 'agent',
      trustScore: {
        overall: 450,
        transactionVolume: 60,
        savingsDiscipline: 50,
        escrowReliability: 70,
        billPaymentConsistency: 55,
      },
      notifications: [],
      unreadNotificationCount: 0,
      fontSize: 15,

      setCurrentUser: (user) => set({ currentUser: user, isAuthenticated: !!user }),

      hydrateBackendState: (payload) => set((state) => {
        const nextCurrentUser = state.currentUser
          ? { ...state.currentUser, lockedFunds: payload.lockedFunds || state.currentUser.lockedFunds || [] }
          : state.currentUser;

        return {
          currentUser: nextCurrentUser,
          users: state.users.map((entry) => (
            entry.id === nextCurrentUser?.id
              ? { ...entry, lockedFunds: nextCurrentUser.lockedFunds || [] }
              : entry
          )),
          escrows: payload.escrows || state.escrows,
          savingsGroups: payload.savingsGroups || state.savingsGroups,
          userRequests: payload.userRequests || state.userRequests,
          loans: payload.loans || state.loans,
          trustScore: payload.trustScore || state.trustScore,
        };
      }),

      upsertUser: (user) => set((state) => {
        const existingIndex = state.users.findIndex((entry) => entry.id === user.id || entry.phone === user.phone);
        if (existingIndex === -1) {
          return { users: [...state.users, user] };
        }

        const users = [...state.users];
        users[existingIndex] = { ...users[existingIndex], ...user };
        return { users };
      }),

      registerUser: (user) => {
        const userWithLockedFunds = {
          ...user,
          lockedFunds: user.lockedFunds ?? [],
        };
        set((state) => ({
          users: [...state.users, userWithLockedFunds],
          currentUser: userWithLockedFunds,
          isAuthenticated: true,
          balance: 50000,
        }));
      },

      login: (phone, password) => {
        const user = get().users.find(u => u.phone === phone && u.password === password);
        if (user) {
          set({ currentUser: user, isAuthenticated: true });
          return true;
        }
        return false;
      },

      logout: () => {
        clearBackendAuthToken();
        set({ currentUser: null, isAuthenticated: false });
      },

      setBalance: (balance) => set({ balance }),

      addTransaction: (tx) => set((state) => ({
        transactions: [tx, ...state.transactions],
      })),

      addEscrow: async (escrow) => {
        const escrows = [escrow, ...get().escrows];
        try {
          await syncBackendStateAuthoritative({ escrows });
          set({ escrows });
          return { success: true, message: 'Escrow saved' };
        } catch {
          return { success: false, message: 'Unable to save escrow right now. Please try again.' };
        }
      },

      updateEscrow: async (id, updates) => {
        const escrows = get().escrows.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry));
        try {
          await syncBackendStateAuthoritative({ escrows });
          set({ escrows });
          return { success: true, message: 'Escrow updated' };
        } catch {
          return { success: false, message: 'Unable to update escrow right now. Please try again.' };
        }
      },

      addSavingsGroup: async (group) => {
        try {
          const syncedState = await syncBackendAjoGroup(group);
          set({ savingsGroups: syncedState.savingsGroups || [group, ...get().savingsGroups] });
          return { success: true, message: 'Ajo group created' };
        } catch {
          if (isTestMode) {
            set({ savingsGroups: [group, ...get().savingsGroups] });
            return { success: true, message: 'Ajo group created (test fallback)' };
          }
          return { success: false, message: 'Unable to save Ajo group right now. Please try again.' };
        }
      },

      updateSavingsGroup: async (id, updates) => {
        const savingsGroups = get().savingsGroups.map(g => g.id === id ? { ...g, ...updates } : g);
        const updatedGroup = savingsGroups.find((group) => group.id === id);
        if (!updatedGroup) {
          return { success: false, message: 'Ajo group not found' };
        }
        try {
          const syncedState = await syncBackendAjoGroup(updatedGroup);
          set({ savingsGroups: syncedState.savingsGroups || savingsGroups });
          return { success: true, message: 'Ajo group updated' };
        } catch {
          if (isTestMode) {
            set({ savingsGroups });
            return { success: true, message: 'Ajo group updated (test fallback)' };
          }
          return { success: false, message: 'Unable to update Ajo group right now. Please try again.' };
        }
      },

      removeSavingsGroup: async (id) => {
        try {
          const syncedState = await removeBackendAjoGroup(id);
          set({ savingsGroups: syncedState.savingsGroups || get().savingsGroups.filter(g => g.id !== id) });
          return { success: true, message: 'Ajo group deleted' };
        } catch {
          if (isTestMode) {
            set({ savingsGroups: get().savingsGroups.filter((g) => g.id !== id) });
            return { success: true, message: 'Ajo group deleted (test fallback)' };
          }
          return { success: false, message: 'Unable to delete Ajo group right now. Please try again.' };
        }
      },

      addBillPayment: (bill) => set((state) => ({
        billPayments: [bill, ...state.billPayments],
      })),

      addCard: ({ cardNumber, cardholderName, expiryMonth, expiryYear, brand }) => {
        const digits = cardNumber.replace(/\D/g, '');
        const currentUser = get().currentUser;
        const fullName = `${currentUser?.firstName || ''} ${currentUser?.lastName || ''}`.trim();
        if (digits.length < 12 || digits.length > 19) return { success: false, message: 'Enter a valid card number' };
        if (!fullName) return { success: false, message: 'Unable to resolve cardholder name. Please login again.' };
        if (!/^\d{2}$/.test(expiryMonth) || Number(expiryMonth) < 1 || Number(expiryMonth) > 12) {
          return { success: false, message: 'Enter a valid expiry month' };
        }
        if (!/^\d{2}$/.test(expiryYear)) return { success: false, message: 'Enter a valid expiry year' };

        const last4 = digits.slice(-4);
        const newCard: PaymentCard = {
          id: generateId(),
          cardholderName: fullName,
          last4,
          expiryMonth,
          expiryYear,
          brand,
          isDefault: true,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          ...state,
          cards: [newCard, ...state.cards.map((card) => ({ ...card, isDefault: false }))],
        }));

        return { success: true, message: 'Card added successfully' };
      },

      removeCard: (cardId) => set((state) => {
        const target = state.cards.find((card) => card.id === cardId);
        const remaining = state.cards.filter((card) => card.id !== cardId);
        if (target?.isDefault && remaining.length > 0) {
          return {
            ...state,
            cards: remaining.map((card, index) => ({ ...card, isDefault: index === 0 || card.isDefault })),
          };
        }
        return {
          ...state,
          cards: remaining,
        };
      }),

      setDefaultCard: (cardId) => set((state) => ({
        ...state,
        cards: state.cards.map((card) => ({
          ...card,
          isDefault: card.id === cardId,
        })),
      })),

      createLockedFund: async ({ name, amount, unlockDate, pin }) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };
        if (pin !== state.currentUser.pin) return { success: false, message: 'Incorrect PIN' };
        if (!state.currentUser.piggyActivated) return { success: false, message: 'Activate Piggy in Services first' };
        if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'Enter a valid amount' };
        if (amount > state.balance) return { success: false, message: 'Insufficient main balance' };

        const unlockAt = parseDateInput(unlockDate);
        if (!unlockAt) return { success: false, message: 'Select a valid unlock date' };

        const today = getStartOfDay(new Date());
        if (unlockAt.getTime() < today.getTime()) {
          return { success: false, message: 'Unlock date cannot be in the past' };
        }

        const lockedFund: LockedFund = {
          id: generateId(),
          name: name?.trim() || 'Piggy Savings',
          amount,
          unlockDate: unlockAt.toISOString(),
          createdAt: new Date().toISOString(),
          status: 'locked',
        };

        const lockedFunds = [lockedFund, ...(state.currentUser.lockedFunds || [])];
        let committedBalance = state.balance;

        try {
          committedBalance = await commitBackendBalance(state.balance - amount, state.balance);
        } catch {
          if (isTestMode) {
            committedBalance = state.balance - amount;
          } else {
            return { success: false, message: 'Unable to update account balance right now. Please try again.' };
          }
        }

        try {
          await syncBackendStateAuthoritative({ lockedFunds });
        } catch {
          if (!isTestMode) {
            return { success: false, message: 'Unable to save Piggy plan right now. Please try again.' };
          }
        }

        set((current) => {
          const updatedUsers = current.users.map(u =>
            u.id === current.currentUser?.id
              ? { ...u, lockedFunds }
              : u
          );
          return {
            ...current,
            balance: committedBalance,
            users: updatedUsers,
            currentUser: {
              ...current.currentUser!,
              lockedFunds,
            },
            notifications: [
              {
                id: generateId(),
                message: `Piggy funded with ₦${amount.toLocaleString()} until ${unlockAt.toLocaleDateString('en-NG')}`,
                read: false,
                timestamp: new Date().toISOString(),
              },
              ...current.notifications,
            ],
          };
        });

        return { success: true, message: 'Piggy plan created successfully' };
      },

      addToLockedFund: async (lockedFundId, amount) => {
        const state = get();
        if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'Enter a valid top-up amount' };
        if (amount > state.balance) return { success: false, message: 'Insufficient main balance' };

        const userFunds = state.currentUser?.lockedFunds || [];
        const target = userFunds.find((entry) => entry.id === lockedFundId);
        if (!target) return { success: false, message: 'Piggy plan not found' };
        if (target.status === 'released') return { success: false, message: 'This Piggy plan is already released' };

        const unlockAt = new Date(target.unlockDate);
        const now = new Date();
        if (now.getTime() >= unlockAt.getTime()) {
          return { success: false, message: 'Cannot add money on or after unlock date' };
        }

        const updatedFunds = userFunds.map((entry) => (
          entry.id === lockedFundId
            ? { ...entry, amount: entry.amount + amount }
            : entry
        ));

        let committedBalance = state.balance;
        try {
          committedBalance = await commitBackendBalance(state.balance - amount, state.balance);
        } catch {
          return { success: false, message: 'Unable to update account balance right now. Please try again.' };
        }

        try {
          await syncBackendStateAuthoritative({ lockedFunds: updatedFunds });
        } catch {
          return { success: false, message: 'Unable to update Piggy plan right now. Please try again.' };
        }

        set((current) => {
          const updatedUsers = current.users.map(u =>
            u.id === current.currentUser?.id
              ? { ...u, lockedFunds: updatedFunds }
              : u
          );
          return {
            ...current,
            balance: committedBalance,
            users: updatedUsers,
            currentUser: {
              ...current.currentUser!,
              lockedFunds: updatedFunds,
            },
            notifications: [
              {
                id: generateId(),
                message: `Added ₦${amount.toLocaleString()} to ${target.name}`,
                read: false,
                timestamp: new Date().toISOString(),
              },
              ...current.notifications,
            ],
          };
        });

        return { success: true, message: 'Piggy plan updated successfully' };
      },

      releaseLockedFund: async (lockedFundId) => {
        const state = get();
        const userFunds = state.currentUser?.lockedFunds || [];
        const target = userFunds.find((entry) => entry.id === lockedFundId);
        if (!target) return { success: false, message: 'Piggy plan not found' };
        if (target.status === 'released') return { success: false, message: 'This locked fund has already been moved' };

        const now = new Date();
        const unlockAt = new Date(target.unlockDate);
        if (now.getTime() < unlockAt.getTime()) {
          return { success: false, message: 'Unlock date has not been reached yet' };
        }

        const updatedFunds = userFunds.map((entry) => (
          entry.id === lockedFundId
            ? { ...entry, status: 'released', releasedAt: now.toISOString() }
            : entry
        ));

        let committedBalance = state.balance;
        try {
          committedBalance = await commitBackendBalance(state.balance + target.amount, state.balance);
        } catch {
          return { success: false, message: 'Unable to update account balance right now. Please try again.' };
        }

        try {
          await syncBackendStateAuthoritative({ lockedFunds: updatedFunds });
        } catch {
          return { success: false, message: 'Unable to release Piggy funds right now. Please try again.' };
        }

        set((current) => {
          const updatedUsers = current.users.map(u =>
            u.id === current.currentUser?.id
              ? { ...u, lockedFunds: updatedFunds }
              : u
          );
          return {
            ...current,
            balance: committedBalance,
            users: updatedUsers,
            currentUser: {
              ...current.currentUser!,
              lockedFunds: updatedFunds,
            },
            notifications: [
              {
                id: generateId(),
                message: `Moved ₦${target.amount.toLocaleString()} from ${target.name} to main balance`,
                read: false,
                timestamp: now.toISOString(),
              },
              ...current.notifications,
            ],
          };
        });

        return { success: true, message: 'Funds moved to main balance' };
      },

      autoReleaseMaturedLockedFunds: async () => {
        if (piggyAutoReleaseInFlight) return { releasedCount: 0 };

        const state = get();
        if (!state.currentUser) return { releasedCount: 0 };

        const now = new Date();
        const nowIso = now.toISOString();
        const userFunds = state.currentUser.lockedFunds || [];
        const maturedFunds = userFunds.filter((entry) => (
          entry.status === 'locked' && new Date(entry.unlockDate).getTime() <= now.getTime()
        ));

        if (maturedFunds.length === 0) return { releasedCount: 0 };

        const totalReleaseAmount = maturedFunds.reduce((sum, entry) => sum + entry.amount, 0);
        if (totalReleaseAmount <= 0) return { releasedCount: 0 };

        const maturedFundIds = new Set(maturedFunds.map((entry) => entry.id));
        const updatedFunds = userFunds.map((entry) => (
          maturedFundIds.has(entry.id)
            ? { ...entry, status: 'released', releasedAt: nowIso }
            : entry
        ));

        piggyAutoReleaseInFlight = true;

        try {
          const committedBalance = await commitBackendBalance(state.balance + totalReleaseAmount, state.balance);
          await syncBackendStateAuthoritative({ lockedFunds: updatedFunds });

          set((current) => {
            if (!current.currentUser || current.currentUser.id !== state.currentUser?.id) return current;

            const updatedUsers = current.users.map((u) => (
              u.id === current.currentUser?.id
                ? { ...u, lockedFunds: updatedFunds }
                : u
            ));

            const maturedPlansLabel = maturedFunds.length === 1 ? maturedFunds[0].name : `${maturedFunds.length} Piggy plans`;

            return {
              ...current,
              balance: committedBalance,
              users: updatedUsers,
              currentUser: {
                ...current.currentUser,
                lockedFunds: updatedFunds,
              },
              notifications: [
                {
                  id: generateId(),
                  message: `${maturedPlansLabel} matured. ₦${totalReleaseAmount.toLocaleString()} moved to main balance.`,
                  read: false,
                  timestamp: nowIso,
                },
                ...current.notifications,
              ],
            };
          });

          return { releasedCount: maturedFunds.length };
        } catch {
          return { releasedCount: 0 };
        } finally {
          piggyAutoReleaseInFlight = false;
        }
      },

      updateTrustScore: (score) => set((state) => ({
        trustScore: { ...state.trustScore, ...score },
      })),

      setFontSize: (fontSize) => set({ fontSize }),


      addNotification: (message) => set((state) => ({
        notifications: [{ id: generateId(), userId: state.currentUser?.id || '', type: 'alert', title: 'Notification', message, data: {}, read: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...state.notifications],
      })),

      markAllNotificationsRead: () => {
        void markAllBackendNotificationsAsRead().catch(() => {
          // Keep local fallback even if backend request fails.
        });

        set((state) => ({
          notifications: state.notifications.map(n => n.read ? n : { ...n, read: true }),
          unreadNotificationCount: 0,
        }));
      },

      fetchNotifications: async (limit = 50) => {
        try {
          const { notifications, unreadCount } = await fetchBackendNotifications(limit);
          set({
            notifications,
            unreadNotificationCount: unreadCount,
          });
          return { success: true, message: 'Notifications loaded' };
        } catch (error) {
          return { success: false, message: error instanceof Error ? error.message : 'Failed to fetch notifications' };
        }
      },

      markNotificationAsRead: async (notificationId) => {
        try {
          const notification = await markBackendNotificationAsRead(notificationId);
          set((state) => ({
            notifications: state.notifications.map(n =>
              n.id === notificationId ? { ...n, read: true } : n,
            ),
            unreadNotificationCount: Math.max(0, state.unreadNotificationCount - 1),
          }));
          return { success: true, message: 'Notification marked as read' };
        } catch (error) {
          return { success: false, message: error instanceof Error ? error.message : 'Failed to mark notification' };
        }
      },

      removeNotification: async (notificationId) => {
        try {
          await deleteBackendNotification(notificationId);
          set((state) => ({
            notifications: state.notifications.filter(n => n.id !== notificationId),
            unreadNotificationCount: Math.max(0, state.unreadNotificationCount - (state.notifications.find(n => n.id === notificationId)?.read ? 0 : 1)),
          }));
          return { success: true, message: 'Notification deleted' };
        } catch (error) {
          return { success: false, message: error instanceof Error ? error.message : 'Failed to delete notification' };
        }
      },

      findUserByPhone: (phone) => get().users.find(u => u.phone === phone),

      findUserByAccount: (account) => get().users.find(u => u.accountNumber === account),

      findUserByUsername: (username) => {
        const needle = username.trim().toLowerCase();
        return get().users.find(u => u.username.toLowerCase() === needle);
      },

      activateAjo: (username) => set((state) => ({
        currentUser: state.currentUser ? { ...state.currentUser, ajoUsername: username, ajoActivated: true } : null,
        users: state.users.map(u => u.id === state.currentUser?.id ? { ...u, ajoUsername: username, ajoActivated: true } : u),
      })),

      activateEscrow: () => set((state) => {
        const escrowWalletId = 'ESC-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        return {
          currentUser: state.currentUser ? { ...state.currentUser, escrowActivated: true, escrowWalletId } : null,
          users: state.users.map(u => u.id === state.currentUser?.id ? { ...u, escrowActivated: true, escrowWalletId } : u),
        };
      }),

      setAjoActivation: async (enabled, pin) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };

        const ajoUsername = state.currentUser.ajoUsername || state.currentUser.username;
        try {
          const updatedUser = await updateBackendUserPreferences({
            ajoActivated: enabled,
            ajoUsername,
            pin,
          });

          set((current) => ({
            currentUser: current.currentUser
              ? {
                  ...current.currentUser,
                  ...updatedUser,
                  pin: updatedUser.pin || current.currentUser.pin,
                  password: updatedUser.password || current.currentUser.password,
                }
              : null,
            users: current.users.map((u) => (
              u.id === updatedUser.id
                ? {
                    ...u,
                    ...updatedUser,
                    pin: updatedUser.pin || u.pin,
                    password: updatedUser.password || u.password,
                  }
                : u
            )),
          }));
          return { success: true, message: enabled ? 'Ajo activated' : 'Ajo deactivated' };
        } catch {
          return { success: false, message: 'Unable to update Ajo activation right now.' };
        }
      },

      setPiggyActivation: async (enabled, pin) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };

        try {
          const updatedUser = await updateBackendUserPreferences({
            piggyActivated: enabled,
            pin,
          });

          set((current) => ({
            currentUser: current.currentUser
              ? {
                  ...current.currentUser,
                  ...updatedUser,
                  pin: updatedUser.pin || current.currentUser.pin,
                  password: updatedUser.password || current.currentUser.password,
                }
              : null,
            users: current.users.map((u) => (
              u.id === updatedUser.id
                ? {
                    ...u,
                    ...updatedUser,
                    pin: updatedUser.pin || u.pin,
                    password: updatedUser.password || u.password,
                  }
                : u
            )),
          }));
          return { success: true, message: enabled ? 'Piggy activated' : 'Piggy deactivated' };
        } catch {
          return { success: false, message: 'Unable to update Piggy activation right now.' };
        }
      },

      setEscrowActivation: async (enabled, pin) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };

        const escrowWalletId = enabled
          ? (state.currentUser.escrowWalletId || ('ESC-' + Math.random().toString(36).substring(2, 10).toUpperCase()))
          : undefined;

        try {
          const updatedUser = await updateBackendUserPreferences({
            escrowActivated: enabled,
            escrowWalletId,
            pin,
          });

          set((current) => ({
            currentUser: current.currentUser
              ? {
                  ...current.currentUser,
                  ...updatedUser,
                  pin: updatedUser.pin || current.currentUser.pin,
                  password: updatedUser.password || current.currentUser.password,
                }
              : null,
            users: current.users.map((u) => (
              u.id === updatedUser.id
                ? {
                    ...u,
                    ...updatedUser,
                    pin: updatedUser.pin || u.pin,
                    password: updatedUser.password || u.password,
                  }
                : u
            )),
          }));
          return { success: true, message: enabled ? 'Escrow activated' : 'Escrow deactivated' };
        } catch {
          return { success: false, message: 'Unable to update Escrow activation right now.' };
        }
      },

      setProfileImage: (image) => set((state) => {
        if (!state.currentUser) return state;
        return {
          currentUser: {
            ...state.currentUser,
            profileImage: image,
          },
          users: state.users.map((u) => (
            u.id === state.currentUser?.id
              ? { ...u, profileImage: image }
              : u
          )),
        };
      }),

      getLoanLimit: (type) => {
        const state = get();
        if (!state.currentUser) return 0;
        const myLoans = state.loans.filter((loan) => loan.borrowerId === state.currentUser?.id);
        const perfectBusinessRepayments = getPerfectBusinessRepaymentCount(myLoans);
        return computeLoanLimit(state.trustScore.overall, type, perfectBusinessRepayments);
      },

      applyLoan: async (type, amount, applicationDetails) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };
        if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'Enter a valid amount' };

        const hasActiveLoan = state.loans.some(
          (loan) => loan.borrowerId === state.currentUser?.id && loan.status === 'active',
        );
        if (hasActiveLoan) return { success: false, message: 'Repay your active loan before applying again' };

        const myLoans = state.loans.filter((loan) => loan.borrowerId === state.currentUser?.id);
        const perfectBusinessRepayments = getPerfectBusinessRepaymentCount(myLoans);
        const maxLimit = computeLoanLimit(state.trustScore.overall, type, perfectBusinessRepayments);

        if (maxLimit <= 0) return { success: false, message: 'Your credit score is too low for this loan right now' };
        if (amount > maxLimit) return { success: false, message: `Maximum available for this loan is ₦${maxLimit.toLocaleString()}` };

        const now = new Date();
        const dueDate = new Date(now);
        dueDate.setDate(dueDate.getDate() + (type === 'student' ? 30 : 60));

        const loanId = generateId();
        const nowIso = now.toISOString();
        const borrowerName = `${state.currentUser.firstName} ${state.currentUser.lastName}`;

        let committedBalance = state.balance;
        try {
          committedBalance = await commitBackendBalance(state.balance + amount, state.balance);
        } catch {
          return { success: false, message: 'Unable to update account balance right now. Please try again.' };
        }

        set((current) => ({
          ...current,
          balance: committedBalance,
          loans: [
            {
              id: loanId,
              borrowerId: state.currentUser!.id,
              borrowerName,
              type,
              amount,
              applicationDetails,
              status: 'active',
              createdAt: nowIso,
              dueDate: dueDate.toISOString(),
            },
            ...current.loans,
          ],
          transactions: [
            {
              id: generateId(),
              type: 'receive',
              amount,
              senderAccount: 'LOAN-FUND',
              receiverAccount: state.currentUser!.accountNumber,
              senderName: 'Inter-pay Loans',
              receiverName: borrowerName,
              description: `${type === 'student' ? 'Student' : 'Business'} loan disbursement`,
              status: 'success',
              timestamp: nowIso,
            },
            ...current.transactions,
          ],
          notifications: [
            {
              id: generateId(),
              message: `Loan approved: ₦${amount.toLocaleString()} (${type})`,
              read: false,
              timestamp: nowIso,
            },
            ...current.notifications,
          ],
        }));

        try {
          const latest = get();
          await syncBackendStateAuthoritative({
            loans: latest.loans,
            trustScore: latest.trustScore,
          });
        } catch {
          return { success: false, message: 'Loan was created locally but failed to sync. Please refresh.' };
        }

        return { success: true, message: 'Loan granted successfully' };
      },

      repayLoan: async (loanId) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };

        const loan = state.loans.find((entry) => entry.id === loanId && entry.borrowerId === state.currentUser?.id);
        if (!loan) return { success: false, message: 'Loan not found' };
        if (loan.status !== 'active') return { success: false, message: 'This loan is not active' };
        if (state.balance < loan.amount) return { success: false, message: 'Insufficient balance to repay this loan' };

        const now = new Date();
        const nowIso = now.toISOString();
        const wasPerfect = now.getTime() <= new Date(loan.dueDate).getTime();
        const trustIncrease = wasPerfect ? 15 : 5;

        let committedBalance = state.balance;
        try {
          committedBalance = await commitBackendBalance(state.balance - loan.amount, state.balance);
        } catch {
          return { success: false, message: 'Unable to update account balance right now. Please try again.' };
        }

        set((current) => ({
          ...current,
          balance: committedBalance,
          loans: current.loans.map((entry) => (
            entry.id === loan.id
              ? { ...entry, status: 'repaid', repaidAt: nowIso }
              : entry
          )),
          transactions: [
            {
              id: generateId(),
              type: 'send',
              amount: loan.amount,
              senderAccount: state.currentUser!.accountNumber,
              receiverAccount: 'LOAN-FUND',
              senderName: `${state.currentUser!.firstName} ${state.currentUser!.lastName}`,
              receiverName: 'Inter-pay Loans',
              description: `Loan repayment (${loan.type})`,
              status: 'success',
              timestamp: nowIso,
            },
            ...current.transactions,
          ],
          notifications: [
            {
              id: generateId(),
              message: `Loan repaid successfully: ₦${loan.amount.toLocaleString()}`,
              read: false,
              timestamp: nowIso,
            },
            ...current.notifications,
          ],
          trustScore: {
            ...current.trustScore,
            overall: Math.min(850, current.trustScore.overall + trustIncrease),
          },
        }));

        try {
          const latest = get();
          await syncBackendStateAuthoritative({
            loans: latest.loans,
            trustScore: latest.trustScore,
          });
        } catch {
          return { success: false, message: 'Loan repayment synced partially. Please refresh and retry if needed.' };
        }

        return { success: true, message: wasPerfect ? 'Loan repaid perfectly. Your loan limit may increase.' : 'Loan repaid successfully' };
      },

      createUserRequest: async ({ type, amount, requestedFromAccount, requesterPhone, network, note }) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };
        if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'Enter a valid request amount' };

        const normalizedAccount = requestedFromAccount.trim();
        if (!normalizedAccount) return { success: false, message: 'Enter the account number you are requesting from' };

        const normalizedNetwork = network?.trim();
        const normalizedRequesterPhone = requesterPhone?.trim();
        if ((type === 'airtime' || type === 'data') && !normalizedNetwork) {
          return { success: false, message: 'Select a network provider' };
        }
        if ((type === 'airtime' || type === 'data') && !normalizedRequesterPhone) {
          return { success: false, message: 'Enter requester phone number for airtime/data' };
        }
        if ((type === 'airtime' || type === 'data') && normalizedRequesterPhone && !/^\d{10,15}$/.test(normalizedRequesterPhone)) {
          return { success: false, message: 'Enter a valid requester phone number' };
        }

        let createdRequest: UserRequest;

        try {
          createdRequest = await createBackendUserRequest({
            type,
            amount,
            requestedFromAccount: normalizedAccount,
            requesterPhone: normalizedRequesterPhone,
            network: normalizedNetwork,
            note,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to send request right now. Please try again.';
          return { success: false, message };
        }

        if (!createdRequest) {
          return { success: false, message: 'Unable to send request right now. Please try again.' };
        }

        set((current) => ({
          ...current,
          userRequests: [createdRequest, ...current.userRequests.filter((entry) => entry.id !== createdRequest.id)],
          notifications: [
            {
              id: generateId(),
              message: `Request sent to ${createdRequest.requestedFromName}: ${type} - ₦${amount.toLocaleString()}`,
              read: false,
              timestamp: new Date().toISOString(),
            },
            ...current.notifications,
          ],
        }));

        return { success: true, message: 'Request sent successfully' };
      },

      respondToUserRequest: async (requestId, amount) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };
        if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: 'Enter a valid amount to send' };

        const request = state.userRequests.find((entry) => entry.id === requestId);
        if (!request) return { success: false, message: 'Request not found' };
        if (request.status !== 'pending') return { success: false, message: 'This request has already been handled' };
        if (request.requestedFromAccount !== state.currentUser.accountNumber) {
          return { success: false, message: 'You can only respond to requests sent to your account' };
        }

        let response: { request: UserRequest; balance: number };

        try {
          response = await respondBackendUserRequest(requestId, { action: 'approve', amount });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to respond to request right now. Please try again.';
          return { success: false, message };
        }

        if (!response) {
          return { success: false, message: 'Unable to respond to request right now. Please try again.' };
        }

        set((current) => ({
          ...current,
          userRequests: current.userRequests.map((entry) => (
            entry.id === response.request.id ? response.request : entry
          )),
          balance: response.balance,
          notifications: [
            {
              id: generateId(),
              message: `You responded to ${request.requesterName}'s ${request.type} request with ₦${amount.toLocaleString()}`,
              read: false,
              timestamp: new Date().toISOString(),
            },
            ...current.notifications,
          ],
        }));

        return { success: true, message: 'Request response sent successfully' };
      },

      declineUserRequest: async (requestId) => {
        const state = get();
        if (!state.currentUser) return { success: false, message: 'Please login first' };

        const request = state.userRequests.find((entry) => entry.id === requestId);
        if (!request) return { success: false, message: 'Request not found' };
        if (request.status !== 'pending') return { success: false, message: 'This request has already been handled' };
        if (request.requestedFromAccount !== state.currentUser.accountNumber) {
          return { success: false, message: 'You can only decline requests sent to your account' };
        }

        let response: { request: UserRequest; balance: number };

        try {
          response = await respondBackendUserRequest(requestId, { action: 'decline' });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unable to decline request right now. Please try again.';
          return { success: false, message };
        }

        if (!response) {
          return { success: false, message: 'Unable to decline request right now. Please try again.' };
        }

        set((current) => ({
          ...current,
          userRequests: current.userRequests.map((entry) => (
            entry.id === response.request.id ? response.request : entry
          )),
          notifications: [
            {
              id: generateId(),
              message: `You declined ${request.requesterName}'s ${request.type} request`,
              read: false,
              timestamp: new Date().toISOString(),
            },
            ...current.notifications,
          ],
        }));

        return { success: true, message: 'Request declined' };
      },

      sendChatMessage: (text) => {
        const state = get();
        const trimmed = text.trim();
        if (!trimmed) return { success: false, message: 'Message cannot be empty' };

        const userKey = getChatUserKey(state.currentUser);
        const clientMessageId = `chat-${generateId()}`;
        const nowIso = new Date().toISOString();

        set((current) => ({
          ...current,
          chatByUser: {
            ...current.chatByUser,
            [userKey]: [
              ...(current.chatByUser[userKey] || []),
              {
                id: clientMessageId,
                text: trimmed,
                sender: 'me',
                timestamp: nowIso,
                status: 'sending',
              },
            ],
          },
        }));

        const sendDelayMs = 250 + Math.floor(Math.random() * 350);
        setTimeout(() => {
          const shouldFail = Math.random() < 0.08;
          set((current) => ({
            ...current,
            chatByUser: {
              ...current.chatByUser,
              [userKey]: (current.chatByUser[userKey] || []).map((entry) => (
                entry.id === clientMessageId
                  ? { ...entry, status: shouldFail ? 'failed' : 'sent' }
                  : entry
              )),
            },
          }));

          if (shouldFail) return;

          const replyDelayMs = state.chatResponderMode === 'bot'
            ? 500 + Math.floor(Math.random() * 700)
            : 1200 + Math.floor(Math.random() * 1100);

          setTimeout(() => {
            const currentState = get();
            const responderMode = currentState.chatResponderMode;
            const supportReply = getSupportReply(trimmed, responderMode);

            set((current) => ({
              ...current,
              chatByUser: {
                ...current.chatByUser,
                [userKey]: [
                  ...(current.chatByUser[userKey] || []),
                  {
                    id: `chat-${generateId()}`,
                    text: supportReply,
                    sender: 'support',
                    timestamp: new Date().toISOString(),
                    status: 'received',
                  },
                ],
              },
              chatUnreadByUser: {
                ...current.chatUnreadByUser,
                [userKey]: (current.chatUnreadByUser[userKey] || 0) + 1,
              },
            }));
          }, replyDelayMs);
        }, sendDelayMs);

        return { success: true, message: 'Message queued' };
      },

      retryChatMessage: (messageId) => {
        const state = get();
        const userKey = getChatUserKey(state.currentUser);
        const failedMessage = (state.chatByUser[userKey] || []).find((entry) => entry.id === messageId && entry.status === 'failed');
        if (!failedMessage) return;

        set((current) => ({
          ...current,
          chatByUser: {
            ...current.chatByUser,
            [userKey]: (current.chatByUser[userKey] || []).map((entry) => (
              entry.id === messageId ? { ...entry, status: 'sending', timestamp: new Date().toISOString() } : entry
            )),
          },
        }));

        const resendDelayMs = 300 + Math.floor(Math.random() * 250);
        setTimeout(() => {
          set((current) => ({
            ...current,
            chatByUser: {
              ...current.chatByUser,
              [userKey]: (current.chatByUser[userKey] || []).map((entry) => (
                entry.id === messageId ? { ...entry, status: 'sent' } : entry
              )),
            },
          }));

          const currentState = get();
          const supportReply = getSupportReply(failedMessage.text, currentState.chatResponderMode);
          const replyDelayMs = currentState.chatResponderMode === 'bot' ? 600 : 1300;

          setTimeout(() => {
            set((current) => ({
              ...current,
              chatByUser: {
                ...current.chatByUser,
                [userKey]: [
                  ...(current.chatByUser[userKey] || []),
                  {
                    id: `chat-${generateId()}`,
                    text: supportReply,
                    sender: 'support',
                    timestamp: new Date().toISOString(),
                    status: 'received',
                  },
                ],
              },
              chatUnreadByUser: {
                ...current.chatUnreadByUser,
                [userKey]: (current.chatUnreadByUser[userKey] || 0) + 1,
              },
            }));
          }, replyDelayMs);
        }, resendDelayMs);
      },

      clearChatHistory: () => {
        const state = get();
        const userKey = getChatUserKey(state.currentUser);
        set((current) => ({
          ...current,
          chatByUser: {
            ...current.chatByUser,
            [userKey]: [],
          },
          chatUnreadByUser: {
            ...current.chatUnreadByUser,
            [userKey]: 0,
          },
        }));
      },

      markChatAsRead: () => {
        const state = get();
        const userKey = getChatUserKey(state.currentUser);
        set((current) => ({
          ...current,
          chatUnreadByUser: {
            ...current.chatUnreadByUser,
            [userKey]: 0,
          },
        }));
      },

      setChatResponderMode: (mode) => set((state) => ({
        ...state,
        chatResponderMode: mode,
      })),

      ensureBotConversationStarter: () => {
        const state = get();
        const userKey = getChatUserKey(state.currentUser);
        const existingMessages = state.chatByUser[userKey] || [];
        const botStarterSignature = 'Hi, I am the Inter-pay bot.';
        const agentStarterSignature = 'Hi, I am your Inter-pay support agent.';

        const hasCurrentModeStarter = existingMessages.some((entry) => {
          if (entry.sender !== 'support') return false;
          if (state.chatResponderMode === 'bot') return entry.text.includes(botStarterSignature);
          return entry.text.includes(agentStarterSignature);
        });

        if (hasCurrentModeStarter) return;

        const starterText = state.chatResponderMode === 'bot'
          ? 'Hi, I am the Inter-pay bot. I can walk you through features and help fix issues. What do you want to work on: Send/Receive, Ajo, Escrow, Requests, Cards, or QR Scan?'
          : 'Hi, I am your Inter-pay support agent. Do you want to connect to Agent Card now? Reply yes or no, and I will guide the next step.';

        set((current) => ({
          ...current,
          chatByUser: {
            ...current.chatByUser,
            [userKey]: [
              ...existingMessages,
              {
                id: `chat-${generateId()}`,
                text: starterText,
                sender: 'support',
                timestamp: new Date().toISOString(),
                status: 'received',
              },
            ],
          },
        }));
      },

      processAjoAutoPayments: () => set((state) => {
        if (!state.currentUser?.ajoUsername) return state;

        const now = new Date();
        const nowIso = now.toISOString();
        let nextBalance = state.balance;
        let nextTransactions = [...state.transactions];
        let nextNotifications = [...state.notifications];
        let changed = false;

        const nextGroups = state.savingsGroups.map((group) => {
          let groupChanged = false;
          let nextPayoutOrder = group.payoutOrder || [];
          let nextPayoutIndex = group.nextPayoutIndex ?? 0;

          let nextMembers = group.members.map((member) => {
            const isCurrentUserMember = member.ajoUsername.toLowerCase() === state.currentUser!.ajoUsername!.toLowerCase();
            if (!isCurrentUserMember || !member.accepted || member.paymentMode !== 'automatic') return member;
            if (!isDueToday(group, now)) return member;

            const alreadyPaidThisPeriod = member.contributions.some(
              (contribution) => contribution.status === 'paid' && isSameContributionPeriod(group, new Date(contribution.date), now),
            );
            if (alreadyPaidThisPeriod) return member;

            const amount = group.contributionAmount * Math.max(member.slots, 1);
            if (nextBalance < amount) return member;

            nextBalance -= amount;
            const contributionId = generateId();
            const newContribution = {
              id: contributionId,
              groupId: group.id,
              memberUsername: member.ajoUsername,
              amount,
              date: nowIso,
              status: 'paid' as const,
            };

            nextTransactions = [
              {
                id: generateId(),
                type: 'ajo',
                amount,
                senderAccount: state.currentUser?.accountNumber || '',
                receiverAccount: group.id,
                senderName: `${state.currentUser?.firstName} ${state.currentUser?.lastName}`,
                receiverName: group.name,
                description: `Auto Ajo contribution - ${group.name}`,
                status: 'success',
                timestamp: nowIso,
              },
              ...nextTransactions,
            ];
            nextNotifications = [
              {
                id: generateId(),
                message: `Auto contribution paid: ₦${amount.toLocaleString()} for ${group.name}`,
                read: false,
                timestamp: nowIso,
              },
              ...nextNotifications,
            ];

            groupChanged = true;
            changed = true;
            return { ...member, contributions: [newContribution, ...member.contributions] };
          });

          const acceptedMembers = nextMembers.filter((member) => member.accepted);
          const normalizedOrder = normalizePayoutOrderBySlots(nextMembers, nextPayoutOrder);
          if (normalizedOrder.join('|') !== nextPayoutOrder.join('|')) {
            nextPayoutOrder = normalizedOrder;
            groupChanged = true;
            changed = true;
          }

          const allMembersPaidThisPeriod = acceptedMembers.length > 0 && acceptedMembers.every((member) => (
            member.contributions.some((contribution) => (
              contribution.status === 'paid' &&
              contribution.memberUsername !== '__PAYOUT__' &&
              isSameContributionPeriod(group, new Date(contribution.date), now)
            ))
          ));

          const payoutAlreadyProcessed = acceptedMembers.some((member) => (
            member.contributions.some((contribution) => (
              contribution.status === 'paid' &&
              contribution.memberUsername === '__PAYOUT__' &&
              isSameContributionPeriod(group, new Date(contribution.date), now)
            ))
          ));

          const latestContributionTimestamp = getLatestContributionTimestampForCurrentPeriod(group, acceptedMembers, now);
          const isPayoutWindowOpen = latestContributionTimestamp !== null
            && now.getTime() >= latestContributionTimestamp + (24 * 60 * 60 * 1000);

          if (
            !!group.payoutEnabled &&
            !!group.autoPayoutEnabled &&
            allMembersPaidThisPeriod &&
            isPayoutWindowOpen &&
            !payoutAlreadyProcessed &&
            nextPayoutOrder.length > 0
          ) {
            const winnerUsername = nextPayoutOrder[nextPayoutIndex % nextPayoutOrder.length];
            const winnerIndex = nextMembers.findIndex((member) => member.ajoUsername === winnerUsername);

            if (winnerIndex >= 0) {
              const potAmount = acceptedMembers.reduce(
                (sum, member) => sum + (group.contributionAmount * Math.max(member.slots, 1)),
                0,
              );
              const payoutMarker = {
                id: generateId(),
                groupId: group.id,
                memberUsername: '__PAYOUT__',
                amount: potAmount,
                date: nowIso,
                status: 'paid' as const,
              };

              nextMembers = nextMembers.map((member, index) => {
                if (index !== winnerIndex) return member;
                return {
                  ...member,
                  contributions: [payoutMarker, ...member.contributions],
                };
              });

              const winner = nextMembers[winnerIndex];
              if (winner.ajoUsername.toLowerCase() === state.currentUser!.ajoUsername!.toLowerCase()) {
                nextBalance += potAmount;
                nextTransactions = [
                  {
                    id: generateId(),
                    type: 'receive',
                    amount: potAmount,
                    senderAccount: group.id,
                    receiverAccount: state.currentUser?.accountNumber || '',
                    senderName: `${group.name} Pool`,
                    receiverName: `${state.currentUser?.firstName} ${state.currentUser?.lastName}`,
                    description: `Ajo payout - ${group.name}`,
                    status: 'success',
                    timestamp: nowIso,
                  },
                  ...nextTransactions,
                ];
                nextNotifications = [
                  {
                    id: generateId(),
                    message: `Ajo payout received - ${group.name}: ₦${potAmount.toLocaleString()}`,
                    read: false,
                    timestamp: nowIso,
                  },
                  ...nextNotifications,
                ];
              }

              nextPayoutIndex += 1;
              groupChanged = true;
              changed = true;
            }
          }

          return groupChanged
            ? { ...group, members: nextMembers, payoutOrder: nextPayoutOrder, nextPayoutIndex }
            : group;
        });

        if (!changed) return state;
        return {
          ...state,
          balance: nextBalance,
          transactions: nextTransactions,
          notifications: nextNotifications,
          savingsGroups: nextGroups,
        };
      }),
    }),
    {
      name: 'trustpay-store',
      partialize: (state) => {
        // Persist auth and user data so browser refresh keeps the active session.
        return state;
      },
    }
  )
);
