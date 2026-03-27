import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import PinInput from '@/components/ui/PinInput';
import { ArrowLeft, Check, Lock, Plus } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { SavingsGroup, AjoMember } from '@/types';
import {
  commitBackendBalance,
  createBackendTransaction,
  createIdempotencyKey,
  fetchBackendUserState,
  fetchUserByUsername,
  searchUsersByUsername,
} from '@/lib/backendApi';

type PayoutAssignmentMode = 'up-to-down' | 'down-to-up' | 'manual';
type AjoLookupUser = Awaited<ReturnType<typeof fetchUserByUsername>>;

const formatDateKey = (value: string | Date) => {
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseDateKeyAsLocalDate = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const AjoPage = () => {
  const navigate = useNavigate();
  const {
    currentUser,
    savingsGroups,
    addSavingsGroup,
    balance,
    setBalance,
    addTransaction,
    updateSavingsGroup,
    removeSavingsGroup,
    hydrateBackendState,
  } = useStore();

  useEffect(() => {
    if (!currentUser?.id) return;

    let cancelled = false;
    const refreshFromBackend = async () => {
      try {
        const state = await fetchBackendUserState();
        if (!cancelled) {
          hydrateBackendState({ savingsGroups: state.savingsGroups || [] });
        }
      } catch {
        // Keep local state if refresh fails.
      }
    };

    // Initial fetch
    void refreshFromBackend();

    // Periodic refresh every 30 seconds to ensure MongoDB data is always in sync
    const timer = setInterval(() => {
      void refreshFromBackend();
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentUser?.id, hydrateBackendState]);

  const [view, setView] = useState<'main' | 'create' | 'details' | 'pay-pin' | 'delete-pin'>('main');
  const [error, setError] = useState('');

  // Create group form
  const [groupName, setGroupName] = useState('');
  const [totalMembers, setTotalMembers] = useState('');
  const [creatorSlots, setCreatorSlots] = useState('1');
  const [contributionAmount, setContributionAmount] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>('weekly');
  const [frequencyDay, setFrequencyDay] = useState('');
  const [firstContributionDate, setFirstContributionDate] = useState('');
  const [latePenalty, setLatePenalty] = useState('');
  const [totalMonths, setTotalMonths] = useState('');
  const [totalWeeks, setTotalWeeks] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<SavingsGroup | null>(null);
  const [memberUsername, setMemberUsername] = useState('');
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberSuggestions, setMemberSuggestions] = useState<AjoLookupUser[]>([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  const [recentlyAddedHandles, setRecentlyAddedHandles] = useState<string[]>([]);
  const [inviteSlots, setInviteSlots] = useState('1');
  const [payoutDraftOrder, setPayoutDraftOrder] = useState<string[]>([]);
  const [payoutAssignmentMode, setPayoutAssignmentMode] = useState<PayoutAssignmentMode>('manual');
  const [manualRankByUsername, setManualRankByUsername] = useState<Record<string, number>>({});
  const [historyMonthCursor, setHistoryMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedHistoryDateKey, setSelectedHistoryDateKey] = useState<string | null>(null);
  const memberSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (memberSearchTimeoutRef.current) clearTimeout(memberSearchTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setRecentlyAddedHandles([]);
  }, [selectedGroup?.id]);

  const normalizeMemberHandle = (value: string) => value.trim().replace(/^@+/, '').toLowerCase();

  const handleMemberUsernameChange = (value: string) => {
    setMemberUsername(value);
    const normalized = value.trim().replace(/^@+/, '');

    if (memberSearchTimeoutRef.current) {
      clearTimeout(memberSearchTimeoutRef.current);
      memberSearchTimeoutRef.current = null;
    }

    if (normalized.length < 2) {
      setMemberSuggestions([]);
      setMemberSearchLoading(false);
      return;
    }

    setMemberSearchLoading(true);
    memberSearchTimeoutRef.current = setTimeout(() => {
      void searchUsersByUsername(normalized)
        .then((users) => {
          setMemberSuggestions(users);
        })
        .catch(() => {
          setMemberSuggestions([]);
        })
        .finally(() => {
          setMemberSearchLoading(false);
        });
    }, 250);
  };

  const getCurrentPeriodKey = (group: SavingsGroup, now: Date) => {
    if (group.frequency === 'monthly') {
      return `${now.getFullYear()}-${now.getMonth() + 1}`;
    }

    const reference = new Date(now.getTime());
    const day = reference.getDay();
    reference.setHours(0, 0, 0, 0);
    reference.setDate(reference.getDate() - day);

    if (group.frequency === 'weekly') {
      return `W-${reference.toISOString().slice(0, 10)}`;
    }

    const scheduleAnchor = group.firstContributionDate || group.createdAt;
    const created = new Date(scheduleAnchor);
    const diffDays = Math.floor((now.getTime() - created.getTime()) / (24 * 60 * 60 * 1000));
    const bucket = Math.max(0, Math.floor(diffDays / 14));
    return `BW-${bucket}`;
  };

  const getContributionPeriodKey = (group: SavingsGroup, dateValue: string) => {
    const date = new Date(dateValue);
    return getCurrentPeriodKey(group, date);
  };

  const getLatestContributionTimestampForPeriod = (group: SavingsGroup, members: AjoMember[], periodKey: string) => {
    const timestamps = members.flatMap((member) => member.contributions
      .filter((contribution) => (
        contribution.status === 'paid' &&
        contribution.memberUsername !== '__PAYOUT__' &&
        getContributionPeriodKey(group, contribution.date) === periodKey
      ))
      .map((contribution) => new Date(contribution.date).getTime()));

    if (timestamps.length === 0) return null;
    return Math.max(...timestamps);
  };

  const buildDefaultPayoutOrder = (group: SavingsGroup) => {
    const acceptedSlotUsernames = group.members
      .filter((member) => member.accepted)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .flatMap((member) => Array.from({ length: Math.max(member.slots, 1) }, () => member.ajoUsername));

    const currentOrder = group.payoutOrder || [];
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

  const buildPayoutOrderByMode = (group: SavingsGroup, mode: Exclude<PayoutAssignmentMode, 'manual'>) => {
    const acceptedMembers = group.members.filter((member) => member.accepted);
    // up-to-down: payout from down (bottom/last) to up (top/first) - reverse order
    // down-to-up: payout from up (top/first) to down (bottom/last) - normal order
    const orderedMembers = mode === 'up-to-down' ? [...acceptedMembers].reverse() : acceptedMembers;
    return orderedMembers.flatMap((member) => Array.from({ length: Math.max(member.slots, 1) }, () => member.ajoUsername));
  };

  const getAcceptedUsernames = (group: SavingsGroup) => group.members
    .filter((member) => member.accepted)
    .map((member) => member.ajoUsername);

  const buildManualRankMap = (group: SavingsGroup, order: string[]) => {
    const acceptedUsernames = getAcceptedUsernames(group);
    const orderedUnique: string[] = [];

    order.forEach((username) => {
      if (!acceptedUsernames.includes(username)) return;
      if (orderedUnique.includes(username)) return;
      orderedUnique.push(username);
    });

    acceptedUsernames.forEach((username) => {
      if (!orderedUnique.includes(username)) {
        orderedUnique.push(username);
      }
    });

    return orderedUnique.reduce<Record<string, number>>((acc, username, index) => {
      acc[username] = index + 1;
      return acc;
    }, {});
  };

  const buildOrderFromManualRank = (group: SavingsGroup, rankByUsername: Record<string, number>) => {
    const acceptedMembers = group.members.filter((member) => member.accepted);
    const sortedUsernames = [...acceptedMembers]
      .sort((a, b) => (rankByUsername[a.ajoUsername] ?? Number.MAX_SAFE_INTEGER) - (rankByUsername[b.ajoUsername] ?? Number.MAX_SAFE_INTEGER))
      .map((member) => member.ajoUsername);

    // In manual mode, each member keeps consecutive payout positions based on their slot count.
    return sortedUsernames.flatMap((username) => {
      const member = acceptedMembers.find((entry) => entry.ajoUsername === username);
      const slots = Math.max(member?.slots || 1, 1);
      return Array.from({ length: slots }, () => username);
    });
  };

  useEffect(() => {
    if (!selectedGroup) {
      setPayoutDraftOrder([]);
      setPayoutAssignmentMode('manual');
      setManualRankByUsername({});
      setSelectedHistoryDateKey(null);
      return;
    }

    const hasPaidOutBefore = selectedGroup.members.some((member) =>
      member.contributions.some((contribution) => contribution.status === 'paid' && contribution.memberUsername === '__PAYOUT__'),
    );
    const hasFinalized = hasPaidOutBefore || (selectedGroup.nextPayoutIndex ?? 0) > 0;
    if (hasFinalized) {
      // Payout order is finalized, don't enter edit mode
      setPayoutDraftOrder([]);
      setManualRankByUsername({});
      setPayoutAssignmentMode('manual');
    } else {
      // No payout order yet, initialize draft mode
      const defaultOrder = buildDefaultPayoutOrder(selectedGroup);
      setPayoutDraftOrder(defaultOrder);
      setManualRankByUsername(buildManualRankMap(selectedGroup, defaultOrder));
      setPayoutAssignmentMode('manual');
    }
    
    setHistoryMonthCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setSelectedHistoryDateKey(null);
    // This effect intentionally resets draft state only when selected group changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroup]);

  const maybeDistributeGroupPayout = (group: SavingsGroup, members: AjoMember[]) => {
    const now = new Date();
    const periodKey = getCurrentPeriodKey(group, now);
    const acceptedMembers = members.filter((member) => member.accepted);
    if (acceptedMembers.length === 0) {
      return { members, updates: {} as Partial<SavingsGroup>, payoutWinnerUsername: null as string | null, payoutAmount: 0 };
    }

    const allMembersPaidThisPeriod = acceptedMembers.every((member) => (
      member.contributions.some((contribution) => (
        contribution.status === 'paid' && getContributionPeriodKey(group, contribution.date) === periodKey
      ))
    ));
    if (!allMembersPaidThisPeriod) {
      return {
        members,
        updates: { payoutOrder: buildDefaultPayoutOrder({ ...group, members }) } as Partial<SavingsGroup>,
        payoutWinnerUsername: null as string | null,
        payoutAmount: 0,
      };
    }

    if (!group.payoutEnabled || !group.autoPayoutEnabled) {
      return {
        members,
        updates: { payoutOrder: buildDefaultPayoutOrder({ ...group, members }) } as Partial<SavingsGroup>,
        payoutWinnerUsername: null as string | null,
        payoutAmount: 0,
      };
    }

    const latestContributionTimestamp = getLatestContributionTimestampForPeriod(group, acceptedMembers, periodKey);
    const isPayoutWindowOpen = latestContributionTimestamp !== null
      && now.getTime() >= latestContributionTimestamp + (24 * 60 * 60 * 1000);

    if (!isPayoutWindowOpen) {
      return {
        members,
        updates: { payoutOrder: buildDefaultPayoutOrder({ ...group, members }) } as Partial<SavingsGroup>,
        payoutWinnerUsername: null as string | null,
        payoutAmount: 0,
      };
    }

    const alreadyProcessedPayout = acceptedMembers.some((member) => (
      member.contributions.some((contribution) => (
        contribution.status === 'paid' &&
        contribution.memberUsername === '__PAYOUT__' &&
        getContributionPeriodKey(group, contribution.date) === periodKey
      ))
    ));
    if (alreadyProcessedPayout) {
      return {
        members,
        updates: { payoutOrder: buildDefaultPayoutOrder({ ...group, members }) } as Partial<SavingsGroup>,
        payoutWinnerUsername: null as string | null,
        payoutAmount: 0,
      };
    }

    const payoutOrder = buildDefaultPayoutOrder({ ...group, members });
    if (payoutOrder.length === 0) {
      return { members, updates: { payoutOrder } as Partial<SavingsGroup>, payoutWinnerUsername: null as string | null, payoutAmount: 0 };
    }

    const startIndex = group.nextPayoutIndex ?? 0;
    const winnerUsername = payoutOrder[startIndex % payoutOrder.length];
    const winnerIndex = members.findIndex((member) => member.ajoUsername === winnerUsername);
    if (winnerIndex === -1) {
      return { members, updates: { payoutOrder } as Partial<SavingsGroup>, payoutWinnerUsername: null as string | null, payoutAmount: 0 };
    }

    const potAmount = acceptedMembers.reduce((sum, member) => sum + (group.contributionAmount * Math.max(member.slots, 1)), 0);
    const payoutMarker = {
      id: Math.random().toString(36).substring(2, 15),
      groupId: group.id,
      memberUsername: '__PAYOUT__',
      amount: potAmount,
      date: now.toISOString(),
      status: 'paid' as const,
    };

    const updatedMembers = members.map((member, index) => {
      if (index !== winnerIndex) return member;
      return {
        ...member,
        contributions: [payoutMarker, ...member.contributions],
      };
    });

    return {
      members: updatedMembers,
      updates: {
        payoutOrder,
        nextPayoutIndex: startIndex + 1,
      } as Partial<SavingsGroup>,
      payoutWinnerUsername: winnerUsername,
      payoutAmount: potAmount,
    };
  };

  if (!currentUser?.ajoActivated) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center animate-fade-in">
        <div className="text-center">
          <Lock className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold text-foreground mb-2 flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="logo" className="w-5 h-5 object-contain" />
            <span>Ajo Not Activated</span>
          </h2>
          <p className="text-muted-foreground mb-6">Please activate Ajo from the Services page</p>
          <button onClick={() => navigate('/services')} className="py-3 px-8 rounded-[10px] gradient-primary text-primary-foreground font-[500]">
            Go to Services
          </button>
        </div>
      </div>
    );
  }

  const handleCreateGroup = async () => {
    if (!groupName || !totalMembers || !contributionAmount || !frequencyDay || !firstContributionDate || (!totalMonths && !totalWeeks)) {
      setError('Fill all fields'); return;
    }

    const totalSlots = Number(totalMembers);
    const creatorSlotCount = Number(creatorSlots || '1');
    if (!Number.isInteger(totalSlots) || totalSlots < 1) {
      setError('Total members must be at least 1');
      return;
    }
    if (!Number.isInteger(creatorSlotCount) || creatorSlotCount < 1) {
      setError('Creator slots must be at least 1');
      return;
    }
    if (creatorSlotCount > totalSlots) {
      setError('Creator slots cannot be greater than total members');
      return;
    }

    const firstDate = new Date(`${firstContributionDate}T00:00:00`);
    if (Number.isNaN(firstDate.getTime())) {
      setError('Enter a valid first contribution date');
      return;
    }

    if (frequency === 'monthly') {
      const dayNumber = Number.parseInt(frequencyDay.replace(/\D/g, ''), 10);
      if (!Number.isFinite(dayNumber)) {
        setError('For monthly frequency, enter a numeric day of month (e.g. 15)');
        return;
      }
      if (firstDate.getDate() !== dayNumber) {
        setError('First contribution date must match the day of month selected for contribution');
        return;
      }
    } else {
      const expectedDay = dayNames[firstDate.getDay()];
      if (frequencyDay.trim().toLowerCase() !== expectedDay) {
        setError(`First contribution date must fall on ${frequencyDay}`);
        return;
      }
    }

    const group: SavingsGroup = {
      id: Math.random().toString(36).substring(2, 15),
      name: groupName,
      creatorUsername: currentUser?.ajoUsername || '',
      totalMembers: totalSlots,
      contributionAmount: Number(contributionAmount),
      frequency,
      frequencyDay,
      firstContributionDate,
      latePenalty: Number(latePenalty || 0),
      totalMonths: Number(totalMonths),
      totalWeeks: Number(totalWeeks || 0),
      members: [{
        ajoUsername: currentUser?.ajoUsername || '',
        fullName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        slots: creatorSlotCount,
        paymentMode: 'manual',
        accepted: true,
        contributions: [],
      }],
      payoutOrder: [],
      nextPayoutIndex: 0,
      payoutEnabled: false,
      autoPayoutEnabled: false,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    const result = await addSavingsGroup(group);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setView('main');
    setGroupName(''); setTotalMembers(''); setCreatorSlots('1'); setContributionAmount(''); setFrequencyDay(''); setFirstContributionDate(''); setTotalMonths(''); setTotalWeeks(''); setLatePenalty('');
  };

  const handlePayContribution = async (pin: string) => {
    setError('');

    if (pin !== currentUser?.pin) { setError('Incorrect PIN'); return; }
    if (!selectedGroup) return;
    const memberUsername = currentUser?.ajoUsername;
    if (!memberUsername) { setError('Activate Ajo to make contribution'); return; }

    const memberIndex = selectedGroup.members.findIndex(
      (member) => member.ajoUsername.toLowerCase() === memberUsername.toLowerCase(),
    );
    if (memberIndex === -1) { setError('You are not a member of this group'); return; }
    if (!selectedGroup.members[memberIndex].accepted) {
      setError('Accept the invitation before paying contribution');
      return;
    }

    const hasPendingInvitees = selectedGroup.members.some((member) => !member.accepted);
    if (hasPendingInvitees) {
      setError('All invited members must accept or decline before contribution payment.');
      return;
    }

    const periodKey = getCurrentPeriodKey(selectedGroup, new Date());
    const alreadyPaidThisPeriod = selectedGroup.members[memberIndex].contributions.some((entry) => (
      entry.status === 'paid'
      && entry.memberUsername !== '__PAYOUT__'
      && getContributionPeriodKey(selectedGroup, entry.date) === periodKey
    ));
    if (alreadyPaidThisPeriod) {
      setError('You have already paid for the current contribution cycle.');
      return;
    }

    const memberSlots = Math.max(selectedGroup.members[memberIndex].slots || 1, 1);
    const amt = selectedGroup.contributionAmount * memberSlots;
    if (amt > balance) { setError('Insufficient balance'); return; }

    const contribution = {
      id: Math.random().toString(36).substring(2, 15),
      groupId: selectedGroup.id,
      memberUsername,
      amount: amt,
      date: new Date().toISOString(),
      status: 'paid' as const,
    };

    let updatedMembers = selectedGroup.members.map((member, index) => {
      if (index !== memberIndex) return member;
      return {
        ...member,
        contributions: [contribution, ...member.contributions],
      };
    });

    const payoutResult = maybeDistributeGroupPayout(selectedGroup, updatedMembers);
    updatedMembers = payoutResult.members;

    const result = await updateSavingsGroup(selectedGroup.id, { members: updatedMembers, ...payoutResult.updates });
    if (!result.success) {
      setError(result.message);
      return;
    }

    const payoutToCurrentUser = payoutResult.payoutWinnerUsername?.toLowerCase() === (currentUser?.ajoUsername || '').toLowerCase();
    const nextBalance = payoutToCurrentUser ? balance - amt + payoutResult.payoutAmount : balance - amt;

    try {
      const committedBalance = await commitBackendBalance(nextBalance, balance);
      setBalance(committedBalance);
    } catch {
      setError('Unable to update account balance right now. Please try again.');
      return;
    }

    if (payoutToCurrentUser && payoutResult.payoutAmount > 0) {
      addTransaction({
        id: Math.random().toString(36).substring(2, 15),
        type: 'receive',
        amount: payoutResult.payoutAmount,
        senderAccount: selectedGroup.id,
        receiverAccount: currentUser?.accountNumber || '',
        senderName: `${selectedGroup.name} Pool`,
        receiverName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        description: `Ajo payout - ${selectedGroup.name}`,
        status: 'success',
        timestamp: new Date().toISOString(),
      });

      void createBackendTransaction({
        idempotencyKey: createIdempotencyKey('ajo-payout'),
        type: 'receive',
        amount: payoutResult.payoutAmount,
        senderAccount: selectedGroup.id,
        receiverAccount: currentUser?.accountNumber || '',
        senderName: `${selectedGroup.name} Pool`,
        receiverName: `${currentUser?.firstName} ${currentUser?.lastName}`,
        description: `Ajo payout - ${selectedGroup.name}`,
        status: 'success',
      }).catch(() => {
        // Local state remains usable even if transaction sync fails.
      });
    }

    addTransaction({
      id: Math.random().toString(36).substring(2, 15),
      type: 'ajo', amount: amt,
      senderAccount: currentUser?.accountNumber || '', receiverAccount: selectedGroup.id,
      senderName: `${currentUser?.firstName} ${currentUser?.lastName}`, receiverName: selectedGroup.name,
      description: `Ajo contribution - ${selectedGroup.name}`, status: 'success', timestamp: new Date().toISOString(),
    });

    void createBackendTransaction({
      idempotencyKey: createIdempotencyKey('ajo-contribution'),
      type: 'ajo',
      amount: amt,
      senderAccount: currentUser?.accountNumber || '',
      receiverAccount: selectedGroup.id,
      senderName: `${currentUser?.firstName} ${currentUser?.lastName}`,
      receiverName: selectedGroup.name,
      description: `Ajo contribution - ${selectedGroup.name}`,
      status: 'success',
    }).catch(() => {
      // Local state remains usable even if transaction sync fails.
    });

    setView('main');
    setSelectedGroup({ ...selectedGroup, members: updatedMembers, ...payoutResult.updates });
    setError('');
  };

  const handleInviteResponse = async (accept: boolean) => {
    if (!selectedGroup || !currentUser?.ajoUsername) return;

    const memberIndex = selectedGroup.members.findIndex(
      (member) => member.ajoUsername.toLowerCase() === currentUser.ajoUsername!.toLowerCase(),
    );
    if (memberIndex === -1) {
      setError('Invitation not found');
      return;
    }

    if (!accept) {
      const updatedMembers = selectedGroup.members.filter((_, index) => index !== memberIndex);
      const payoutOrder = buildDefaultPayoutOrder({ ...selectedGroup, members: updatedMembers });
      const updatedGroup = { ...selectedGroup, members: updatedMembers, payoutOrder };
      const result = await updateSavingsGroup(selectedGroup.id, { members: updatedMembers, payoutOrder });
      if (!result.success) {
        setError(result.message);
        return;
      }
      setSelectedGroup(updatedGroup);
      setView('main');
      setError('');
      return;
    }

    const chosenSlots = Number(inviteSlots);
    if (!Number.isInteger(chosenSlots) || chosenSlots < 1) {
      setError('Enter a valid slot number');
      return;
    }

    const usedSlots = selectedGroup.members
      .filter((member) => member.accepted)
      .reduce((sum, member) => sum + member.slots, 0);
    const slotsLeft = selectedGroup.totalMembers - usedSlots;

    if (chosenSlots > slotsLeft) {
      setError(`Only ${slotsLeft} slot(s) left`);
      return;
    }

    const updatedMembers = selectedGroup.members.map((member, index) => {
      if (index !== memberIndex) return member;
      return {
        ...member,
        accepted: true,
        slots: chosenSlots,
      };
    });

    const payoutOrder = buildDefaultPayoutOrder({ ...selectedGroup, members: updatedMembers });
    const updatedGroup = { ...selectedGroup, members: updatedMembers, payoutOrder };
    const result = await updateSavingsGroup(selectedGroup.id, { members: updatedMembers, payoutOrder });
    if (!result.success) {
      setError(result.message);
      return;
    }
    setSelectedGroup(updatedGroup);
    setInviteSlots('1');
    setError('');
  };

  const addMemberToGroup = async (user: AjoLookupUser) => {
    if (!selectedGroup || !currentUser) return;

    if (!user.ajoActivated || !user.ajoUsername) {
      setError('User must activate Ajo before joining a group');
      return;
    }

    if (user.id === currentUser.id) {
      setError('You are already the group creator');
      return;
    }

    const alreadyAdded = selectedGroup.members.some(
      (m) => m.ajoUsername.toLowerCase() === user.ajoUsername!.toLowerCase(),
    );
    if (alreadyAdded) {
      setError('');
      setRecentlyAddedHandles((current) => (
        current.includes(normalizeMemberHandle(user.ajoUsername || user.username))
          ? current
          : [...current, normalizeMemberHandle(user.ajoUsername || user.username)]
      ));
      return;
    }

    const newMember: AjoMember = {
      ajoUsername: user.ajoUsername,
      fullName: `${user.firstName} ${user.lastName}`,
      slots: 0,
      paymentMode: 'manual',
      accepted: false,
      contributions: [],
    };

    const payoutOrder = buildDefaultPayoutOrder({ ...selectedGroup, members: [...selectedGroup.members, newMember] });

    const updatedGroup: SavingsGroup = {
      ...selectedGroup,
      members: [...selectedGroup.members, newMember],
      payoutOrder,
    };

    const result = await updateSavingsGroup(selectedGroup.id, { members: updatedGroup.members, payoutOrder });
    if (!result.success) {
      setError(result.message);
      return;
    }
    setSelectedGroup(updatedGroup);
    const addedHandle = normalizeMemberHandle(user.ajoUsername || user.username);
    setRecentlyAddedHandles((current) => (current.includes(addedHandle) ? current : [...current, addedHandle]));
      // Clear input and suggestions after successful add
      setMemberUsername('');
      setMemberSuggestions([]);
      setMemberSearchLoading(false);
    setError('');
  };

  const handleAddMember = async () => {
    if (!selectedGroup || !currentUser) return;

    const input = memberUsername.trim().replace(/^@+/, '');
    if (!input) {
      setError('Enter a username to add');
      return;
    }

    if (input.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    const usedSlots = selectedGroup.members
      .filter((member) => member.accepted)
      .reduce((sum, member) => sum + member.slots, 0);

    if (usedSlots >= selectedGroup.totalMembers) {
      setError('Group is already full');
      return;
    }

    const normalizedInput = normalizeMemberHandle(input);
    const suggestedExactMatch = memberSuggestions.find((entry) => (
      normalizeMemberHandle(entry.username) === normalizedInput
      || normalizeMemberHandle(entry.ajoUsername || '') === normalizedInput
    ));

    let user = suggestedExactMatch;
    if (!user) {
      try {
        setMemberLookupLoading(true);
        user = await fetchUserByUsername(input);
      } catch {
        setError('User not found on this platform');
        setMemberLookupLoading(false);
        return;
      }
    }

    setMemberLookupLoading(false);
    await addMemberToGroup(user);
  };

  const handleToggleAutoPayment = async (enabled: boolean) => {
    if (!selectedGroup || !currentUser?.ajoUsername) return;
    const nextMode: AjoMember['paymentMode'] = enabled ? 'automatic' : 'manual';

    const updatedMembers = selectedGroup.members.map((member) => {
      const isCurrent = member.ajoUsername.toLowerCase() === currentUser.ajoUsername!.toLowerCase();
      if (!isCurrent) return member;
      return {
        ...member,
        paymentMode: nextMode,
      };
    });

    const payoutOrder = buildDefaultPayoutOrder({ ...selectedGroup, members: updatedMembers });
    const updatedGroup: SavingsGroup = { ...selectedGroup, members: updatedMembers, payoutOrder };
    const result = await updateSavingsGroup(selectedGroup.id, { members: updatedMembers, payoutOrder });
    if (!result.success) {
      setError(result.message);
      return;
    }
    setSelectedGroup(updatedGroup);
    setError('');
  };

  const assignMemberToPayoutNumber = (username: string, payoutNumber: number) => {
    if (!selectedGroup || selectedGroup.creatorUsername !== currentUser?.ajoUsername) return;
    if (payoutAssignmentMode !== 'manual') {
      setError('Switch to Manual mode to assign payout numbers directly.');
      return;
    }

    const baseOrder = buildDefaultPayoutOrder(selectedGroup);
    const targetIndex = payoutNumber - 1;
    if (targetIndex < 0 || targetIndex >= baseOrder.length) return;

    const acceptedMemberExists = selectedGroup.members.some(
      (member) => member.accepted && member.ajoUsername === username,
    );
    if (!acceptedMemberExists) return;

    const sourceOrder = payoutDraftOrder.length === baseOrder.length ? [...payoutDraftOrder] : [...baseOrder];

    const currentUsername = sourceOrder[targetIndex];
    if (currentUsername === username) return;

    const sourceIndex = sourceOrder.findIndex((item, index) => index !== targetIndex && item === username);
    if (sourceIndex === -1) return;

    [sourceOrder[targetIndex], sourceOrder[sourceIndex]] = [sourceOrder[sourceIndex], sourceOrder[targetIndex]];
    setPayoutDraftOrder(sourceOrder);
    setManualRankByUsername(buildManualRankMap(selectedGroup, sourceOrder));
    setError('');
  };

  const handleManualRankChange = (username: string, nextRank: number) => {
    if (!selectedGroup || selectedGroup.creatorUsername !== currentUser?.ajoUsername) return;
    if (payoutAssignmentMode !== 'manual') return;

    const acceptedUsernames = getAcceptedUsernames(selectedGroup);
    if (!acceptedUsernames.includes(username)) return;

    const maxRank = acceptedUsernames.length;
    if (nextRank < 1 || nextRank > maxRank) return;

    const currentMap = { ...manualRankByUsername };
    const currentRank = currentMap[username];
    const previousOwner = Object.keys(currentMap).find((key) => currentMap[key] === nextRank);

    currentMap[username] = nextRank;
    if (previousOwner && previousOwner !== username) {
      if (currentRank) {
        currentMap[previousOwner] = currentRank;
      } else {
        delete currentMap[previousOwner];
      }
    }

    const nextOrder = buildOrderFromManualRank(selectedGroup, currentMap);
    setManualRankByUsername(currentMap);
    setPayoutDraftOrder(nextOrder);
    setError('');
  };

  const handleSelectPayoutMode = (mode: PayoutAssignmentMode) => {
    if (!selectedGroup || selectedGroup.creatorUsername !== currentUser?.ajoUsername) return;

    setPayoutAssignmentMode(mode);
    if (mode === 'manual') {
      const fallbackOrder = buildDefaultPayoutOrder(selectedGroup);
      const sourceOrder = payoutDraftOrder.length === fallbackOrder.length ? payoutDraftOrder : fallbackOrder;
      setPayoutDraftOrder(sourceOrder);
      setManualRankByUsername(buildManualRankMap(selectedGroup, sourceOrder));
      setError('');
      return;
    }

    const nextOrder = buildPayoutOrderByMode(selectedGroup, mode);
    setPayoutDraftOrder(nextOrder);
    setManualRankByUsername(buildManualRankMap(selectedGroup, nextOrder));
    setError('');
  };

  const handleSavePayoutSchedule = async () => {
    if (!selectedGroup || selectedGroup.creatorUsername !== currentUser?.ajoUsername) return;

    const acceptedMembers = selectedGroup.members.filter((member) => member.accepted);
    const acceptedUsernames = acceptedMembers.map((member) => member.ajoUsername);
    const expectedSlots = acceptedMembers.reduce((sum, member) => sum + Math.max(member.slots, 1), 0);
    const nextOrder = payoutDraftOrder.length > 0 ? payoutDraftOrder : buildDefaultPayoutOrder(selectedGroup);

    if (payoutAssignmentMode === 'manual') {
      const expectedRankCount = acceptedMembers.length;
      const assignedRanks = acceptedUsernames
        .map((username) => manualRankByUsername[username])
        .filter((rank): rank is number => Number.isInteger(rank));

      if (assignedRanks.length !== expectedRankCount) {
        setError('Assign one payout number to each member in Manual mode.');
        return;
      }

      const uniqueRanks = new Set(assignedRanks);
      if (uniqueRanks.size !== expectedRankCount) {
        setError('Each payout number can only be used once in Manual mode.');
        return;
      }
    }

    if (nextOrder.length !== expectedSlots) {
      setError('Payout schedule is incomplete. Refresh and assign all payout numbers.');
      return;
    }

    const hasInvalidMember = nextOrder.some((username) => !acceptedUsernames.includes(username));
    if (hasInvalidMember) {
      setError('Payout schedule contains invalid member assignment.');
      return;
    }

    const memberWithoutPayout = acceptedMembers.find(
      (member) => !nextOrder.includes(member.ajoUsername),
    );
    if (memberWithoutPayout) {
      setError(`${memberWithoutPayout.fullName} must have at least one payout number.`);
      return;
    }

    const normalized = buildDefaultPayoutOrder({ ...selectedGroup, payoutOrder: nextOrder });
    const result = await updateSavingsGroup(selectedGroup.id, { payoutOrder: normalized });
    if (!result.success) {
      setError(result.message);
      return;
    }
    
    const updatedGroup = { ...selectedGroup, payoutOrder: normalized };
    setSelectedGroup(updatedGroup);
    
    // Clear draft state after successful save
    setPayoutDraftOrder([]);
    setManualRankByUsername({});
    setPayoutAssignmentMode('manual');
    setError('');
  };

  const handleTogglePayoutEnabled = async (enabled: boolean) => {
    if (!selectedGroup || selectedGroup.creatorUsername !== currentUser?.ajoUsername) return;
    const nextAutoPayout = enabled ? !!selectedGroup.autoPayoutEnabled : false;
    const result = await updateSavingsGroup(selectedGroup.id, {
      payoutEnabled: enabled,
      autoPayoutEnabled: nextAutoPayout,
    });
    if (!result.success) {
      setError(result.message);
      return;
    }
    setSelectedGroup({
      ...selectedGroup,
      payoutEnabled: enabled,
      autoPayoutEnabled: nextAutoPayout,
    });
    setError('');
  };

  const handleToggleAutoPayout = async (enabled: boolean) => {
    if (!selectedGroup || selectedGroup.creatorUsername !== currentUser?.ajoUsername) return;
    if (enabled && !selectedGroup.payoutEnabled) {
      setError('Activate payout on contribution first');
      return;
    }
    const result = await updateSavingsGroup(selectedGroup.id, { autoPayoutEnabled: enabled });
    if (!result.success) {
      setError(result.message);
      return;
    }
    setSelectedGroup({ ...selectedGroup, autoPayoutEnabled: enabled });
    setError('');
  };

  const handleRemoveMemberFromGroup = async (memberUsername: string) => {
    if (!selectedGroup || !currentUser?.ajoUsername) return;
    if (selectedGroup.creatorUsername !== currentUser.ajoUsername) {
      setError('Only group creator can remove members');
      return;
    }

    const firstContributionAt = selectedGroup.firstContributionDate
      ? new Date(`${selectedGroup.firstContributionDate}T00:00:00`)
      : null;

    if (!firstContributionAt || Number.isNaN(firstContributionAt.getTime())) {
      setError('Unable to resolve first contribution date for this group');
      return;
    }

    if (Date.now() >= firstContributionAt.getTime()) {
      setError('Members can only be removed before the first contribution date');
      return;
    }

    if (memberUsername.toLowerCase() === selectedGroup.creatorUsername.toLowerCase()) {
      setError('Creator cannot be removed from the group');
      return;
    }

    const memberToRemove = selectedGroup.members.find(
      (member) => member.ajoUsername.toLowerCase() === memberUsername.toLowerCase(),
    );
    if (!memberToRemove) {
      setError('Member not found in group');
      return;
    }

    const shouldRemove = window.confirm(
      `Remove ${memberToRemove.fullName} (@${memberToRemove.ajoUsername}) from this group?`,
    );
    if (!shouldRemove) {
      return;
    }

    const updatedMembers = selectedGroup.members.filter(
      (member) => member.ajoUsername.toLowerCase() !== memberUsername.toLowerCase(),
    );

    const payoutOrder = buildDefaultPayoutOrder({ ...selectedGroup, members: updatedMembers });
    const nextPayoutIndex = payoutOrder.length > 0
      ? ((selectedGroup.nextPayoutIndex ?? 0) % payoutOrder.length)
      : 0;
    const result = await updateSavingsGroup(selectedGroup.id, { members: updatedMembers, payoutOrder, nextPayoutIndex });
    if (!result.success) {
      setError(result.message);
      return;
    }

    setSelectedGroup({ ...selectedGroup, members: updatedMembers, payoutOrder, nextPayoutIndex });
    setError('');
  };

  const canDeleteGroupByRule = (group: SavingsGroup) => {
    const paidContributionDates = group.members.flatMap((member) =>
      member.contributions
        .filter((contribution) => contribution.status === 'paid')
        .map((contribution) => new Date(contribution.date).getTime()),
    );
    const hasAnyContributionPayment = paidContributionDates.length > 0;
    const lastContributionTimestamp = hasAnyContributionPayment ? Math.max(...paidContributionDates) : null;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;

    return !hasAnyContributionPayment || (
      lastContributionTimestamp !== null && Date.now() <= lastContributionTimestamp + twoWeeksMs
    );
  };

  const handleDeleteGroupWithPin = async (pin: string) => {
    if (!selectedGroup || !currentUser) return;
    if (pin !== currentUser.pin) {
      setError('Incorrect PIN');
      return;
    }
    if (selectedGroup.creatorUsername !== currentUser.ajoUsername) {
      setError('Only group creator can delete this group');
      return;
    }
    if (!canDeleteGroupByRule(selectedGroup)) {
      setError('Group can only be deleted before first payment or within two weeks after the last contribution date');
      return;
    }

    const result = await removeSavingsGroup(selectedGroup.id);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setSelectedGroup(null);
    setView('main');
    setError('');
  };

  if (view === 'pay-pin') {
    return (
      <div className="py-10 flex flex-col items-center animate-fade-in">
        <h2 className="md:text-xl text-[15px] font-bold text-foreground mb-2 flex items-center gap-2">
          <img src="/logo.svg" alt="logo" className="w-5 h-5 object-contain" />
          <span>Pay Contribution</span>
        </h2>
        <p className="text-muted-foreground mb-8">₦{selectedGroup?.contributionAmount.toLocaleString()} to {selectedGroup?.name}</p>
        <PinInput label="Enter your PIN" onComplete={handlePayContribution} />
        {error && <p className="text-destructive text-sm mt-4">{error}</p>}
      </div>
    );
  }

  if (view === 'delete-pin') {
    return (
      <div className="w-full min-h-[calc(100vh-120px)] flex flex-col items-center justify-center animate-fade-in px-4">
        <div className="max-w-md w-full">
          <h2 className="md:text-xl text-[15px] font-bold text-foreground mb-2 flex items-center justify-center gap-2">
            <img src="/logo.svg" alt="logo" className="w-5 h-5 object-contain" />
            <span>Confirm Group Deletion</span>
          </h2>
          <p className="text-muted-foreground mb-8 text-center">Enter your PIN to delete this contribution group</p>
          <div className="flex justify-center">
            <PinInput label="Enter your PIN" onComplete={handleDeleteGroupWithPin} />
          </div>
          {error && <p className="text-destructive text-sm mt-4 text-center">{error}</p>}
        </div>
      </div>
    );
  }
  if (view === 'details' && selectedGroup) {
    const isCreator = selectedGroup.creatorUsername === currentUser?.ajoUsername;
    const firstContributionAt = selectedGroup.firstContributionDate
      ? new Date(`${selectedGroup.firstContributionDate}T00:00:00`)
      : null;
    const canCreatorRemoveMembers = !!isCreator
      && !!firstContributionAt
      && !Number.isNaN(firstContributionAt.getTime())
      && Date.now() < firstContributionAt.getTime();
    const acceptedMembersCount = selectedGroup.members.filter((member) => member.accepted).length;
    const pendingInvitesCount = selectedGroup.members.filter((member) => !member.accepted).length;
    const usedSlots = selectedGroup.members
      .filter((member) => member.accepted)
      .reduce((sum, member) => sum + member.slots, 0);
    const targetContributionAmount = selectedGroup.contributionAmount * usedSlots;
    const totalContributionPaid = selectedGroup.members.reduce(
      (memberSum, member) => memberSum + member.contributions
        .filter((contribution) => contribution.status === 'paid' && contribution.memberUsername !== '__PAYOUT__')
        .reduce((sum, contribution) => sum + contribution.amount, 0),
      0,
    );
    const contributionDescription = `${selectedGroup.frequency} | ${selectedGroup.frequencyDay}`;
    const slotsLeft = Math.max(selectedGroup.totalMembers - usedSlots, 0);
    const groupIsFull = slotsLeft <= 0;
    const normalizedInputHandle = normalizeMemberHandle(memberUsername);
    const typedUserAlreadyAdded = !!normalizedInputHandle && selectedGroup.members.some(
      (member) => normalizeMemberHandle(member.ajoUsername) === normalizedInputHandle,
    );
    const currentMember = selectedGroup.members.find(
      (member) => member.ajoUsername.toLowerCase() === (currentUser?.ajoUsername || '').toLowerCase(),
    );
    const isPendingInvite = !!currentMember && !currentMember.accepted && !isCreator;
    const durationParts: string[] = [];
    if (selectedGroup.totalMonths > 0) {
      durationParts.push(`${selectedGroup.totalMonths} month${selectedGroup.totalMonths > 1 ? 's' : ''}`);
    }
    if ((selectedGroup.totalWeeks || 0) > 0) {
      durationParts.push(`${selectedGroup.totalWeeks} week${(selectedGroup.totalWeeks || 0) > 1 ? 's' : ''}`);
    }
    const durationText = durationParts.length > 0 ? durationParts.join(' ') : '0 week';
    const paidMembers = selectedGroup.members.filter((member) =>
      member.contributions.some((contribution) => contribution.status === 'paid' && contribution.memberUsername !== '__PAYOUT__'),
    );
    const payoutHistory = selectedGroup.members
      .flatMap((member) => member.contributions
        .filter((contribution) => contribution.status === 'paid' && contribution.memberUsername === '__PAYOUT__')
        .map((contribution) => ({
          id: contribution.id,
          amount: contribution.amount,
          date: contribution.date,
          recipientName: member.fullName,
          recipientUsername: member.ajoUsername,
        })))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const payoutOrder = buildDefaultPayoutOrder(selectedGroup);
    const activePayoutOrder = payoutDraftOrder.length === payoutOrder.length ? payoutDraftOrder : payoutOrder;
    const savedPayoutOrder = buildDefaultPayoutOrder({
      ...selectedGroup,
      payoutOrder: selectedGroup.payoutOrder || [],
    });
    const payoutOrderForCalendar = savedPayoutOrder.length > 0 ? savedPayoutOrder : activePayoutOrder;
    const acceptedMembers = selectedGroup.members.filter((member) => member.accepted);
    const manualRanks = acceptedMembers
      .map((member) => manualRankByUsername[member.ajoUsername])
      .filter((rank): rank is number => Number.isInteger(rank));
    const isManualReadyToSave = manualRanks.length === acceptedMembers.length && new Set(manualRanks).size === acceptedMembers.length;
    const isModeReadyToSave = payoutAssignmentMode === 'manual' ? isManualReadyToSave : acceptedMembers.length > 0;
    const isPayoutScheduleLocked = selectedGroup.members.some((member) =>
      member.contributions.some((contribution) => contribution.status === 'paid' && contribution.memberUsername === '__PAYOUT__'),
    ) || (selectedGroup.nextPayoutIndex ?? 0) > 0;
    const nextPayoutMemberUsername = payoutOrder.length > 0
      ? payoutOrder[(selectedGroup.nextPayoutIndex ?? 0) % payoutOrder.length]
      : null;
    const nextPayoutMember = selectedGroup.members.find((member) => member.ajoUsername === nextPayoutMemberUsername);
    const contributionEntries = selectedGroup.members.flatMap((member) => (
      member.contributions
        .filter((contribution) => contribution.status === 'paid' && contribution.memberUsername !== '__PAYOUT__')
        .map((contribution) => ({
          id: contribution.id,
          memberUsername: member.ajoUsername,
          memberName: member.fullName,
          amount: contribution.amount,
          date: contribution.date,
          dateKey: formatDateKey(contribution.date),
          periodKey: getContributionPeriodKey(selectedGroup, contribution.date),
          timestamp: new Date(contribution.date).getTime(),
        }))
    ));

    const contributionsByDate = contributionEntries.reduce<Record<string, typeof contributionEntries>>((acc, entry) => {
      if (!acc[entry.dateKey]) acc[entry.dateKey] = [];
      acc[entry.dateKey].push(entry);
      return acc;
    }, {});

    const periodFirstTimestamp: Record<string, number> = {};
    contributionEntries.forEach((entry) => {
      const existing = periodFirstTimestamp[entry.periodKey];
      if (existing === undefined || entry.timestamp < existing) {
        periodFirstTimestamp[entry.periodKey] = entry.timestamp;
      }
    });

    const sortedPeriodKeys = Object.keys(periodFirstTimestamp).sort((a, b) => periodFirstTimestamp[a] - periodFirstTimestamp[b]);
    const periodIndexByKey = sortedPeriodKeys.reduce<Record<string, number>>((acc, key, index) => {
      acc[key] = index;
      return acc;
    }, {});

    const selectedDateEntries = selectedHistoryDateKey ? (contributionsByDate[selectedHistoryDateKey] || []) : [];
    const selectedCalendarDate = selectedHistoryDateKey ? parseDateKeyAsLocalDate(selectedHistoryDateKey) : null;
    const selectedDatePeriodKey = selectedCalendarDate
      ? getCurrentPeriodKey(selectedGroup, selectedCalendarDate)
      : null;

    const getScheduledContributionDates = (group: SavingsGroup) => {
      const anchorDate = new Date(group.firstContributionDate || group.createdAt);
      anchorDate.setHours(0, 0, 0, 0);

      const endDate = new Date(anchorDate.getTime());
      if ((group.totalMonths || 0) > 0) {
        endDate.setMonth(endDate.getMonth() + group.totalMonths);
      }
      if ((group.totalWeeks || 0) > 0) {
        endDate.setDate(endDate.getDate() + (group.totalWeeks || 0) * 7);
      }

      const scheduled: Date[] = [];
      const cursor = new Date(anchorDate.getTime());
      let safeCount = 0;
      const maxIterations = 600;

      while (cursor.getTime() <= endDate.getTime() && safeCount < maxIterations) {
        scheduled.push(new Date(cursor.getTime()));
        if (group.frequency === 'weekly') {
          cursor.setDate(cursor.getDate() + 7);
        } else if (group.frequency === 'biweekly') {
          cursor.setDate(cursor.getDate() + 14);
        } else {
          cursor.setMonth(cursor.getMonth() + 1);
        }
        safeCount += 1;
      }

      return scheduled;
    };

    const scheduledContributionDates = getScheduledContributionDates(selectedGroup);
    const scheduledDateKeySet = new Set(scheduledContributionDates.map((date) => formatDateKey(date)));
    const scheduledPeriodKeys = Array.from(new Set(
      scheduledContributionDates.map((date) => getCurrentPeriodKey(selectedGroup, date)),
    ));
    const schedulePeriodIndexByKey = scheduledPeriodKeys.reduce<Record<string, number>>((acc, key, index) => {
      acc[key] = index;
      return acc;
    }, {});
    const selectedPeriodIndex = selectedDatePeriodKey
      ? (schedulePeriodIndexByKey[selectedDatePeriodKey] ?? periodIndexByKey[selectedDatePeriodKey])
      : undefined;
    const scheduledRecipientUsername = selectedPeriodIndex !== undefined && payoutOrderForCalendar.length > 0
      ? payoutOrderForCalendar[selectedPeriodIndex % payoutOrderForCalendar.length]
      : null;
    const scheduledRecipient = scheduledRecipientUsername
      ? selectedGroup.members.find((member) => member.ajoUsername === scheduledRecipientUsername)
      : null;
    const selectedDateLatestTimestamp = selectedDateEntries.length > 0
      ? Math.max(...selectedDateEntries.map((entry) => entry.timestamp))
      : (selectedCalendarDate ? selectedCalendarDate.getTime() : null);
    const scheduledPayoutDate = selectedDateLatestTimestamp !== null
      ? new Date(selectedDateLatestTimestamp + (24 * 60 * 60 * 1000))
      : null;
    const currentMonthScheduleRows = scheduledContributionDates
      .filter((date) => (
        date.getFullYear() === historyMonthCursor.getFullYear()
        && date.getMonth() === historyMonthCursor.getMonth()
      ))
      .map((date) => {
        const periodKey = getCurrentPeriodKey(selectedGroup, date);
        const periodIndex = schedulePeriodIndexByKey[periodKey] ?? periodIndexByKey[periodKey] ?? 0;
        const username = payoutOrderForCalendar.length > 0
          ? payoutOrderForCalendar[periodIndex % payoutOrderForCalendar.length]
          : null;
        const member = username
          ? selectedGroup.members.find((entry) => entry.ajoUsername === username)
          : null;
        const payoutDate = new Date(date.getTime() + (24 * 60 * 60 * 1000));

        return {
          key: `${formatDateKey(date)}-${periodIndex}`,
          contributionDate: date,
          payoutDate,
          memberName: member ? `${member.fullName} (@${member.ajoUsername})` : 'Not assigned yet',
        };
      });

    const calendarMonthStart = new Date(historyMonthCursor.getFullYear(), historyMonthCursor.getMonth(), 1);
    const calendarMonthEnd = new Date(historyMonthCursor.getFullYear(), historyMonthCursor.getMonth() + 1, 0);
    const calendarLeadingBlanks = calendarMonthStart.getDay();
    const calendarDays = Array.from({ length: calendarMonthEnd.getDate() }, (_, index) => index + 1);
    const paidContributionDates = selectedGroup.members.flatMap((member) =>
      member.contributions
        .filter((contribution) => contribution.status === 'paid')
        .map((contribution) => new Date(contribution.date).getTime()),
    );
    const hasAnyContributionPayment = paidContributionDates.length > 0;
    const lastContributionTimestamp = hasAnyContributionPayment ? Math.max(...paidContributionDates) : null;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const canDeleteGroup = isCreator && canDeleteGroupByRule(selectedGroup);
    const deleteHelperText = hasAnyContributionPayment && lastContributionTimestamp !== null
      ? `Delete allowed until ${new Date(lastContributionTimestamp + twoWeeksMs).toLocaleDateString('en-NG')}`
      : 'No contribution payment yet. Group can be deleted now.';

    const handleDeleteGroup = () => {
      if (!canDeleteGroup) {
        setError('Group can only be deleted before first payment or within two weeks after the last contribution date');
        return;
      }

      setView('delete-pin');
      setError('');
    };

    return (
      <div className="py-4 md:px-0 px-2 animate-fade-in">
        <button onClick={() => setView('main')} className="w-10 h-10 rounded-full flex items-center justify-center mb-6">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>

        {/* Group payment card */}
        <div className="rounded-[10px] gradient-card p-6 text-primary-foreground mb-6">
          <p className="text-sm text-primary-foreground/70">Contribution Paid (Running Total)</p>
          <p className="text-3xl font-bold">₦{totalContributionPaid.toLocaleString()}</p>
          <p className="text-sm mt-2">Target: ₦{targetContributionAmount.toLocaleString()}</p>
          <p className="text-sm mt-1">{contributionDescription}</p>
        </div>

        <h1 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
          <img src="/logo.svg" alt="logo" className="w-5 h-5 object-contain" />
          <span>{selectedGroup.name}</span>
        </h1>
        <div className="space-y-3 mb-6 border border-border rounded-[10px] p-4">
          <p className="text-sm text-muted-foreground">Creator: <span className="text-foreground font-medium">{selectedGroup.creatorUsername}</span></p>
          <p className="text-sm text-muted-foreground">Members: <span className="text-foreground font-medium">{acceptedMembersCount}</span></p>
          {pendingInvitesCount > 0 && (
            <p className="text-sm text-muted-foreground">Pending Invitations: <span className="text-foreground font-medium">{pendingInvitesCount}</span></p>
          )}
          <p className="text-sm text-muted-foreground">Slots Left: <span className="text-foreground font-medium">{slotsLeft}</span></p>
          <p className="text-sm text-muted-foreground">Contribution Description: <span className="text-foreground font-medium">₦{selectedGroup.contributionAmount.toLocaleString()} per slot • {contributionDescription}</span></p>
          <p className="text-sm text-muted-foreground">Duration: <span className="text-foreground font-medium">{durationText}</span></p>
          <p className="text-sm text-muted-foreground">Late penalty: <span className="text-foreground font-medium">₦{selectedGroup.latePenalty.toLocaleString()}</span></p>
          <p className="text-sm text-muted-foreground">Next payout member: <span className="text-foreground font-medium">{nextPayoutMember?.fullName || 'Not set'}</span></p>
          <p className="text-sm text-muted-foreground">Payout on contribution: <span className="text-foreground font-medium">{selectedGroup.payoutEnabled ? 'Enabled' : 'Disabled'}</span></p>
          <p className="text-sm text-muted-foreground">Auto payout: <span className="text-foreground font-medium">{selectedGroup.autoPayoutEnabled ? 'Enabled' : 'Disabled'}</span></p>
        </div>

        {isPendingInvite ? (
          <div className=" rounded-[10px] p-4 mb-4 border border-border space-y-4">
            <div>
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
                <span>Group Invitation</span>
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Contribution: ₦{selectedGroup.contributionAmount.toLocaleString()} • {selectedGroup.frequency} • {selectedGroup.frequencyDay}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">Select Slot(s)</label>
              {slotsLeft > 0 ? (
                <div className="space-y-2">
                  <select
                    value={inviteSlots}
                    onChange={(e) => setInviteSlots(e.target.value)}
                    className="w-full p-3 rounded-xl bg-background border border-border text-foreground outline-none focus:border-primary"
                  >
                    {Array.from({ length: slotsLeft }, (_, index) => index + 1).map((slotCount) => (
                      <option key={`invite-slot-${slotCount}`} value={String(slotCount)}>
                        {slotCount} slot{slotCount > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Choose how many slots you want in this group.</p>
                </div>
              ) : (
                <p className="text-xs text-destructive">No slots left in this group.</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">Slots available: {slotsLeft}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleInviteResponse(true)}
                disabled={slotsLeft <= 0}
                className="flex-1 py-3 rounded-[10px] gradient-primary text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Accept
              </button>
              <button
                onClick={() => handleInviteResponse(false)}
                className="flex-1 py-3 rounded-[10px] border border-border bg-card text-foreground font-semibold"
              >
                Decline
              </button>
            </div>
          </div>
        ) : (
          <>
            {(isCreator || currentMember?.accepted) && (
              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {isCreator && (
                    <div className=" rounded-[10px] p-3 border border-border flex items-start justify-between gap-3 min-h-[110px]">
                      <div>
                        <p className="font-semibold text-foreground text-sm flex items-center gap-2">
                          <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
                          <span>Activate Payout</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Enable payout cycle for this group.</p>
                      </div>
                      <Switch
                        checked={!!selectedGroup.payoutEnabled}
                        onCheckedChange={handleTogglePayoutEnabled}
                        aria-label="Toggle payout on contribution"
                      />
                    </div>
                  )}

                  {isCreator && (
                    <div className=" rounded-[10px] p-3 border border-border flex items-start justify-between gap-3 min-h-[110px]">
                      <div>
                        <p className="font-semibold text-foreground text-sm flex items-center gap-2">
                          <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
                          <span>Auto Payout</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Auto-pay scheduled member on due date.</p>
                      </div>
                      <Switch
                        checked={!!selectedGroup.autoPayoutEnabled}
                        onCheckedChange={handleToggleAutoPayout}
                        aria-label="Toggle auto payout"
                      />
                    </div>
                  )}

                  {currentMember?.accepted && (
                    <div className=" rounded-[10px] md:p-3 p-2 border border-border flex items-start justify-between gap-3 min-h-[110px]">
                      <div>
                        <p className="font-semibold text-foreground text-sm flex items-center gap-2">
                          <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
                          <span className='md:text-[16px] text-[12px]'>Contribution Auto Pay</span>
                        </p>
                        <p className="md:text-xs text-[10px] text-muted-foreground mt-1">Auto-pay if main account balance is enough.</p>
                      </div>
                      <Switch
                        checked={currentMember.paymentMode === 'automatic'}
                        onCheckedChange={handleToggleAutoPayment}
                        aria-label="Toggle contribution auto payment"
                      />
                    </div>
                  )}
                </div>

                {isCreator && (
                  <div className=" rounded-[10px] p-4 border border-border">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
                      <span>Payout Schedule</span>
                      {isPayoutScheduleLocked && <span className="text-xs bg-green-500/20 text-green-600 px-2 py-1 rounded-full font-medium">Finalized</span>}
                    </h3>

                    {isPayoutScheduleLocked ? (
                      <div className="space-y-3">
                        <p className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                          ✓ Payout schedule has been finalized and cannot be edited.
                        </p>
                        {selectedGroup.members
                          .filter((member) => member.accepted)
                          .map((member) => {
                            const assignedNumbers = (selectedGroup.payoutOrder || []).reduce<string[]>((acc, username, index) => {
                              if (username === member.ajoUsername) {
                                acc.push(`#${index + 1}`);
                              }
                              return acc;
                            }, []);
                            return (
                              <div key={member.ajoUsername} className="p-3 rounded-[10px] bg-background border border-border opacity-75">
                                <p className="font-medium text-foreground">{member.fullName}</p>
                                <p className="text-xs text-muted-foreground">@{member.ajoUsername}</p>
                                <p className="text-xs text-muted-foreground">Payout position: <span className="font-semibold text-foreground">{assignedNumbers.length > 0 ? assignedNumbers.join(', ') : 'Not assigned'}</span></p>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground mb-3">Choose how members receive payouts:</p>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                          <div>
                            <button
                              type="button"
                              onClick={() => handleSelectPayoutMode('up-to-down')}
                              className={`w-full py-2 rounded-[10px] border text-sm font-semibold ${
                                payoutAssignmentMode === 'up-to-down'
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-foreground border-border'
                              }`}
                            >
                              Bottom to Top
                            </button>
                            <p className="text-xs text-muted-foreground mt-1">Payout from bottom members up</p>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => handleSelectPayoutMode('down-to-up')}
                              className={`w-full py-2 rounded-[10px] border text-sm font-semibold ${
                                payoutAssignmentMode === 'down-to-up'
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-foreground border-border'
                              }`}
                            >
                              Top to Bottom
                            </button>
                            <p className="text-xs text-muted-foreground mt-1">Payout from top members down</p>
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => handleSelectPayoutMode('manual')}
                              className={`w-full py-2 rounded-[10px] border text-sm font-semibold ${
                                payoutAssignmentMode === 'manual'
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-foreground border-border'
                              }`}
                            >
                              Manual
                            </button>
                            <p className="text-xs text-muted-foreground mt-1">Creator arranges order</p>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">Payout is released 24 hours after each contribution cycle completes.</p>
                        {payoutAssignmentMode === 'manual' && (
                          <div className="bg-blue-500/10 border border-blue-500/30 text-blue-600 text-xs p-3 rounded-lg mb-3">
                            <p className="font-semibold mb-1">💡 Multiple Slots Assignment</p>
                            <p>Members with multiple slots will each receive a payout. Assign them a starting position, and they'll receive payouts in subsequent rounds based on their slot count.</p>
                          </div>
                        )}
                        <div className="space-y-3">
                          {selectedGroup.members
                            .filter((member) => member.accepted)
                            .map((member) => {
                              const assignedNumbers = activePayoutOrder.reduce<string[]>((acc, assignedUsername, index) => {
                                if (assignedUsername === member.ajoUsername) {
                                  acc.push(`#${index + 1}`);
                                }
                                return acc;
                              }, []);

                              return (
                                <div key={member.ajoUsername} className="p-3 rounded-[10px] bg-background border border-border">
                                  <p className="font-medium text-foreground">{member.fullName}</p>
                                  <p className="text-xs text-muted-foreground">@{member.ajoUsername}</p>
                                  <p className="text-xs text-muted-foreground mb-2">Slots: <span className="font-semibold">{Math.max(member.slots || 1, 1)}</span> | Payout positions: {assignedNumbers.length > 0 ? <span className="font-semibold text-primary">{assignedNumbers.join(', ')}</span> : <span className="text-muted-foreground">Not assigned</span>}</p>
                                  {payoutAssignmentMode === 'manual' ? (
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <label className="text-xs text-muted-foreground">Starting payout position:</label>
                                        <select
                                          value={manualRankByUsername[member.ajoUsername] || ''}
                                          onChange={(e) => handleManualRankChange(member.ajoUsername, Number(e.target.value))}
                                          className="h-9 px-3 rounded-[10px] border border-border bg-card text-foreground text-sm outline-none focus:border-primary"
                                        >
                                          <option value="">Select position</option>
                                          {selectedGroup.members
                                            .filter((item) => item.accepted)
                                            .map((_, index) => (
                                              <option key={`${member.ajoUsername}-rank-${index + 1}`} value={index + 1}>
                                                Position #{index + 1}
                                              </option>
                                            ))}
                                        </select>
                                      </div>
                                      {manualRankByUsername[member.ajoUsername] && (
                                        <p className="text-xs bg-blue-500/10 text-blue-600 p-2 rounded">
                                          This member will receive {Math.max(member.slots || 1, 1)} payout{Math.max(member.slots || 1, 1) > 1 ? 's' : ''} - one for each slot they hold
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                                      {activePayoutOrder.map((assignedUsername, index) => {
                                        const isAssigned = assignedUsername === member.ajoUsername;
                                        return (
                                          <button
                                            key={`${member.ajoUsername}-slot-${index + 1}`}
                                            type="button"
                                            onClick={() => assignMemberToPayoutNumber(member.ajoUsername, index + 1)}
                                            className={`h-8 rounded-lg text-xs font-semibold border transition-colors ${
                                              isAssigned
                                                ? 'bg-primary text-primary-foreground border-primary'
                                                : 'bg-card text-foreground border-border'
                                            } opacity-70 cursor-not-allowed`}
                                            disabled
                                          >
                                            {index + 1}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                        <button
                          type="button"
                          onClick={handleSavePayoutSchedule}
                          disabled={!isModeReadyToSave}
                          className="mt-3 w-full sm:w-auto px-5 py-2 rounded-[10px] gradient-primary text-primary-foreground font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Save Payout Schedule
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentMember?.accepted && (
              <button onClick={() => { setView('pay-pin'); }} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-[500] text-[14.5px] md:text-lg mb-1">
                Pay Contribution
              </button>
            )}
            {currentMember?.accepted && (
              <p className="md:text-xs text-[12px] text-muted-foreground mb-4">
                Manual payment is allowed anytime in the current cycle, including before due date or after missed auto-pay.
              </p>
            )}
          </>
        )}

        {isCreator && (
          <div className=" rounded-[10px] p-4 mb-4 border border-border">
            <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
              <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
              <span>Add Member by Username</span>
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={memberUsername}
                onChange={(e) => handleMemberUsernameChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleAddMember();
                  }
                }}
                placeholder="Search by username or @ajoUsername"
                className="flex-1 p-3 rounded-[10px] bg-background border border-border text-foreground outline-none focus:border-primary"
              />
              <button
                onClick={handleAddMember}
                disabled={groupIsFull || memberLookupLoading || memberSearchLoading || typedUserAlreadyAdded}
                className="px-4 py-3 rounded-[10px] gradient-primary text-primary-foreground font-semibold disabled:opacity-50"
              >
                {typedUserAlreadyAdded ? 'Added' : memberLookupLoading ? 'Searching...' : 'Add'}
              </button>
            </div>
            {memberSearchLoading && (
              <p className="text-xs text-muted-foreground mt-2">Searching users...</p>
            )}
            {!memberSearchLoading && memberSuggestions.length > 0 && (
              <div className="mt-2 space-y-2">
                {memberSuggestions.map((user) => (
                  (() => {
                    const memberHandle = normalizeMemberHandle(user.ajoUsername || user.username);
                    const isAlreadyAdded = selectedGroup.members.some(
                      (member) => normalizeMemberHandle(member.ajoUsername) === memberHandle,
                    ) || recentlyAddedHandles.includes(memberHandle);

                    return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      void addMemberToGroup(user);
                    }}
                      disabled={isAlreadyAdded || !user.ajoActivated}
                      className={`w-full flex items-center justify-between rounded-[10px] border px-3 py-2 text-left transition-colors ${
                        isAlreadyAdded || !user.ajoActivated
                          ? 'bg-muted border-border cursor-not-allowed opacity-50'
                          : 'border-border bg-background hover:bg-muted/40 cursor-pointer'
                      }`}
                      title={!user.ajoActivated ? 'User must activate Ajo first' : isAlreadyAdded ? 'Already added' : 'Add to group'}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-muted-foreground">@{user.ajoUsername || user.username}</p>
                    </div>
                      <span className={`text-xs font-semibold ${
                        !user.ajoActivated
                          ? 'text-yellow-600'
                          : isAlreadyAdded
                            ? 'text-success'
                            : 'text-[#093A5B]'
                      }`}>
                        {!user.ajoActivated ? 'Ajo inactive' : isAlreadyAdded ? 'Added' : 'Add'}
                    </span>
                  </button>
                    );
                  })()
                ))}
              </div>
            )}
            {groupIsFull && (
              <p className="text-xs text-muted-foreground mt-2">This group has reached its member limit.</p>
            )}
          </div>
        )}

        <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
          <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
          <span>Members</span>
        </h3>
        {isCreator && (
          <p className="text-xs text-muted-foreground mb-2">
            {canCreatorRemoveMembers
              ? 'You can remove any member before the first contribution date.'
              : 'Member removal is locked after the first contribution date.'}
          </p>
        )}
        <div className="space-y-2">
          {selectedGroup.members.map(m => (
            <div key={m.ajoUsername} className="flex items-center justify-between p-3 rounded-[10px] border border-border ">
              <div>
                <p className="font-medium text-foreground">{m.fullName}</p>
                <p className="text-xs text-muted-foreground">@{m.ajoUsername} • {m.slots} slot(s) • {m.paymentMode}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${m.accepted ? 'text-success' : 'text-warning'}`}>
                  {m.accepted ? 'Accepted' : 'Pending'}
                </span>
                {canCreatorRemoveMembers && m.ajoUsername.toLowerCase() !== selectedGroup.creatorUsername.toLowerCase() && (
                  <button
                    type="button"
                    onClick={() => void handleRemoveMemberFromGroup(m.ajoUsername)}
                    className="px-2 py-1 rounded-[10px] md:text-xs text-[14px] font-semibold bg-destructive/10 text-destructive"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-[10px] p-4 border border-border">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
            <span>Paid Members</span>
          </h3>
          {paidMembers.length > 0 ? (
            <div className="space-y-2">
              {paidMembers.map((member) => {
                const totalPaid = member.contributions
                  .filter((contribution) => contribution.status === 'paid' && contribution.memberUsername !== '__PAYOUT__')
                  .reduce((sum, contribution) => sum + contribution.amount, 0);
                const lastPaidDate = member.contributions
                  .filter((contribution) => contribution.status === 'paid' && contribution.memberUsername !== '__PAYOUT__')[0]?.date;

                return (
                  <div key={member.ajoUsername} className="flex items-center justify-between p-3 rounded-[10px] bg-background border border-border">
                    <div>
                      <p className="font-medium text-foreground">{member.fullName}</p>
                      <p className="text-xs text-muted-foreground">@{member.ajoUsername}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-foreground">₦{totalPaid.toLocaleString()}</p>
                      {lastPaidDate && (
                        <p className="text-xs text-muted-foreground">{new Date(lastPaidDate).toLocaleDateString('en-NG')}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No member has made any contribution yet.</p>
          )}
        </div>

        <div className="mt-6 rounded-[10px] p-4 border border-border">
          <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
            <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
            <span>Contribution & Payout Calendar</span>
          </h3>
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => setHistoryMonthCursor(new Date(historyMonthCursor.getFullYear(), historyMonthCursor.getMonth() - 1, 1))}
              className="px-3 py-1 rounded-[10px] border border-border text-xs font-semibold"
            >
              Prev
            </button>
            <p className="text-sm font-semibold text-foreground">
              {calendarMonthStart.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })}
            </p>
            <button
              type="button"
              onClick={() => setHistoryMonthCursor(new Date(historyMonthCursor.getFullYear(), historyMonthCursor.getMonth() + 1, 1))}
              className="px-3 py-1 rounded-[10px] border border-border text-xs font-semibold"
            >
              Next
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground mb-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
              <p key={label} className="py-1">{label}</p>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calendarLeadingBlanks }).map((_, index) => (
              <div key={`blank-${index}`} className="h-11" />
            ))}
            {calendarDays.map((day) => {
              const cellDate = new Date(historyMonthCursor.getFullYear(), historyMonthCursor.getMonth(), day);
              const dateKey = formatDateKey(cellDate);
              const hasContribution = !!contributionsByDate[dateKey]?.length;
              const isScheduledContributionDate = scheduledDateKeySet.has(dateKey);
              const isSelected = selectedHistoryDateKey === dateKey;

              return (
                <button
                  key={dateKey}
                  type="button"
                  onClick={() => (isScheduledContributionDate || hasContribution) && setSelectedHistoryDateKey(dateKey)}
                  className={`h-11 rounded-[10px] border relative text-xs font-medium ${
                    isScheduledContributionDate
                      ? 'border-[#093A5B] bg-[#093A5B] text-white'
                      : 'border-border bg-background text-foreground'
                  } ${(isScheduledContributionDate || hasContribution) ? 'cursor-pointer' : 'opacity-60 cursor-default'}`}
                >
                  {day}
                  {(isScheduledContributionDate || hasContribution) && (
                    <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                  {isSelected && (
                    <span className="absolute inset-0 rounded-[10px] ring-2 ring-offset-0 ring-[#093A5B]/50" />
                  )}
                </button>
              );
            })}
          </div>

          {selectedHistoryDateKey ? (
            <div className="mt-4 p-3 rounded-[10px] bg-background border border-border">
              <p className="text-sm font-semibold text-foreground mb-2">
                {new Date(selectedHistoryDateKey).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-xs text-muted-foreground mb-2">Successful contributions</p>
              {selectedDateEntries.length > 0 ? (
                <div className="space-y-2">
                  {selectedDateEntries.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between rounded-[10px] border border-border bg-card p-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{entry.memberName}</p>
                        <p className="text-xs text-muted-foreground">@{entry.memberUsername}</p>
                      </div>
                      <p className="text-sm font-semibold text-foreground">₦{entry.amount.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No contribution on this date.</p>
              )}

              <div className="mt-3">
                <p className="text-xs text-muted-foreground">Payout details for this contribution date</p>
                <p className="text-sm text-foreground mt-1">
                  Payout date: <span className="font-semibold">{scheduledPayoutDate ? scheduledPayoutDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Not available'}</span>
                </p>
                <p className="text-sm font-semibold text-foreground mt-1">
                  {scheduledRecipient ? `${scheduledRecipient.fullName} (@${scheduledRecipient.ajoUsername})` : 'Not assigned yet'}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mt-4">Tap a date with a dot to view contribution members and assigned payout member.</p>
          )}

          {payoutHistory.length === 0 && (
            <p className="text-xs text-muted-foreground mt-3">No payout has been distributed yet.</p>
          )}

          <div className="mt-4 p-3 rounded-[10px] bg-background border border-border">
            <p className="text-sm font-semibold text-foreground mb-2">Saved Contribution-to-Payout Schedule</p>
            <p className="text-xs text-muted-foreground mb-3">Based on the payout order saved by the group creator.</p>
            {currentMonthScheduleRows.length > 0 ? (
              <div className="space-y-2">
                {currentMonthScheduleRows.map((row) => (
                  <div key={row.key} className="">
                    <p className="text-xs text-muted-foreground">
                      Contribution Date: <span className="font-semibold text-foreground">{row.contributionDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Scheduled Payout: <span className="font-semibold text-foreground">{row.payoutDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Recipient: <span className="font-semibold text-foreground">{row.memberName}</span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No scheduled contribution dates in this month.</p>
            )}
          </div>
        </div>

        {/* Payout Arrangement Display */}
        {selectedGroup.payoutEnabled && (
          <div className="mt-6 rounded-[10px] p-4 border border-border">
            <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
              <span>Payout Arrangement</span>
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Payout Order: <span className="font-medium capitalize">{payoutAssignmentMode === 'up-to-down' ? 'Up to Down (Bottom to Top)' : payoutAssignmentMode === 'down-to-up' ? 'Down to Up (Top to Bottom)' : 'Manual'}</span>
            </p>
            <div className="space-y-2">
              {activePayoutOrder.map((username, index) => {
                const member = selectedGroup.members.find((m) => m.ajoUsername === username);
                const alreadyPaidOut = member?.contributions.some(
                  (contribution) => contribution.status === 'paid' && contribution.memberUsername === '__PAYOUT__'
                );
                const isNextPayout = index === (selectedGroup.nextPayoutIndex ?? 0) % Math.max(activePayoutOrder.length, 1);

                return (
                  <div
                    key={`${username}-${index}`}
                    className={`p-3 rounded-[10px] border flex items-center justify-between ${
                      isNextPayout
                        ? 'bg-primary/10 border-primary'
                        : alreadyPaidOut
                          ? 'bg-green-500/10 border-green-500'
                          : 'bg-background border-border'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                        isNextPayout
                          ? 'bg-primary text-primary-foreground'
                          : alreadyPaidOut
                            ? 'bg-green-500 text-white'
                            : 'bg-muted text-muted-foreground'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{member?.fullName || username}</p>
                        <p className="text-xs text-muted-foreground">@{username}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {alreadyPaidOut ? (
                        <span className="text-xs font-semibold text-green-600">Already Paid</span>
                      ) : isNextPayout ? (
                        <span className="text-xs font-semibold text-primary">Next Payout</span>
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">Pending</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {activePayoutOrder.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No payout arrangement yet. Members need to accept invitations first.</p>
            )}
          </div>
        )}

        {isCreator && (
          <div className="mt-6  rounded-[10px] p-4 border border-border">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
              <span>Delete Group</span>
            </h3>
            <p className="text-xs text-muted-foreground mb-3">{deleteHelperText}</p>
            <button
              onClick={handleDeleteGroup}
              disabled={!canDeleteGroup}
              className="w-full py-3 rounded-[10px] bg-destructive/10 text-destructive font-semibold disabled:opacity-50"
            >
              Delete Contribution Group
            </button>
          </div>
        )}
      </div>
    );
  }

  if (view === 'create') {
    return (
      <div className="py-4  md:px-0 px-2 animate-fade-in">
        <button onClick={() => setView('main')} className="w-10 h-10 rounded-full flex items-center justify-center mb-6">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <h1 className="md:text-2xl text-[15px] font-[500] text-foreground mb-6 flex items-center gap-2">
          <img src="/logo.svg" alt="logo" className="w-6 h-6 object-contain" />
          <span className='md:text-lg text-[15px]'>Create Group</span>
        </h1>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Group Name</label>
            <input type="text" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Enter group name"
              className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Total Members</label>
            <input type="text" value={totalMembers} onChange={(e) => setTotalMembers(e.target.value.replace(/\D/g, ''))} placeholder="Number of members"
              inputMode="numeric" className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Creator Slots</label>
            <input
              type="text"
              value={creatorSlots}
              onChange={(e) => setCreatorSlots(e.target.value.replace(/\D/g, ''))}
              placeholder="How many slots you want"
              inputMode="numeric"
              className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-2">Creator slot count cannot be greater than total members.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Contribution Amount (NGN)</label>
            <input type="text" value={contributionAmount} onChange={(e) => setContributionAmount(e.target.value.replace(/\D/g, ''))} placeholder="Weekly/monthly amount"
              inputMode="numeric" className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as 'weekly' | 'biweekly' | 'monthly')}
              className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Every 2 Weeks</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              {frequency === 'weekly' ? 'Day of Week' : frequency === 'biweekly' ? 'Day of Week' : 'Day of Month'}
            </label>
            <input type="text" value={frequencyDay} onChange={(e) => setFrequencyDay(e.target.value)}
              placeholder={frequency === 'monthly' ? 'e.g. 15th' : 'e.g. Monday'}
              className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">First Contribution Date</label>
            <input
              type="date"
              value={firstContributionDate}
              onChange={(e) => setFirstContributionDate(e.target.value)}
              className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary"
            />
            <p className="text-xs text-muted-foreground mt-2">Date must match the selected contribution day.</p>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Late Payment Penalty (NGN)</label>
            <input type="text" value={latePenalty} onChange={(e) => setLatePenalty(e.target.value.replace(/\D/g, ''))} placeholder="0"
              inputMode="numeric" className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Duration Months</label>
            <input type="text" value={totalMonths} onChange={(e) => setTotalMonths(e.target.value.replace(/\D/g, ''))} placeholder="Duration in months"
              inputMode="numeric" className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">Duration Weeks</label>
            <input type="text" value={totalWeeks} onChange={(e) => setTotalWeeks(e.target.value.replace(/\D/g, ''))} placeholder="Extra weeks (optional)"
              inputMode="numeric" className="w-full p-4 rounded-[10px] border border-border text-foreground outline-none focus:border-primary" />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <button onClick={handleCreateGroup} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-[500] text-[15px] md:text-lg mt-4">
            Create Group
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="py-4 animate-fade-in">
      <h1 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
        <img src="/logo.svg" alt="logo" className="w-6 h-6 object-contain" />
        <span className='md:text-lg text-[15px]'>Ajo (Cooperative Savings)</span>
      </h1>
      <p className="text-sm text-muted-foreground mb-6">Username: @{currentUser?.ajoUsername}</p>

      <button onClick={() => setView('create')} className="w-full py-4 rounded-[10px] gradient-primary text-primary-foreground font-[500] md:text-lg text-[15px] mb-6 flex items-center justify-center gap-2">
        <Plus className="w-5 h-5" /> Create Group
      </button>

      <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
        <img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" />
        <span>Your Groups</span>
      </h3>
      <div className="space-y-3">
        {savingsGroups.length > 0 ? savingsGroups.map(g => (
          <button key={g.id} onClick={() => { setSelectedGroup(g); setView('details'); }}
            className="w-full text-left bg-card rounded-2xl p-4 hover:bg-muted/50 transition-colors">
            {(() => {
              const currentMember = g.members.find((member) => (
                member.ajoUsername.toLowerCase() === (currentUser?.ajoUsername || '').toLowerCase()
              ));
              const isPendingInvite = !!currentMember && !currentMember.accepted && g.creatorUsername !== currentUser?.ajoUsername;
              const pendingInvites = g.members.filter((member) => !member.accepted).length;
              const totalAcceptedSlots = g.members
                .filter((member) => member.accepted)
                .reduce((sum, member) => sum + Math.max(member.slots, 1), 0);
              const durationLabel = [
                g.totalMonths > 0 ? `${g.totalMonths}m` : '',
                (g.totalWeeks || 0) > 0 ? `${g.totalWeeks}w` : '',
              ].filter(Boolean).join(' ') || '0w';

              return (
                <>
            <div className="flex items-center justify-between mb-2">
              <p className="font-semibold text-foreground">{g.name}</p>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${
                    isPendingInvite
                      ? 'text-orange-700 border-orange-500 bg-orange-100'
                      : 'text-[#0E5486] border-[#0E5486]'
                  }`}>
                    {isPendingInvite ? 'Invitation Pending' : g.status}
                  </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground mb-1">
                  <span className="flex items-center gap-1"><img src="/logo.svg" alt="logo" className="w-4 h-4 object-contain" /> {totalAcceptedSlots}/{g.totalMembers} slots</span>
              <span>₦{g.contributionAmount.toLocaleString()}/{g.frequency}</span>
            </div>
                <p className="text-xs text-muted-foreground">Day: {g.frequencyDay} • Duration: {durationLabel} • Penalty: ₦{g.latePenalty.toLocaleString()}</p>
                {pendingInvites > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">Pending invitations: {pendingInvites}</p>
                )}
                {isPendingInvite && (
                  <p className="text-xs text-orange-700 mt-1">Open this group to accept request and choose your slot(s).</p>
                )}
                </>
              );
            })()}
          </button>
        )) : (
          <p className="text-center py-8 text-muted-foreground">No groups yet. Create one to get started!</p>
        )}
      </div>
    </div>
  );
};

export default AjoPage;
