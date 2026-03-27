import { LayoutDashboard, ArrowLeftRight, Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import homeIcon from '@/assets/icons/home.png';
import { useStore } from '@/store/useStore';

const tabs = [
  { path: '/', icon: null, label: 'Home', isImage: true },
  { path: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/chat', icon: null, label: 'Chat', isCenter: true },
  { path: '/transact', icon: ArrowLeftRight, label: 'Transact' },
  { path: '/services', icon: Menu, label: 'Services' },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, chatUnreadByUser } = useStore();
  const chatUserKey = currentUser?.id || 'guest';
  const unreadCount = chatUnreadByUser[chatUserKey] || 0;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-nav safe-bottom">
      <div className="max-w-5xl mx-auto flex items-end justify-around px-2 pt-2 pb-2">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          const Icon = tab.icon;

          if (tab.isCenter) {
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className="flex flex-col items-center -mt-6 relative"
              >
                <div className="w-14 h-14 rounded-full bg-card border-4 border-nav flex items-center justify-center shadow-lg">
                  <img src="/logo.svg" alt="Chat" className="w-14 h-14 object-contain" />
                  {unreadCount > 0 && (
                    <span className="absolute -mt-10 ml-10 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className="text-xs text-nav-foreground mt-1 font-medium">{tab.label}</span>
              </button>
            );
          }

          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className="flex flex-col items-center py-1 px-3 min-w-[60px]"
            >
              {tab.isImage ? (
                <span
                  className={`w-6 h-6 ${isActive ? 'bg-white' : 'bg-[#9DAAB5]'}`}
                  style={{
                    WebkitMaskImage: `url(${homeIcon})`,
                    maskImage: `url(${homeIcon})`,
                    WebkitMaskRepeat: 'no-repeat',
                    maskRepeat: 'no-repeat',
                    WebkitMaskPosition: 'center',
                    maskPosition: 'center',
                    WebkitMaskSize: 'contain',
                    maskSize: 'contain',
                  }}
                  aria-label="Home"
                />
              ) : (
                <Icon
                  className={`w-6 h-6 ${isActive ? 'text-white' : 'text-nav-foreground/60'}`}
                />
              )}
              <span
                className={`text-xs mt-1 ${isActive ? 'text-white font-semibold' : 'text-nav-foreground/60 font-medium'}`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
