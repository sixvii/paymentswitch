import { useEffect } from 'react';
import { Bell, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/store/useStore';

const AppHeader = () => {
  const navigate = useNavigate();
  const { currentUser, notifications, fetchNotifications } = useStore();
  const unreadCount = notifications.filter(n => !n.read).length;

  useEffect(() => {
    if (!currentUser?.id) return;
    void fetchNotifications();
  }, [currentUser?.id, fetchNotifications]);

  return (
    <header className="sticky top-0 z-50 bg-[#F2F5F7]">
      <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-5 min-h-[86px]">
        <div className="flex items-center gap-1">
          <img src="/logo.svg" alt="TrustPay logo" className="w-10 h-10 object-contain" />
          <span className="font-bold md:text-xl text-[15px] text-primary">inter-pay</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/notifications')}
            className="relative w-10 h-10 rounded-full  flex items-center justify-center"
          >
            <Bell className="w-5 h-5 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#ED342B] text-white text-xs flex items-center justify-center font-semibold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <button
            onClick={() => navigate('/profile')}
            className="w-10 h-10 rounded-full bg-[#EEF1F4] border border-gray-400 flex items-center justify-center overflow-hidden"
          >
            {currentUser?.profileImage ? (
              <img src={currentUser.profileImage} alt="Profile" className="w-full h-full object-cover" />
            ) : currentUser ? (
              <span className="text-[#093A5B] font-semibold text-sm">
                {currentUser.firstName[0]}{currentUser.lastName[0]}
              </span>
            ) : (
              <User className="w-5 h-5 text-[#093A5B]" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
