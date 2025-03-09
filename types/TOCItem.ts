export default interface TOCItem {
  label: string;
  href: string;
  path: string;
}

export interface TOCSection {
  title: string;
  content: string;
  path: string;
  href: string;
}