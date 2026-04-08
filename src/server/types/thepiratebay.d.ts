declare module 'thepiratebay' {
  export interface SearchResult {
    name: string;
    size: string;
    seeders: number;
    leechers: number;
    magnet: string;
    category: {
      id: string;
      name: string;
    };
  }

  export interface SearchOptions {
    category?: number | string | 'music' | 'movies' | 'tv' | 'games' | 'apps' | 'other';
    sortBy?: 'name' | 'date' | 'size' | 'seeds' | 'leeches';
    orderBy?: 'desc' | 'asc';
    filter?: {
      verified?: boolean;
    };
    page?: number;
  }

  const tpb: {
    search: (query: string, options?: SearchOptions) => Promise<SearchResult[]>;
  };

  export default tpb;
}
