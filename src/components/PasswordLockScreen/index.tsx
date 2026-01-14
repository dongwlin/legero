import React, { useState, useEffect } from 'react';
import { validatePassword } from '@/services/passwordValidator';

interface PasswordLockScreenProps {
  onUnlock: () => void;
  onCancel?: () => void;
}

const PasswordLockScreen: React.FC<PasswordLockScreenProps> = ({ onUnlock, onCancel }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleNumberClick = (num: string) => {
    if (password.length < 6 && !success) {
      setPassword(password + num);
      setError(false);
    }
  };

  const handleDelete = () => {
    if (!success) {
      setPassword(password.slice(0, -1));
      setError(false);
    }
  };

  const handleConfirm = () => {
    if (password.length !== 6) {
      setError(true);
      return;
    }

    if (validatePassword(password)) {
      setSuccess(true);
      // 延迟执行解锁，让用户看到成功反馈
      setTimeout(() => {
        onUnlock();
      }, 300);
    } else {
      setError(true);
      setShake(true);
      setPassword('');
      setTimeout(() => setShake(false), 500);
    }
  };

  // 防止键盘输入
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', ''];

  return (
    <div className="fixed inset-0 bg-base-200/95 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className={`card bg-base-100 shadow-2xl w-full max-w-sm transition-all duration-300 ${
          shake ? 'animate-shake' : success ? 'scale-105 opacity-0' : 'scale-100'
        }`}
      >
        <div className="card-body">
          <h2 className="card-title text-center text-2xl font-bold mb-6">
            {success ? '验证成功' : '请输入密码'}
          </h2>

          {/* 密码显示区域 */}
          <div className="flex justify-center gap-4 mb-8">
            {[...Array(6)].map((_, index) => (
              <div
                key={index}
                className={`w-5 h-5 rounded-full border-2 transition-all duration-300 ${
                  index < password.length
                    ? success
                      ? 'bg-success border-success scale-110'
                      : 'bg-primary border-primary scale-110'
                    : 'border-base-300'
                }`}
                aria-label={`密码位 ${index + 1}`}
              />
            ))}
          </div>

          {/* 错误提示 */}
          {error && !success && (
            <div
              className="text-error text-center mb-4 font-medium animate-pulse"
              role="alert"
              aria-live="polite"
            >
              {password.length !== 6 ? '请输入6位密码' : '密码错误，请重试'}
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div
              className="text-success text-center mb-4 font-medium"
              role="status"
              aria-live="polite"
            >
              解锁成功
            </div>
          )}

          {/* 数字键盘 */}
          <div className="grid grid-cols-3 gap-3 mb-4" role="group" aria-label="数字键盘">
            {numbers.map((num, index) => {
              if (num === '') {
                return <div key={index} className="aspect-square" />;
              }
              return (
                <button
                  key={num}
                  onClick={() => handleNumberClick(num)}
                  disabled={success}
                  className={`btn btn-lg btn-circle btn-ghost text-2xl font-semibold
                    hover:bg-base-200 active:bg-base-300 active:scale-95
                    transition-all duration-150 min-h-14 min-w-14
                    ${success ? 'opacity-50 cursor-not-allowed' : ''}`}
                  aria-label={`数字 ${num}`}
                  tabIndex={0}
                >
                  {num}
                </button>
              );
            })}
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-3">
            {onCancel && (
              <button
                onClick={onCancel}
                className="btn btn-outline flex-1 h-12 min-h-12"
                disabled={success}
              >
                取消
              </button>
            )}
            <button
              onClick={handleDelete}
              className="btn btn-error flex-1 h-12 min-h-12"
              disabled={password.length === 0 || success}
            >
              删除
            </button>
            <button
              onClick={handleConfirm}
              className="btn btn-primary flex-1 h-12 min-h-12"
              disabled={password.length === 0 || success}
            >
              确认
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default PasswordLockScreen;
