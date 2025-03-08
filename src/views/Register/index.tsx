import { useUserStore } from "@/store/users";
import React, { FormEvent, useEffect } from "react";
import { useNavigate } from "react-router";

const Register: React.FC = () => {
    const navigate = useNavigate()
    const{
        account,
        password,
        repassword,
        error,
        isSubmitting,
        setAccount,
        setPassword,
        setRePassword,
        submitUserForm

    } = useUserStore()

    const NavToLogin = ()=>{
        navigate('/login',{
            replace:true
        })
    }

    useEffect(()=>{
        useUserStore.getState().setFormType('register')
    },[])

    const handleSumbit = async (e: FormEvent) => {
        e.preventDefault()
        if(await submitUserForm())
        NavToLogin()
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <form className="bg-white p-8 rounded-lg shadow-md w-full max-w-md space-y-6" onSubmit={handleSumbit}>
                <h1 className="text-2xl font-bold text-center text-gray-800">用户登录</h1>
                <div className="space-y-4">
                    <div className="flex flex-col justify-center">
                        <label htmlFor="account" className="block text-2xl font-medium text-gray-700 mb-1">账号</label>
                        <input
                            id="account"
                            value={account}
                            onChange={e => setAccount(e.target.value)}
                            type="text"
                            disabled={isSubmitting}
                            placeholder="请输入账号"
                            className="w-full h-16 px-6 text-2xl rounded-md border-2 border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-300"
                        />
                        {error.account && (
                            <span className="text-red-500 text-xl mt-1 block">{error.account}</span>
                        )}
                    </div>
                    <div className="flex flex-col justify-center">
                        <label htmlFor="password" className="block text-2xl font-medium text-gray-700 mb-1">密码</label>
                        <input
                            id="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            type="password"
                            disabled={isSubmitting}
                            placeholder="请输入密码"
                            className="w-full h-16 px-6 text-2xl rounded-md border-2 border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-300"
                        />
                        {error.password && (
                            <span className="text-red-500 text-xl mt-1 block">{error.password}</span>
                        )}
                    </div>
                    <div className="flex flex-col justify-center">
                        <label htmlFor="password" className="block text-2xl font-medium text-gray-700 mb-1">确认密码</label>
                        <input
                            id="password"
                            value={repassword}
                            onChange={e => setRePassword(e.target.value)}
                            type="password"
                            disabled={isSubmitting}
                            placeholder="请再次输入密码"
                            className="w-full h-16 px-6 text-2xl rounded-md border-2 border-gray-300 focus:outline-none focus:ring-4 focus:ring-blue-300"
                        />
                        {error.repassword && (
                            <span className="text-red-500 text-xl mt-1 block">{error.repassword}</span>
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
                        {isSubmitting ? '注册中...' : '注册'}
                    </button>
                </div>
                <div className="text-center text-2xl text-gray-600 mt-4">
                    已有账号？{' '}
                    <span
                        className="text-blue-600 hover:text-blue-800 font-medium text-2xl"
                        onClick={NavToLogin}
                    >
                        立即登录
                    </span>
                </div>
            </form>
        </div>
    )
}


export default Register