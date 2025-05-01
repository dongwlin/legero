import { useUserStore } from "@/store/users";
import React, { FormEvent } from "react";
import { useNavigate } from "react-router";

const Login: React.FC = () => {
    const navigate = useNavigate()
    const {
        account,
        password,
        error,
        isSubmitting,
        setAccount,
        setPassword,
        submitUserForm

    } = useUserStore()

    const NavToHome = () => {
        navigate('/', {
            replace: true
        })
    }


    const handleSumbit = async (e: FormEvent) => {
        e.preventDefault()
        if (await submitUserForm()) {
            NavToHome()
        }

    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <form className="card bg-base-100 w-full max-w-md shadow-xl" onSubmit={handleSumbit}>
                <div className="card-body p-8 space-y-4">
                    <h1 className="card-title text-3xl justify-center text-gray-800 mb-4">用户登录</h1>

                    <div className="form-control">
                        <label htmlFor="account" className="label">
                            <span className="label-text text-xl text-gray-700">账号</span>
                        </label>
                        <input
                            id="account"
                            value={account}
                            onChange={e => setAccount(e.target.value)}
                            type="text"
                            disabled={isSubmitting}
                            placeholder="请输入账号"
                            className="input input-bordered w-full input-lg !text-black"
                        />
                        {error.account && (
                            <span className="text-error text-lg mt-1">{error.account}</span>
                        )}
                    </div>
                    <div className="form-control">
                        <label className="label" htmlFor="password">
                            <span className="label-text text-xl text-gray-700">密码</span>
                        </label>
                        <input
                            id="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            type="password"
                            disabled={isSubmitting}
                            placeholder="请输入密码"
                            className="input input-bordered w-full input-lg !text-black"
                        />
                        {error.password && (
                            <span className="text-error text-lg mt-1">{error.password}</span>
                        )}
                    </div>
                    <button

                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full py-2 px-4 text-white font-medium rounded-md transition-colors ${isSubmitting
                            ? 'bg-blue-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                    >
                        {isSubmitting ? '登录中...' : '登录'}
                    </button>
                </div>
            </form>
        </div>
    )
}

export default Login