import { Badge } from "@/components/ui/badge";
import { Brain, Stethoscope } from "lucide-react";
import { ModelType } from "@/hooks/use-openai-assistant";

interface MessageBadgeProps {
  modelType: ModelType;
  size?: "sm" | "xs";
}

export function MessageBadge({ modelType, size = "xs" }: MessageBadgeProps) {
  const models = {
    txagent: {
      name: "TxAgent",
      icon: Stethoscope,
      className: "bg-green-100 text-green-700 border-green-200"
    },
    openai: {
      name: "GPT-4o",
      icon: Brain,
      className: "bg-blue-100 text-blue-700 border-blue-200"
    }
  };

  const model = models[modelType];
  const Icon = model.icon;
  const iconSize = size === "xs" ? "w-3 h-3" : "w-4 h-4";
  const textSize = size === "xs" ? "text-xs" : "text-sm";

  return (
    <Badge 
      variant="outline" 
      className={`
        ${model.className} 
        ${textSize} 
        px-1.5 py-0.5 
        font-medium 
        inline-flex 
        items-center 
        gap-1
        border
      `}
    >
      <Icon className={iconSize} />
      {model.name}
    </Badge>
  );
} 