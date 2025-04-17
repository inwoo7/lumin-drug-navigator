
import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import { Toaster } from "sonner";

const AppLayout = () => {
  return (
    <div className="flex h-screen bg-gray-50">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
      <Toaster position="top-right" richColors />
    </div>
  );
};

export default AppLayout;
