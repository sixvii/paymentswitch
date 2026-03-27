import type { Transaction } from '@/types';
import type { User } from '@/types';
import type { LockedFund, SavingsGroup, UserRequest } from '@/types';
import type { Escrow } from '@/types';
import type { Loan, TrustScore } from '@/types';

const API_BASE_URL = import.meta.env.VITE_NODE_API_BASE_URL || 'http://localhost:5002';
const AUTH_TOKEN_KEY = 'authToken';
export const AUTH_EXPIRED_EVENT = 'backend-auth-expired';

type BackendTransactionType = Transaction['type'];

interface BackendTransactionDto {
  _id?: string;
  id?: string;
  idempotencyKey?: string;
  type: string;
  amount: number;
  senderAccount: string;
  receiverAccount: string;
  senderName: string;
  receiverName: string;
  description?: string;
  status: 'pending' | 'success' | 'failed';
  createdAt?: string;
  updatedAt?: string;
}

interface CommittedTransactionResponse {
  transaction: BackendTransactionDto;
  balance: number;
}

interface QuickstartConfigDto {
  merchantCode: string;
  payItemId: string;
  mode: 'TEST' | 'LIVE';
  inlineCheckoutScriptUrl: string;
  redirectCheckoutUrl: string;
}

interface PayBillRequest {
  amount: string;
  redirectUrl: string;
  customerId: string;
  customerEmail: string;
  currencyCode?: string;
}

interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  age: string;
  username: string;
  pin?: string;
  password?: string;
  nin?: string;
  accountNumber: string;
  walletId: string;
  createdAt: string;
  faceVerified: boolean;
  ajoUsername?: string;
  profileImage?: string;
  ajoActivated?: boolean;
  piggyActivated?: boolean;
  escrowActivated?: boolean;
  escrowWalletId?: string;
  lockedFunds?: User['lockedFunds'];
}

interface UserLookupDto {
  id: string;
  accountNumber: string;
  firstName: string;
  lastName: string;
  walletId: string;
}

interface UserByUsernameDto extends UserLookupDto {
  username: string;
  ajoUsername?: string;
  ajoActivated?: boolean;
}

export interface BackendUserStateDto {
  escrows: Escrow[];
  savingsGroups: SavingsGroup[];
  userRequests: UserRequest[];
  loans: Loan[];
  trustScore: TrustScore;
  paycodeHistory: Array<{
    code: string;
    amount: number;
    createdAt: string;
    status?: 'active' | 'expired' | 'used' | 'cancelled';
    expiresAt?: string;
  }>;
  lockedFunds: LockedFund[];
}

interface BackendAccountStateDto {
  balance: number;
}

interface BackendDisputeDto {
  id: string;
  transactionId: string;
  issue: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

export interface BackendDispute {
  id: string;
  transactionId: string;
  issue: string;
  status: 'open' | 'resolved';
  createdAt: string;
}

interface BackendUserRequestDto {
  id?: string;
  _id?: string;
  requesterId: string;
  requesterName: string;
  requesterPhone?: string;
  requestedFromAccount: string;
  requestedFromName: string;
  type: 'airtime' | 'data' | 'money';
  network?: string;
  amount: number;
  respondedAmount?: number;
  responderName?: string;
  respondedAt?: string;
  note?: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
}

interface BackendNotificationDto {
  _id?: string;
  id?: string;
  userId: string;
  type: 'ajo-payout' | 'ajo-invitation' | 'ajo-member-joined' | 'transaction' | 'alert';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'ajo-payout' | 'ajo-invitation' | 'ajo-member-joined' | 'transaction' | 'alert';
  title: string;
  message: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BackendEscrowDto {
  id?: string;
  _id?: string;
  buyerWalletId: string;
  buyerName: string;
  sellerWalletId: string;
  sellerName: string;
  amount: number;
  description: string;
  deliveryDeadline: string;
  status: Escrow['status'];
  createdAt: string;
  penalty: number;
  releasedAt?: string;
  sellerSettledAt?: string;
}

interface BackendPaycodeDto {
  id: string;
  code: string;
  amount: number;
  status: 'active' | 'expired' | 'used' | 'cancelled';
  expiresAt: string;
  usedAt?: string;
  cancelledAt?: string;
  createdAt: string;
}

const allowedTypes: BackendTransactionType[] = [
  'send',
  'receive',
  'airtime',
  'data',
  'bills',
  'insurance',
  'escrow',
  'ajo',
  'cross-border',
];

const toSafeTransactionType = (value: string): BackendTransactionType => {
  if (allowedTypes.includes(value as BackendTransactionType)) {
    return value as BackendTransactionType;
  }
  return 'bills';
};

const toFrontendTransaction = (tx: BackendTransactionDto): Transaction => ({
  id: tx.id || tx._id || tx.idempotencyKey || Math.random().toString(36).substring(2, 15),
  type: toSafeTransactionType(tx.type),
  amount: tx.amount,
  senderAccount: tx.senderAccount,
  receiverAccount: tx.receiverAccount,
  senderName: tx.senderName,
  receiverName: tx.receiverName,
  description: tx.description || '',
  status: tx.status,
  timestamp: tx.createdAt || tx.updatedAt || new Date().toISOString(),
});

const parseResponse = async <T>(response: Response): Promise<T> => {
  const body = await response.json();
  if (!response.ok) {
    const message = body?.message || 'Request failed';
    throw new Error(message);
  }
  return body as T;
};

const getAuthToken = () => {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || '';
};

const setAuthToken = (token: string) => {
  if (typeof window === 'undefined') return;
  if (!token) {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    return;
  }
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
};

const handleUnauthorized = () => {
  if (typeof window === 'undefined') return;

  setAuthToken('');
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));

