export function updateManifest(version: string, signature: string, repository: string, notes?: string): { version: string; notes: string; pub_date: string; platforms: Record<string, { signature: string; url: string }> };
export function advancesFeed(current: string | undefined, next: string): boolean;
