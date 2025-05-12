import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { SearchIcon, FileIcon, HistoryIcon, LogOutIcon, MenuIcon, SettingsIcon, XIcon, UserIcon } from "lucide-react";
const AppSidebar = () => {
  const {
    signOut,
    user
  } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);
  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("Signed out successfully");
    } catch (error) {
      toast.error("Failed to sign out");
    }
  };
  const toggleSidebar = () => {
    setIsMobileOpen(!isMobileOpen);
  };
  const navItems = [{
    name: "New Search",
    path: "/dashboard",
    icon: <SearchIcon className="mr-2 h-4 w-4" />
  }, {
    name: "Previous Sessions",
    path: "/history",
    icon: <HistoryIcon className="mr-2 h-4 w-4" />
  }, {
    name: "Settings",
    path: "/settings",
    icon: <SettingsIcon className="mr-2 h-4 w-4" />
  }];
  return <>
      {/* Mobile Menu Toggle */}
      <div className="fixed top-4 left-4 z-50 lg:hidden">
        <Button variant="outline" size="icon" onClick={toggleSidebar} className="bg-white">
          <MenuIcon className="h-5 w-5" />
        </Button>
      </div>

      {/* Mobile sidebar content */}
      <div className={`fixed inset-0 z-40 transform lg:hidden transition-transform duration-300 ease-in-out ${isMobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="relative flex h-full w-64 flex-col bg-white shadow-xl">
          <div className="absolute right-0 top-0 -mr-12 pt-2">
            <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-white">
              <XIcon className="h-6 w-6" />
            </Button>
          </div>

          <div className="sidebar-content">
            <div className="flex items-center gap-2 px-4 py-6 border-b">
              <div className="flex flex-col items-start">
                <span className="font-inter font-bold text-xl text-gray-900">
                  SynapseRx
                </span>
                <div className="flex items-center space-x-1">
                  <span className="text-gray-500 mr-1 text-xs">by</span>
                  <img src="/lovable-uploads/42627357-f347-458f-8e78-765c940622aa.png" alt="MaaTRx Logo" className="h-3" />
                </div>
              </div>
            </div>

            <nav className="flex-1 space-y-1 px-2 py-4">
              {navItems.map(item => <Link key={item.path} to={item.path} onClick={() => setIsMobileOpen(false)}>
                  <Button variant={location.pathname === item.path ? "default" : "ghost"} className={`w-full justify-start mb-1 ${location.pathname === item.path ? "bg-lumin-teal text-white hover:bg-lumin-teal/90" : ""}`}>
                    {item.icon}
                    {item.name}
                  </Button>
                </Link>)}
            </nav>
            
            <div className="border-t p-4">
              {user && <div className="text-sm text-gray-600 mb-2 flex items-center">
                  <UserIcon className="mr-2 h-4 w-4" />
                  {user.email}
                </div>}
              <Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleSignOut}>
                <LogOutIcon className="mr-2 h-4 w-4" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex h-screen w-64 flex-col bg-white border-r">
        <div className="flex items-center gap-2 px-4 py-6 border-b">
          <div className="flex flex-col items-start">
            <span className="font-inter font-bold text-gray-900 text-2xl">
              SynapseRx
            </span>
            <div className="flex items-center space-x-1">
              <span className="text-gray-500 mr-1 text-xs">by</span>
              <img src="/lovable-uploads/42627357-f347-458f-8e78-765c940622aa.png" alt="MaaTRx Logo" className="h-3" />
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          {navItems.map(item => <Link key={item.path} to={item.path}>
              <Button variant={location.pathname === item.path ? "default" : "ghost"} className={`w-full justify-start mb-1 ${location.pathname === item.path ? "bg-lumin-teal text-white hover:bg-lumin-teal/90" : ""}`}>
                {item.icon}
                {item.name}
              </Button>
            </Link>)}
        </nav>
        
        <div className="border-t p-4">
          {user && <div className="text-sm text-gray-600 mb-2 flex items-center">
              <UserIcon className="mr-2 h-4 w-4" />
              {user.email}
            </div>}
          <Button variant="ghost" className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleSignOut}>
            <LogOutIcon className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </>;
};
export default AppSidebar;