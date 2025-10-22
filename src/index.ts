/**
 * Shogun Faircamp - Static Site Generator for Musicians
 * Main entry point for programmatic usage
 */

import { CatalogParser } from './parser/catalogParser.js';
import { SiteGenerator } from './generator/siteGenerator.js';
import { BuildOptions } from './types/index.js';

export class Selfcamp {
  private options: BuildOptions;
  
  constructor(options: BuildOptions) {
    this.options = options;
  }
  
  async build(): Promise<void> {
    console.log('🎵 Shogun Faircamp - Static Site Generator');
    console.log('===========================================\n');
    
    try {
      // Parse catalog
      const parser = new CatalogParser(this.options.inputDir);
      const catalog = await parser.parse();
      
      // Generate site
      const generator = new SiteGenerator(catalog, this.options);
      await generator.generate();
      
      console.log('\n🎉 Build complete!');
    } catch (error) {
      console.error('\n❌ Build failed:', error);
      throw error;
    }
  }
}

// Export types
export * from './types/index.js';

