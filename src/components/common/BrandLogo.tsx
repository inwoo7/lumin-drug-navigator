
import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'lg';
  variant?: 'app' | 'auth';
}

const BrandLogo = ({
  className = '',
  size = 'lg',
  variant = 'app'
}: BrandLogoProps) => {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      <span className={`font-inter font-bold ${size === 'lg' ? 'text-3xl' : 'text-xl'} text-gray-900`}>
        {variant === 'app' ? 'New Search' : 'SynapseRx'}
      </span>
      <div className="flex items-center justify-center space-x-1 mt-1">
        {variant === 'auth' && (
          <>
            <span className="text-gray-500 mr-1 text-xs">by</span>
            <img 
              src="/lovable-uploads/42627357-f347-458f-8e78-765c940622aa.png" 
              alt="MaaTRx Logo" 
              className="h-3" 
            />
          </>
        )}
      </div>
    </div>
  );
};

export default BrandLogo;
