export default interface TOCItem {
  label: string;
  href: string;
  path: string;
}

export interface TOCSection {
  id: string;     // Unique identifier for the section
  title: string;  // Section title
  content: string; // Section content
  path: string;    // File path to the section
  href: string;    // Original href from the TOC
}