import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';
import { Camera, Copy, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { uploadBackendProfileImage } from '@/lib/backendApi';
import { computeUserTrustScore } from '@/lib/trustScore';
import { getProfileImageUrl } from '@/lib/profileImage';
import userIcon from '@/assets/icons/user.png';
import trustIcon from '@/assets/icons/trust.png';
import callIcon from '@/assets/icons/call.png';
import iphoneIcon from '@/assets/icons/iphone.png';

const ProfilePage = () => {
  const navigate = useNavigate();
  const { currentUser, trustScore, transactions, savingsGroups, escrows, billPayments, logout, setProfileImage } = useStore();
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);

  const derivedTrustScore = useMemo(() => computeUserTrustScore({
    currentUser,
    transactions,
    savingsGroups,
    escrows,
    billPayments,
    fallback: trustScore,
  }), [billPayments, currentUser, escrows, savingsGroups, transactions, trustScore]);
  const avatarUrl = useMemo(() => getProfileImageUrl(currentUser?.profileImage, 160), [currentUser?.profileImage]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [avatarUrl]);

  const handleLogout = () => {
    logout();
    navigate('/auth');
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied!');
  };

  const handleProfileImageUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    const maxSizeInBytes = 3 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      toast.error('Image must be 3MB or less');
      return;
    }

    try {
      setIsUploadingImage(true);
      const imageUrl = await uploadBackendProfileImage(file);
      setProfileImage(imageUrl);
      toast.success('Profile picture updated');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to upload image';
      toast.error(message);
    } finally {
      setIsUploadingImage(false);
      event.target.value = '';
    }
  };

  return (
    <div className="py-4 animate-fade-in">
      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-full bg-[#093A5B] flex items-center justify-center mb-3 overflow-hidden">
          {avatarUrl && !avatarLoadFailed ? (
            <img
              src={avatarUrl}
              alt="Profile"
              className="w-full h-full object-cover object-center"
              loading="lazy"
              onError={() => setAvatarLoadFailed(true)}
            />
          ) : (
            <span className="text-accent-foreground font-bold text-2xl">
              {currentUser?.firstName?.[0]}{currentUser?.lastName?.[0]}
            </span>
          )}
        </div>
        <label className={`mb-3 inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#F2F5F7] border border-border text-sm font-medium text-foreground transition-colors ${isUploadingImage ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-[#EAF0F3]'}`}>
          <Camera className="w-4 h-4" /> {isUploadingImage ? 'Uploading...' : 'Upload Picture'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleProfileImageUpload}
            disabled={isUploadingImage}
          />
        </label>
        <h2 className="md:text-xl text-[15px] font-[500] text-foreground">{currentUser?.firstName} {currentUser?.lastName}</h2>
        <p className="text-[14.5px] text-black">@{currentUser?.username}</p>
      </div>

      <div className="space-y-3 md:px-0 px-2">
        <div className="border border-border rounded-[10px] p-4 flex items-center gap-3">
          <img src={iphoneIcon} alt="account number icon" className="w-5 h-5 object-contain" />
          <div className="flex-1">
            <p className="text-[14.5px] ">Account Number</p>
            <p className="font-[500] text-[14px]">{currentUser?.accountNumber}</p>
          </div>
          <button onClick={() => copy(currentUser?.accountNumber || '')}><Copy className="w-4 h-4 text-muted-foreground" /></button>
        </div>

        <div className="border border-border rounded-[10px] p-4 flex items-center gap-3">
          <img src={userIcon} alt="phone icon" className="w-5 h-5 object-contain" />
          <div className="flex-1">
            <p className="text-[14.5px] text-muted-foreground">Phone</p>
            <p className="font-[500] text-[14px]">+234 {currentUser?.phone}</p>
          </div>
        </div>

        <div className="border border-border rounded-[10px] p-4 flex items-center gap-3">
          <img src={trustIcon} alt="trust score icon" className="w-5 h-5 object-contain" />
          <div className="flex-1">
            <p className="text-[14.5px] text-muted-foreground">Trust Score</p>
            <p className="font-[500] text-[14px]">{derivedTrustScore.overall} / 850</p>
          </div>
        </div>

        <div className="border border-border rounded-[10px] p-4 flex items-center gap-3">
          <img src={callIcon} alt="member since icon" className="w-5 h-5 object-contain" />
          <div className="flex-1">
            <p className="text-[14.5px] text-muted-foreground">Member Since</p>
            <p className="font-[500] text-[14px]">{currentUser?.createdAt ? new Date(currentUser.createdAt).toLocaleDateString('en-NG') : 'N/A'}</p>
          </div>
        </div>
      </div>

      <button onClick={handleLogout}
        className="w-full mt-8 md:py-4 py-3 rounded-[10px] border border-border text-[#0e5485] font-semibold md::text-lg text-[14px] flex items-center justify-center gap-2">
        <LogOut className="w-5 h-5" /> Logout
      </button>
    </div>
  );
};

export default ProfilePage;
