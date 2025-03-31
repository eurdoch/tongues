export type ElementNode = {
  type: string;
  props?: Record<string, any>;
  children?: (ElementNode | string)[];
  parent?: ElementNode; // Reference to parent element for nested structure
};
