export interface RxNormDisplayTerm {
  id: string;
  name: string;
}

/**
 * Fetches display terms from the RxNorm API for autocompletion.
 * Returns a large list of drug names, brands, and synonyms.
 * Docs: https://lhncbc.nlm.nih.gov/RxNav/APIs/api-RxNorm.getDisplayTerms.html
 */
export async function fetchRxNormDisplayTerms(): Promise<RxNormDisplayTerm[]> {
  const url = 'https://rxnav.nlm.nih.gov/REST/displaynames.json';
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch RxNorm display terms');
  }
  const data = await response.json();
  console.log("RxNorm API data:", data); // Debug log
  // The structure is: { rxnormdata: { displayTermsList: { term: [ ... ] } } }
  const terms: string[] = data?.rxnormdata?.displayTermsList?.term || [];
  console.log("Extracted terms:", terms); // Debug log
  return terms.map((term) => ({ id: term, name: term }));
} 