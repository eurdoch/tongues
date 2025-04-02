export type ElementNode = {
  type: string;
  props?: Record<string, any>;
  children?: (ElementNode | string)[];
  parent?: ElementNode; // Reference to parent element for nested structure
  navId?: string | null; // ID from the navigation point in TOC
};
