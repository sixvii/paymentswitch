export interface User {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  age: string;
  username: string;
  pin: string;
  password: string;
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
  lockedFunds?: LockedFund[];
}

export interface Transaction {
  id: string;
  type: 'send' | 'receive' | 'airtime' | 'data' | 'bills' | 'insurance' | 'escrow' | 'ajo' | 'cross-border';
  amount: number;
  senderAccount: string;
  receiverAccount: string;
  senderName: string;
  receiverName: string;
  description: string;
  status: 'pending' | 'success' | 'failed';
  timestamp: string;
  category?: string;
}

export interface Escrow {
  id: string;
  buyerWalletId: string;
  buyerName: string;
  sellerWalletId: string;
  sellerName: string;
  amount: number;
  description: string;
  deliveryDeadline: string;
  status: 'pending_acceptance' | 'pending_delivery' | 'delivery_confirmed' | 'released' | 'disputed' | 'cancelled';
  createdAt: string;
  penalty: number;
  releasedAt?: string;
  sellerSettledAt?: string;
}

export interface SavingsGroup {
  id: string;
  name: string;
  creatorUsername: string;
  totalMembers: number;
  contributionAmount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly';
  frequencyDay: string;
  firstContributionDate?: string;
  latePenalty: number;
  totalMonths: number;
  totalWeeks?: number;
  members: AjoMember[];
  payoutOrder?: string[];
  nextPayoutIndex?: number;
  payoutEnabled?: boolean;
  autoPayoutEnabled?: boolean;
  status: 'active' | 'completed';
  createdAt: string;
}

export interface AjoMember {
  ajoUsername: string;
  fullName: string;
  slots: number;
  paymentMode: 'automatic' | 'manual';
  accepted: boolean;
  contributions: AjoContribution[];
}

export interface AjoContribution {
  id: string;
  groupId: string;
  memberUsername: string;
  amount: number;
  date: string;
  status: 'paid' | 'pending' | 'late';
}

export interface TrustScore {
  overall: number;
  transactionVolume: number;
  savingsDiscipline: number;
  escrowReliability: number;
  billPaymentConsistency: number;
}

export interface BillPayment {
  id: string;
  category: 'electricity' | 'internet' | 'airtime' | 'data' | 'tv' | 'insurance' | 'bills';
  provider: string;
  accountNumber: string;
  amount: number;
  status: 'success' | 'pending' | 'failed';
  timestamp: string;
}

export interface Loan {
  id: string;
  borrowerId: string;
  borrowerName: string;
  type: 'student' | 'business';
  amount: number;
  applicationDetails?: LoanApplicationDetails;
  status: 'active' | 'repaid' | 'defaulted';
  createdAt: string;
  dueDate: string;
  repaidAt?: string;
}

export interface StudentLoanApplicationDetails {
  schoolName: string;
  department: string;
  course: string;
  level: string;
  bvn: string;
  graduationYear: string;
  passportImage: string;
  schoolIdCardImage: string;
}

export interface BusinessLoanApplicationDetails {
  businessRegisteredName: string;
  businessStoreImage: string;
  selfImage: string;
  cacDocument: string;
  bvn: string;
}

export type LoanApplicationDetails =
  | { type: 'student'; studentDetails: StudentLoanApplicationDetails }
  | { type: 'business'; businessDetails: BusinessLoanApplicationDetails };

export interface UserRequest {
  id: string;
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

export interface PaymentCard {
  id: string;
  cardholderName: string;
  last4: string;
  expiryMonth: string;
  expiryYear: string;
  brand: 'visa' | 'mastercard' | 'verve' | 'other';
  isDefault: boolean;
  createdAt: string;
}

export interface LockedFund {
  id: string;
  name: string;
  amount: number;
  unlockDate: string;
  createdAt: string;
  releasedAt?: string;
  status: 'locked' | 'released';
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

export type ChatResponderMode = 'agent' | 'bot';

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'me' | 'support';
  timestamp: string;
  status: 'sending' | 'sent' | 'failed' | 'received';
}
