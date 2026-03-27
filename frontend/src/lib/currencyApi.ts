// Utility to fetch real-time currency conversion rates
// Uses exchangerate.host (free, no API key required)

export async function fetchConversionRate(from: string, to: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.exchangerate.host/convert?from=${from}&to=${to}`);
    const data = await res.json();
    // The correct field is data.result (not data.info.rate)
    if (data && typeof data.result === 'number') {
      return data.result;
    }
    return null;
  } catch (e) {
    return null;
  }
}
