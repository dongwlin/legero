import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

interface ErrorForm { 
    account?: string, 
    password?: string, 
    form?: string 
}

interface UserState {
    account: string,
    password: string,
    error:ErrorForm ,
    isSubmitting: boolean,
    userToken: string | null,
    isAuthenticated:boolean


    setAccount: (account: string) => void
    setPassword: (password: string) => void
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
            error: {},
            isSubmitting: false,
            isAuthenticated:false,
            userToken:null,


            setAccount: (account) => set({ account }),
            setPassword: (password) => set({ password }),
 
            validateForm: () => {
                const { account, password} = get()
                const newErrors: UserState['error'] = {}

                if (!account)
                    newErrors.account = '账号不能为空'

                if (!password) {
                    newErrors.password = '密码不能为空'
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
                    const { account, password} = get()
                    console.log(`提交登录请求`,
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
                error: {},
                isSubmitting: false,
            }),
            resetForm: () => set({
                account: '',
                password: '',
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