  if (!window.location.pathname.startsWith('/auth')) {
    window.location.assign('/auth/login');
  }
};

const buildAuthHeaders = (headers?: HeadersInit): HeadersInit => {
  const token = getAuthToken();
  if (!token) return headers || {};
  return {
    ...(headers || {}),
    Authorization: `Bearer ${token}`,
  };
};

const fetchWithAuth = async (input: RequestInfo | URL, init?: RequestInit) => {
  const response = await fetch(input, {
    ...(init || {}),
    headers: buildAuthHeaders(init?.headers),
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  return response;
};

const toFrontendUser = (user: UserDto, credentials?: { pin?: string; password?: string }): User => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  phone: user.phone,
  email: user.email,
  age: user.age,
  username: user.username,
  pin: user.pin || credentials?.pin || '',
  password: user.password || credentials?.password || '',
  nin: user.nin,
  accountNumber: user.accountNumber,
  walletId: user.walletId,
  createdAt: user.createdAt,
  faceVerified: user.faceVerified,
  ajoUsername: user.ajoUsername,
  profileImage: user.profileImage,
  ajoActivated: user.ajoActivated,
  piggyActivated: user.piggyActivated,
  escrowActivated: user.escrowActivated,
  escrowWalletId: user.escrowWalletId,
  lockedFunds: user.lockedFunds || [],
});

const toFrontendUserRequest = (request: BackendUserRequestDto): UserRequest => ({
  id: request.id || request._id || Math.random().toString(36).substring(2, 15),
  requesterId: request.requesterId,
  requesterName: request.requesterName,
  requesterPhone: request.requesterPhone,
  requestedFromAccount: request.requestedFromAccount,
  requestedFromName: request.requestedFromName,
  type: request.type,
  network: request.network,
  amount: request.amount,
  respondedAmount: request.respondedAmount,
  responderName: request.responderName,
  respondedAt: request.respondedAt,
  note: request.note,
  status: request.status,
  createdAt: request.createdAt,
});

const toFrontendEscrow = (entry: BackendEscrowDto): Escrow => ({
  id: entry.id || entry._id || Math.random().toString(36).substring(2, 15),
  buyerWalletId: entry.buyerWalletId,
  buyerName: entry.buyerName,
  sellerWalletId: entry.sellerWalletId,
  sellerName: entry.sellerName,
  amount: entry.amount,
  description: entry.description,
  deliveryDeadline: entry.deliveryDeadline,
  status: entry.status,
  createdAt: entry.createdAt,
  penalty: entry.penalty || 0,
  releasedAt: entry.releasedAt,
  sellerSettledAt: entry.sellerSettledAt,
});

export const createIdempotencyKey = (prefix: string) => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

export const createBackendTransaction = async (
  payload: Omit<Transaction, 'id' | 'timestamp' | 'description'> & {
    description?: string;
    idempotencyKey: string;
  },
): Promise<Transaction> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await parseResponse<{ data: BackendTransactionDto }>(response);
  return toFrontendTransaction(body.data);
};

