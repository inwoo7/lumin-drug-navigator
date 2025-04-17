
import React from 'react';

const AnimatedBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 animate-grid bg-white">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="grid grid-cols-3 gap-16">
          {[...Array(9)].map((_, i) => (
            <div 
              key={i}
              className="w-24 h-24 rounded-2xl bg-gradient-to-br from-lumin-teal/20 to-lumin-lime/20"
              style={{
                animationDelay: `${i * 0.2}s`,
                animation: 'float 6s ease-in-out infinite'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnimatedBackground;
