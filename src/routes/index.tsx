import Home from "@/views/Home";
import NotFound from "@/views/NotFound";
import Order from "@/views/Order";
import Settings from "@/views/Settings";
import Statistic from "@/views/Statistics";
import { createBrowserRouter } from "react-router";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Home />
  },
  {
    path: "/order",
    element: <Order />
  },
  {
    path: "/statistics",
    element: <Statistic />
  },
  {
    path: "/settings",
    element: <Settings />
  },
  {
    path: "*",
    element: <NotFound />
  }
])

export default router