import Home from "@/views/Home";
import Login from "@/views/Login";
import NotFound from "@/views/NotFound";
import Order from "@/views/Order";
import Register from "@/views/Register";
import Settings from "@/views/Settings";
import Statistic from "@/views/Statistics";
import { createBrowserRouter } from "react-router";
import { AuthRouter, ProtectedRouter } from "./Routes";

const router = createBrowserRouter([
  {
    path: "/login",
    element: <AuthRouter><Login /></AuthRouter>
  },
  {
    path:'/register',
    element:<AuthRouter><Register /></AuthRouter>
  },
  {
    path: "/",
    element: <ProtectedRouter><Home /></ProtectedRouter>
  },
  {
    path: "/order",
    element: <ProtectedRouter><Order /></ProtectedRouter>
  },
  {
    path: "/statistics",
    element: <ProtectedRouter><Statistic /></ProtectedRouter>
  },
  {
    path: "/settings",
    element: <ProtectedRouter><Settings /></ProtectedRouter>
  },
  {
    path: "*",
    element: <NotFound />
  }
])

export default router