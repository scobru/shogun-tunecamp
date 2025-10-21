import Handlebars from "handlebars";
import { readFile } from "../utils/fileUtils.js";
import { formatDuration, getAudioFormat } from "../utils/audioUtils.js";
import path from "path";

/**
 * Handlebars template engine with helpers
 */
export class TemplateEngine {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    this.registerHelpers();
  }

  private registerHelpers() {
    // Format duration helper
    Handlebars.registerHelper("formatDuration", (seconds?: number) => {
      return formatDuration(seconds);
    });

    // Format audio format helper
    Handlebars.registerHelper("formatAudioFormat", (filename: string) => {
      return getAudioFormat(filename);
    });

    // Format date helper
    Handlebars.registerHelper("formatDate", (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    });

    // Conditional helper
    Handlebars.registerHelper("eq", (a: any, b: any) => {
      return a === b;
    });

    // Array join helper
    Handlebars.registerHelper("join", (array: any[], separator: string) => {
      return array ? array.join(separator) : "";
    });
  }

  async loadTemplate(templatePath: string, name: string): Promise<void> {
    const content = await readFile(templatePath);
    const template = Handlebars.compile(content);
    this.templates.set(name, template);
  }

  render(templateName: string, data: any): string {
    const template = this.templates.get(templateName);

    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    return template(data);
  }

  renderWithLayout(
    templateName: string,
    data: any,
    pageTitle?: string
  ): string {
    // First render the content template
    const content = this.render(templateName, data);

    // Then wrap it in the layout
    if (this.hasTemplate("layout")) {
      return this.render("layout", {
        ...data,
        content,
        pageTitle,
      });
    }

    // If no layout, return content as-is
    return content;
  }

  hasTemplate(templateName: string): boolean {
    return this.templates.has(templateName);
  }
}
