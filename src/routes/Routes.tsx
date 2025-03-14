import { useUserStore } from "@/store/users";
import React from "react";
import  {Navigate, Outlet}  from "react-router";

//受保护路由
export const ProtectedRouter = ({children}:{children?:React.ReactNode})=>{
    const {isAuthenticated} = useUserStore()

    if(!isAuthenticated){
        return <Navigate to={"/login"} replace />
    }
    return children?children:<Outlet />
}

//认证路由
export const AuthRouter =  ({children}:{children?:React.ReactNode})=>{
    const {isAuthenticated} = useUserStore()

    if(isAuthenticated){
        return <Navigate to={"/"} replace />
    }
    return children?children:<Outlet />
}