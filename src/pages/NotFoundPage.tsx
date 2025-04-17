
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileSearch } from "lucide-react";

const NotFoundPage = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <FileSearch className="h-20 w-20 text-lumin-teal mb-6" />
      <h1 className="text-4xl font-bold mb-2">Page Not Found</h1>
      <p className="text-gray-600 mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Link to="/dashboard">
        <Button className="bg-lumin-teal hover:bg-lumin-teal/90">
          Return to Dashboard
        </Button>
      </Link>
    </div>
  );
};

export default NotFoundPage;
