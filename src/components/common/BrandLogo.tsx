
import React from 'react';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'lg';
}

const BrandLogo = ({
  className = '',
  size = 'lg'
}: BrandLogoProps) => {
  return (
    <div className={`flex flex-col items-start ${className}`}>
      <span className={`font-inter font-bold ${size === 'lg' ? 'text-3xl' : 'text-xl'} text-gray-900`}>
        SynapseRx
      </span>
      <div className="flex items-center space-x-1">
        <span className={`text-gray-500 mr-1 ${size === 'lg' ? 'text-sm' : 'text-xs'}`}>by</span>
        <img 
          src="/lovable-uploads/42627357-f347-458f-8e78-765c940622aa.png" 
          alt="MaaTRx Logo" 
          className={`${size === 'lg' ? 'h-4' : 'h-3'}`} 
        />
      </div>
    </div>
  );
};

export default BrandLogo;