export const createCommittedBackendTransaction = async (
  payload: Omit<Transaction, 'id' | 'timestamp' | 'description'> & {
    description?: string;
    idempotencyKey: string;
  },
  expectedBalance: number,
  nextBalance: number,
): Promise<{ transaction: Transaction; balance: number }> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/transactions/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expectedBalance,
      nextBalance,
      transaction: payload,
    }),
  });

  const body = await parseResponse<{ data: CommittedTransactionResponse }>(response);
  return {
    transaction: toFrontendTransaction(body.data.transaction),
    balance: body.data.balance,
  };
};

export const fetchBackendTransactions = async (limit = 500): Promise<Transaction[]> => {
  const safeLimit = Math.min(Math.max(Number.isFinite(limit) ? limit : 500, 1), 1000);
  const response = await fetchWithAuth(`${API_BASE_URL}/api/transactions?limit=${safeLimit}`);
  const body = await parseResponse<{ data: BackendTransactionDto[] }>(response);
  return (body.data || []).map(toFrontendTransaction);
};

export const fetchBackendTransactionById = async (transactionId: string): Promise<Transaction> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/transactions/${encodeURIComponent(transactionId)}`);
  const body = await parseResponse<{ data: BackendTransactionDto }>(response);
  return toFrontendTransaction(body.data);
};

export const fetchInterswitchQuickstartConfig = async (): Promise<QuickstartConfigDto> => {
  const response = await fetch(`${API_BASE_URL}/api/interswitch/config`);
  const body = await parseResponse<{ data: QuickstartConfigDto }>(response);
  return body.data;
};

export const createInterswitchPayBillLink = async (payload: PayBillRequest) => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/interswitch/pay-bill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse<{ data: Record<string, unknown> }>(response);
  return body.data;
};

export const verifyInterswitchTransaction = async (transactionReference: string, amount: string) => {
  const params = new URLSearchParams({ transactionReference, amount });
  const response = await fetchWithAuth(`${API_BASE_URL}/api/interswitch/verify?${params.toString()}`);
  const body = await parseResponse<{ data: Record<string, unknown> }>(response);
  return body.data;
};

export const checkUserExistsByPhone = async (phone: string): Promise<boolean> => {
  const response = await fetch(`${API_BASE_URL}/api/users/exists?phone=${encodeURIComponent(phone)}`);
  const body = await parseResponse<{ data: { exists: boolean } }>(response);
  return !!body.data?.exists;
};

export const registerBackendUser = async (payload: User): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/api/users/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse<{ data: UserDto; token?: string }>(response);
  if (body.token) setAuthToken(body.token);
  return toFrontendUser(body.data, { pin: payload.pin, password: payload.password });
};

export const loginBackendUser = async (payload: {
  phone: string;
  username: string;
  password: string;
  pin: string;
}): Promise<User> => {
  const response = await fetch(`${API_BASE_URL}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse<{ data: UserDto; token?: string }>(response);
  if (body.token) setAuthToken(body.token);
  return toFrontendUser(body.data, { pin: payload.pin, password: payload.password });
};

export const clearBackendAuthToken = () => {
  setAuthToken('');
};

export const fetchUserByAccount = async (accountNumber: string) => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/by-account/${encodeURIComponent(accountNumber)}`);
  const body = await parseResponse<{ data: UserLookupDto }>(response);
  return body.data;
};

export const fetchUserByUsername = async (username: string) => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/by-username/${encodeURIComponent(username)}`);
  const body = await parseResponse<{ data: UserByUsernameDto }>(response);
  return body.data;
};

export const searchUsersByUsername = async (query: string): Promise<UserByUsernameDto[]> => {
  const normalized = query.trim().replace(/^@+/, '');
  if (normalized.length < 2) return [];

  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/search?query=${encodeURIComponent(normalized)}`);
  const body = await parseResponse<{ data: UserByUsernameDto[] }>(response);
  return body.data || [];
};

export const updateBackendUserPreferences = async (payload: {
  ajoActivated?: boolean;
  ajoUsername?: string;
  piggyActivated?: boolean;
  escrowActivated?: boolean;
  escrowWalletId?: string;
  pin?: string;
}): Promise<User> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/me/preferences`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await parseResponse<{ data: UserDto }>(response);
  return toFrontendUser(body.data);
};

