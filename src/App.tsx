
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./components/auth/AuthProvider";
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import SessionPage from "./pages/SessionPage";
import HistoryPage from "./pages/HistoryPage";
import NotFoundPage from "./pages/NotFoundPage";
import AppLayout from "./components/layout/AppLayout";
import { useState, useEffect } from "react";

const queryClient = new QueryClient();

// Protected route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-16 h-16 border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 rounded-full animate-spin"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

const InnerApp = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      
      <Route path="/" element={
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      }>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="session/:sessionId" element={<SessionPage />} />
        <Route path="history" element={<HistoryPage />} />
      </Route>
      
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
};

const App = () => {
  const [isSupabaseLoaded, setIsSupabaseLoaded] = useState(false);
  
  useEffect(() => {
    // Check if Supabase credentials are loaded
    const checkSupabaseConfig = () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      // In a real app, we would check if these are valid
      // For now, let's assume they are valid if they exist
      if (supabaseUrl && supabaseKey) {
        setIsSupabaseLoaded(true);
      } else {
        console.warn("Supabase configuration not found. Using mock data.");
        setIsSupabaseLoaded(true); // For demo purposes
      }
    };
    
    checkSupabaseConfig();
  }, []);
  
  if (!isSupabaseLoaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-t-lumin-teal border-r-lumin-teal border-b-gray-200 border-l-gray-200 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading application...</p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <InnerApp />
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
