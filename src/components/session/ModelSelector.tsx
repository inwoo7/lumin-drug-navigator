import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Brain, Stethoscope } from "lucide-react";
import { ModelType } from "@/hooks/use-openai-assistant";

interface ModelSelectorProps {
  currentModel: ModelType;
  onModelChange: (model: ModelType) => void;
  disabled?: boolean;
  showLabels?: boolean;
}

export function ModelSelector({ 
  currentModel, 
  onModelChange, 
  disabled = false,
  showLabels = true 
}: ModelSelectorProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleModelSwitch = async (model: ModelType) => {
    if (model === currentModel || disabled || isLoading) return;
    
    setIsLoading(true);
    try {
      await onModelChange(model);
    } finally {
      setIsLoading(false);
    }
  };

  const models = [
    {
      id: "txagent" as ModelType,
      name: "Advanced Clinical Model",
      description: "Specialized medical AI for clinical decision support",
      icon: Stethoscope,
      color: "bg-gray-100 text-gray-800 hover:bg-gray-200",
      activeColor: "text-white",
      customActiveStyle: { backgroundColor: "#44c59e" }
    },
    {
      id: "openai" as ModelType,
      name: "General Model",
      description: "General purpose AI assistant",
      icon: Brain,
      color: "bg-blue-100 text-blue-800 hover:bg-blue-200",
      activeColor: "bg-blue-500 text-white"
    }
  ];

  return (
    <TooltipProvider>
      <div className="flex items-center gap-2">
        {showLabels && (
          <span className="text-sm font-medium text-gray-600">AI Model:</span>
        )}
        
        <div className="flex items-center border rounded-lg p-1 bg-gray-50">
          {models.map((model) => {
            const Icon = model.icon;
            const isActive = currentModel === model.id;
            const isLoadingThis = isLoading && !isActive;
            
            return (
              <Tooltip key={model.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`
                      px-3 py-1.5 h-auto rounded-md transition-all duration-200
                      ${isActive 
                        ? model.activeColor
                        : model.color
                      }
                      ${disabled || isLoadingThis ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                    style={isActive && model.customActiveStyle ? model.customActiveStyle : undefined}
                    onClick={() => handleModelSwitch(model.id)}
                    disabled={disabled || isLoadingThis}
                  >
                    <Icon className="w-4 h-4 mr-1.5" />
                    <span className="text-xs font-medium">{model.name}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-sm">{model.description}</p>
                  {isActive && (
                    <p className="text-xs text-gray-500 mt-1">Currently selected</p>
                  )}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        
        {isLoading && (
          <div className="text-xs text-gray-500 animate-pulse">
            Switching models...
          </div>
        )}
      </div>
    </TooltipProvider>
  );
} 