export const fetchBackendUserState = async (): Promise<BackendUserStateDto> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/me/state`);
  const body = await parseResponse<{ data: Partial<BackendUserStateDto> }>(response);
  return {
    escrows: body.data.escrows || [],
    savingsGroups: body.data.savingsGroups || [],
    userRequests: body.data.userRequests || [],
    loans: body.data.loans || [],
    trustScore: body.data.trustScore || {
      overall: 450,
      transactionVolume: 60,
      savingsDiscipline: 50,
      escrowReliability: 70,
      billPaymentConsistency: 55,
    },
    paycodeHistory: body.data.paycodeHistory || [],
    lockedFunds: body.data.lockedFunds || [],
  };
};

export const updateBackendUserState = async (payload: Partial<BackendUserStateDto>) => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/me/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await parseResponse<{ data: Partial<BackendUserStateDto> }>(response);
  return {
    escrows: body.data.escrows || [],
    savingsGroups: body.data.savingsGroups || [],
    userRequests: body.data.userRequests || [],
    loans: body.data.loans || [],
    trustScore: body.data.trustScore || {
      overall: 450,
      transactionVolume: 60,
      savingsDiscipline: 50,
      escrowReliability: 70,
      billPaymentConsistency: 55,
    },
    paycodeHistory: body.data.paycodeHistory || [],
    lockedFunds: body.data.lockedFunds || [],
  };
};

export const syncBackendAjoGroup = async (group: SavingsGroup): Promise<BackendUserStateDto> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/ajo/groups/${encodeURIComponent(group.id)}/sync`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group }),
  });

  const body = await parseResponse<{ data: Partial<BackendUserStateDto> }>(response);
  return {
    escrows: body.data.escrows || [],
    savingsGroups: body.data.savingsGroups || [],
    userRequests: body.data.userRequests || [],
    loans: body.data.loans || [],
    trustScore: body.data.trustScore || {
      overall: 450,
      transactionVolume: 60,
      savingsDiscipline: 50,
      escrowReliability: 70,
      billPaymentConsistency: 55,
    },
    paycodeHistory: body.data.paycodeHistory || [],
    lockedFunds: body.data.lockedFunds || [],
  };
};

export const removeBackendAjoGroup = async (groupId: string): Promise<BackendUserStateDto> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/ajo/groups/${encodeURIComponent(groupId)}/sync`, {
    method: 'DELETE',
  });

  const body = await parseResponse<{ data: Partial<BackendUserStateDto> }>(response);
  return {
    escrows: body.data.escrows || [],
    savingsGroups: body.data.savingsGroups || [],
    userRequests: body.data.userRequests || [],
    loans: body.data.loans || [],
    trustScore: body.data.trustScore || {
      overall: 450,
      transactionVolume: 60,
      savingsDiscipline: 50,
      escrowReliability: 70,
      billPaymentConsistency: 55,
    },
    paycodeHistory: body.data.paycodeHistory || [],
    lockedFunds: body.data.lockedFunds || [],
  };
};

export const fetchBackendRequests = async (): Promise<UserRequest[]> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/requests`);
  const body = await parseResponse<{ data: BackendUserRequestDto[] }>(response);
  return (body.data || []).map(toFrontendUserRequest);
};

export const fetchBackendEscrows = async (): Promise<Escrow[]> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/escrows`);
  const body = await parseResponse<{ data: BackendEscrowDto[] }>(response);
  return (body.data || []).map(toFrontendEscrow);
};

export const createBackendEscrow = async (payload: {
  sellerWalletId: string;
  amount: number;
  description: string;
  deliveryDeadline: string;
}): Promise<{ escrow: Escrow; balance: number }> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/escrows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await parseResponse<{ data: { escrow: BackendEscrowDto; balance: number } }>(response);
  return {
    escrow: toFrontendEscrow(body.data.escrow),
    balance: body.data.balance,
  };
};

export const fetchBackendPaycodes = async (): Promise<BackendPaycodeDto[]> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/paycodes`);
  const body = await parseResponse<{ data: BackendPaycodeDto[] }>(response);
  return body.data || [];
};

export const createBackendPaycode = async (amount: number): Promise<{ paycode: BackendPaycodeDto; balance: number }> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/paycodes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount }),
  });
  const body = await parseResponse<{ data: { paycode: BackendPaycodeDto; balance: number } }>(response);
  return body.data;
};

