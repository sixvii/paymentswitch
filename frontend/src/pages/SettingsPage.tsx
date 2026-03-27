import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import PinInput from '@/components/ui/PinInput';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/store/useStore';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const SettingsPage = () => {
  const { currentUser, logout, setCurrentUser, fontSize, setFontSize } = useStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [theme, setTheme] = useState('system');
  // Remove local fontSize state, use global store
  const [oldPin, setOldPin] = useState('');
  // Dialog state
  const [passwordDialog, setPasswordDialog] = useState<null | 'download' | 'delete' | 'changePassword' | 'changePin'>(null);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPin, setNewPin] = useState('');
  const [pinError, setPinError] = useState('');

  // Handlers
  const handleProfileEdit = () => navigate('/profile');
  const handleChangePassword = () => setPasswordDialog('changePassword');
  const handleChangePin = () => setPasswordDialog('changePin');
  const handleContactSupport = () =>
    toast({
      title: 'Contact Support',
      description:
        'Phone: +234 70064664357, +234 19065000, 02016283888\nEmail: support@interswitchgroup.com, consumersupport@interswitching.com',
      duration: 10000,
    });
  const handleDownloadData = () => setPasswordDialog('download');
  const handleDeleteAccount = () => setPasswordDialog('delete');

  // Password/Pin dialog confirm
  const handlePasswordConfirm = () => {
    if (!currentUser || password !== currentUser.password) {
      setPasswordError('Incorrect password');
      return;
    }
    if (passwordDialog === 'download') {
      setPasswordDialog(null);
      setPassword('');
      setPasswordError('');
      toast({ title: 'Data download started (mock)' });
      // Place real download logic here
    } else if (passwordDialog === 'delete') {
      setPasswordDialog(null);
      setPassword('');
      setPasswordError('');
      setCurrentUser(null);
      toast({ title: 'Account deleted' });
      navigate('/auth');
    } else if (passwordDialog === 'changePassword') {
      if (!newPassword || newPassword.length < 4) {
        setPasswordError('New password must be at least 4 characters');
        return;
      }
      setCurrentUser({ ...currentUser, password: newPassword });
      setPasswordDialog(null);
      setPassword('');
      setNewPassword('');
      setPasswordError('');
      toast({ title: 'Password changed successfully' });
    }
  };

  const handlePinConfirm = () => {
    if (!currentUser || password !== currentUser.password) {
      setPinError('Incorrect password');
      return;
    }
    if (!/^[0-9]{4}$/.test(newPin)) {
      setPinError('PIN must be 4 digits');
      return;
    }
    setCurrentUser({ ...currentUser, pin: newPin });
    setPasswordDialog(null);
    setPassword('');
    setNewPin('');
    setPinError('');
    toast({ title: 'PIN changed successfully' });
  };

  const handleDialogClose = () => {
    setPasswordDialog(null);
    setPassword('');
    setPasswordError('');
    setNewPassword('');
    setNewPin('');
    setPinError('');
  };

  // Font size preference
  const handleFontSizeChange = (val: number) => {
    setFontSize(val);
  };

  return (
    <div className="py-6 px-4 max-w-4xl mx-auto space-y-8 animate-fade-in">
      <h1 className="text-[17px] font-bold text-foreground mb-2">Settings</h1>


      {/* Profile Management */}
      <section className="space-y-2 border-border rounded-[10px] p-4 border">
        <h2 className="font-semibold md:text-lg text-[15px]">Profile</h2>
        <div className="flex flex-col gap-3">
          <Button onClick={handleProfileEdit} variant="outline">Edit Profile</Button>
          <Button onClick={handleChangePassword} variant="outline">Change Password</Button>
          <Button onClick={handleChangePin} variant="outline">Change PIN</Button>
        </div>
      </section>

      {/* Security */}
      <section className="space-y-2 border-border rounded-[10px] p-4 border">
        <h2 className="font-semibold md:text-lg text-[15px]">Security</h2>
        <div className="flex flex-col gap-3">
          <Button variant="outline" disabled>Biometric Login (coming soon)</Button>
          <Button variant="outline" disabled>Two-Factor Authentication (coming soon)</Button>
          <Button variant="outline" disabled>Device Management (coming soon)</Button>
        </div>
      </section>

      {/* Preferences */}
      <section className="space-y-2 border-border rounded-[10px] p-4 border">
        <h2 className="font-semibold md:text-lg text-[15px]">Preferences</h2>
        <div className="flex items-center gap-3">
          <span>Theme:</span>
          <select value={theme} onChange={e => setTheme(e.target.value)} className="border rounded px-2 py-1">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span>Font Size:</span>
          <input type="range" min={12} max={22} value={fontSize} onChange={e => setFontSize(Number(e.target.value))} />
          <span>{fontSize}px</span>
        </div>
        <div className="flex flex-col gap-3">
          <Button variant="outline" disabled>Notification Preferences (coming soon)</Button>
        </div>
      </section>


          <Button onClick={handleChangePassword} variant="outline">Change Password</Button>
      <section className="space-y-2 border-border rounded-[10px] p-4 border">
        <h2 className="font-semibold md:text-lg text-[15px]">Privacy</h2>
        <div className="flex flex-col gap-3">
          <Button onClick={handleDownloadData} variant="outline">Download My Data</Button>
          <Button onClick={handleDeleteAccount} variant="destructive">Delete Account</Button>
        </div>
      </section>

      {/* Dialogs for Password, PIN, Download, Delete */}
      <Dialog open={!!passwordDialog} onOpenChange={handleDialogClose}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {passwordDialog === 'download' && 'Enter Password to Download Data'}
              {passwordDialog === 'delete' && 'Enter Password to Delete Account'}
              {passwordDialog === 'changePassword' && 'Change Password'}
              {passwordDialog === 'changePin' && 'Change PIN'}
            </DialogTitle>
            <DialogDescription>
              {passwordDialog === 'download' && 'Please enter your password to download your data.'}
              {passwordDialog === 'delete' && 'Please enter your password to permanently delete your account.'}
              {passwordDialog === 'changePassword' && 'Enter your old password and a new password to update your credentials.'}
              {passwordDialog === 'changePin' && 'Enter your old PIN and a new PIN to update your security PIN.'}
            </DialogDescription>
          </DialogHeader>
          {passwordDialog === 'changePassword' && (
            <div className="py-2 space-y-3">
              <Input
                type="password"
                placeholder="Old password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
              />
              <Input
                type="password"
                placeholder="New password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
              />
              {passwordError && <p className="text-red-500 text-center">{passwordError}</p>}
            </div>
          )}
          {passwordDialog === 'changePin' && (
            <div className="py-2 space-y-3">
              <PinInput
                label="Old 4-digit PIN"
                length={4}
                onComplete={setOldPin}
              />
              <PinInput
                label="New 4-digit PIN"
                length={4}
                onComplete={setNewPin}
              />
              {pinError && <p className="text-red-500 text-center">{pinError}</p>}
            </div>
          )}
          {(passwordDialog === 'download' || passwordDialog === 'delete') && (
            <div className="py-2 space-y-3">
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoFocus
              />
              {passwordError && <p className="text-red-500 text-center">{passwordError}</p>}
            </div>
          )}
          <DialogFooter>
            {(passwordDialog === 'changePassword' || passwordDialog === 'download' || passwordDialog === 'delete') && (
              <Button onClick={handlePasswordConfirm} className="w-full">
                Confirm
              </Button>
            )}
            {passwordDialog === 'changePin' && (
              <Button onClick={handlePinConfirm} className="w-full">
                Confirm
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* App Info */}
      <section className="space-y-2 border-border rounded-[10px] p-4 border">
        <h2 className="font-semibold md:text-lg text-[15px]">App Info</h2>
        <div>Version: 2.0.0</div>
        <div className="flex flex-col gap-3">
          <Button onClick={handleContactSupport} variant="outline">Contact Support</Button>
          <div className="flex gap-3">
            <a href="/terms" className="text-primary underline">Terms of Service</a>
            <a href="/privacy" className="text-primary underline">Privacy Policy</a>
          </div>
        </div>
      </section>

      <Button onClick={logout} variant="secondary" className="w-full mt-6">Log Out</Button>
    </div>
  );
};

export default SettingsPage;
