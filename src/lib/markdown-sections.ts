export interface Section {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  startLine: number;
  endLine: number;
  content: string;
}

export function parseSections(markdown: string): Section[] {
  const lines = markdown.split('\n');
  const sections: Section[] = [];
  let currentSection: Partial<Section> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,3})\s+(.+)$/);

    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const title = match[2].trim();

      if (currentSection) {
        currentSection.endLine = i - 1;
        currentSection.content = lines.slice(currentSection.startLine!, i).join('\n');
        sections.push(currentSection as Section);
      }

      currentSection = {
        id: `section-${sections.length}`,
        level,
        title,
        startLine: i,
        endLine: -1,
        content: '',
      };
    }
  }

  if (currentSection) {
    currentSection.endLine = lines.length - 1;
    currentSection.content = lines.slice(currentSection.startLine!, lines.length).join('\n');
    sections.push(currentSection as Section);
  }

  if (sections.length === 0 && markdown.trim()) {
    sections.push({
      id: 'section-0',
      level: 1,
      title: 'Content',
      startLine: 0,
      endLine: lines.length - 1,
      content: markdown,
    });
  }

  return sections;
}

export function replaceSection(markdown: string, sectionId: string, newContent: string): string {
  const sections = parseSections(markdown);
  const section = sections.find(s => s.id === sectionId);
  if (!section) return markdown;

  const lines = markdown.split('\n');
  const before = lines.slice(0, section.startLine);
  const after = lines.slice(section.endLine + 1);

  return [...before, newContent, ...after].join('\n');
}