export const cancelBackendPaycode = async (paycodeId: string): Promise<BackendPaycodeDto> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/paycodes/${encodeURIComponent(paycodeId)}/cancel`, {
    method: 'PATCH',
  });
  const body = await parseResponse<{ data: { paycode: BackendPaycodeDto } }>(response);
  return body.data.paycode;
};

export const updateBackendEscrow = async (
  escrowId: string,
  action: 'accept' | 'decline' | 'cancel' | 'release' | 'dispute' | 'resolve-release' | 'resolve-refund',
): Promise<Escrow> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/escrows/${encodeURIComponent(escrowId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });

  const body = await parseResponse<{ data: { escrow: BackendEscrowDto } }>(response);
  return toFrontendEscrow(body.data.escrow);
};

export const createBackendUserRequest = async (payload: {
  type: UserRequest['type'];
  requestedFromAccount: string;
  amount: number;
  requesterPhone?: string;
  network?: string;
  note?: string;
}): Promise<UserRequest> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await parseResponse<{ data: BackendUserRequestDto }>(response);
  return toFrontendUserRequest(body.data);
};

export const respondBackendUserRequest = async (
  requestId: string,
  payload: { action: 'approve' | 'decline'; amount?: number },
): Promise<{ request: UserRequest; balance: number }> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/requests/${encodeURIComponent(requestId)}/respond`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await parseResponse<{ data: { request: BackendUserRequestDto; balance: number } }>(response);
  return {
    request: toFrontendUserRequest(body.data.request),
    balance: body.data.balance,
  };
};

export const uploadBackendProfileImage = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/me/profile-image`, {
    method: 'PUT',
    body: formData,
  });

  const body = await parseResponse<{ data: { profileImage: string } }>(response);
  return body.data.profileImage;
};

export const fetchBackendDisputes = async (): Promise<BackendDispute[]> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/disputes`);
  const body = await parseResponse<{ data: BackendDisputeDto[] }>(response);
  return (body.data || []).map((entry) => ({
    id: entry.id,
    transactionId: entry.transactionId,
    issue: entry.issue,
    status: entry.status,
    createdAt: entry.createdAt,
  }));
};

export const createBackendDispute = async (payload: { transactionId: string; issue: string }): Promise<BackendDispute> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/disputes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = await parseResponse<{ data: BackendDisputeDto }>(response);
  return {
    id: body.data.id,
    transactionId: body.data.transactionId,
    issue: body.data.issue,
    status: body.data.status,
    createdAt: body.data.createdAt,
  };
};

export const fetchBackendAccountState = async (): Promise<BackendAccountStateDto> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/me/account-state`);
  const body = await parseResponse<{ data: BackendAccountStateDto }>(response);
  return body.data;
};

export const commitBackendBalance = async (nextBalance: number, expectedBalance?: number): Promise<number> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/users/me/account-state/commit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nextBalance, expectedBalance }),
  });
  const body = await parseResponse<{ data: BackendAccountStateDto }>(response);
  return body.data.balance;
};

export const fetchBackendNotifications = async (limit = 50): Promise<{ notifications: Notification[]; unreadCount: number }> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/notifications?limit=${Math.min(limit, 100)}`);
  const body = await parseResponse<{ data: BackendNotificationDto[]; unreadCount: number }>(response);
  return {
    notifications: (body.data || []).map((notification) => ({
      id: notification._id || notification.id || '',
      userId: notification.userId,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      read: notification.read,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    })),
    unreadCount: body.unreadCount || 0,
  };
};

export const markBackendNotificationAsRead = async (notificationId: string): Promise<Notification> => {
  const response = await fetchWithAuth(`${API_BASE_URL}/api/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
  });
  const body = await parseResponse<{ data: BackendNotificationDto }>(response);
  return {
    id: body.data._id || body.data.id || '',
    userId: body.data.userId,
    type: body.data.type,
    title: body.data.title,
    message: body.data.message,
    data: body.data.data,
    read: body.data.read,
    createdAt: body.data.createdAt,
    updatedAt: body.data.updatedAt,
  };
};

export const markAllBackendNotificationsAsRead = async (): Promise<void> => {
  await fetchWithAuth(`${API_BASE_URL}/api/notifications/read-all`, {
    method: 'PATCH',
  });
};

export const deleteBackendNotification = async (notificationId: string): Promise<void> => {
  await fetchWithAuth(`${API_BASE_URL}/api/notifications/${encodeURIComponent(notificationId)}`, {
    method: 'DELETE',
  });
};
