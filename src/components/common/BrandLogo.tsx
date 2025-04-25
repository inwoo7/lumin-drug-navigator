import React from 'react';
interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'lg';
}
const BrandLogo = ({
  className = '',
  size = 'lg'
}: BrandLogoProps) => {
  return <div className={`flex flex-col items-start ${className}`}>
      <span className={`font-inter font-bold ${size === 'lg' ? 'text-3xl' : 'text-xl'} text-gray-900`}>New Search</span>
      <div className="flex items-center space-x-1">
        
        
      </div>
    </div>;
};
export default BrandLogo;