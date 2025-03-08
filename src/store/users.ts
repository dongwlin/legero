import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

interface ErrorForm { 
    account?: string, 
    password?: string, 
    repassword?: string, 
    form?: string 
}

interface UserState {
    account: string,
    password: string,
    repassword: string
    error:ErrorForm ,
    isSubmitting: boolean,
    formType: 'login' | 'register',
    isAuthenticated: boolean,
    userToken: string | null


    setAccount: (account: string) => void
    setPassword: (password: string) => void
    setRePassword: (repassword: string) => void
    setFormType: (type: 'login' | 'register') => void
    validateForm: () => boolean
    resetForm: () => void
    loginSuccess:(token:string)=>void
    loginout:()=>void

    submitUserForm: () => Promise<boolean>
}

export const useUserStore = create<UserState>()(
    persist(
        (set, get) => ({
            account: '',
            password: '',
            repassword: '',
            error: {},
            isSubmitting: false,
            formType: 'login',
            isAuthenticated:false,
            userToken:null,


            setAccount: (account) => set({ account }),
            setPassword: (password) => set({ password }),
            setRePassword: (repassword) => set({ repassword }),
            setFormType: (formType) => {
                set({ formType })
                get().resetForm()
            },
            validateForm: () => {
                const { account, password, repassword, formType } = get()
                const newErrors: UserState['error'] = {}

                if (!account)
                    newErrors.account = '账号不能为空'

                if (!password) {
                    newErrors.password = '密码不能为空'
                } else if (formType === 'register' && password.length < 6) {
                    newErrors.password = '密码长度至少6位'
                }

                if (formType === 'register') {
                    if (!repassword) {
                        newErrors.repassword = '请再次输入密码'
                    } else if (repassword !== password) {
                        newErrors.repassword = '两次密码输入不一致'
                    }
                }

                set({ error: newErrors })
                return Object.keys(newErrors).length === 0
            },
            submitUserForm: async () => {
                if (!get().validateForm()){
                    return false
                }
                set({ isSubmitting: true })
                try {
                    const mockToken = 'WIcDIZbrk1l2U1swwIWSsUaKaQXAadavFKFvjtCMi8sQovqgigPCptp5i3LFAhUk'
                    await new Promise(res => setTimeout(res, 1000))
                    const { account, password, formType } = get()
                    console.log(`提交${formType === "login" ? '登录' : '注册'}请求`,
                        {
                            account,
                            password
                        }
                    )
                    get().loginSuccess(mockToken)
                    get().resetForm()
                    return true
                } catch {
                    set({
                        error: { ...get().error, form: '请求失败，请重试' },
                    })
                    return false
                }finally{
                    set({ isSubmitting: false })
                }
            },
            loginSuccess:(token)=>set({
                isAuthenticated:true,
                userToken:token
            }),
            loginout:()=>set({
                isAuthenticated:false,
                userToken:null,
                account: '',
                password: '',
                repassword: '',
                error: {},
                isSubmitting: false,
            }),
            resetForm: () => set({
                account: '',
                password: '',
                repassword: '',
                error: {},
                isSubmitting: false,
            })
        }),
        {
            name:'users-store',
            storage: createJSONStorage(() => localStorage),
        }
    )
)