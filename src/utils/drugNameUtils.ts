// Helper function to normalize drug names for display
export function normalizeDrugName(drugName: string): string {
  if (!drugName) return 'Unknown Drug';
  
  // Remove special formatting like capitals in middle of words
  return drugName
    .toLowerCase()
    .replace(/([a-z])([A-Z])/g, '$1$2') // Handle camelCase
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

// Helper function to capitalize first letter of each word for display
export function formatDrugNameForDisplay(drugName: string): string {
  const normalized = normalizeDrugName(drugName);
  return normalized
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
} 