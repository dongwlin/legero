import { usePasswordAuthStore } from '@/store/passwordAuth';
import React, { useState } from 'react';
import PasswordLockScreen from '@/components/PasswordLockScreen';

const AuthSettings: React.FC = () => {
  const { enabled, toggleEnabled } = usePasswordAuthStore();
  const [showPasswordInput, setShowPasswordInput] = useState(false);
  const [pendingAction, setPendingAction] = useState<'enable' | 'disable' | null>(null);

  const handleToggle = () => {
    if (enabled) {
      // 如果当前是开启状态，关闭需要密码验证
      setPendingAction('disable');
      setShowPasswordInput(true);
    } else {
      // 如果当前是关闭状态，直接开启
      toggleEnabled();
    }
  };

  const handlePasswordUnlock = () => {
    if (pendingAction === 'disable') {
      toggleEnabled();
    }
    setShowPasswordInput(false);
    setPendingAction(null);
  };

  const handlePasswordCancel = () => {
    setShowPasswordInput(false);
    setPendingAction(null);
  };

  return (
    <>
      <div className="card bg-base-200 shadow-lg rounded-xl mb-6">
        <div className="card-body p-6">
          <h2 className="card-title text-lg md:text-xl mb-4">安全设置</h2>

          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="font-medium">统计页面密码保护</div>
              <div className="text-sm text-base-content/60 mt-1">
                开启后访问统计页面需要输入密码
              </div>
            </div>
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={enabled}
              onChange={handleToggle}
              aria-label="切换密码保护"
            />
          </div>
        </div>
      </div>

      {showPasswordInput && (
        <PasswordLockScreen
          onUnlock={handlePasswordUnlock}
          onCancel={handlePasswordCancel}
        />
      )}
    </>
  );
};

export default AuthSettings;
